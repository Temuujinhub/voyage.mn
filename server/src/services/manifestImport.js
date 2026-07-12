import { q, tx } from '../db/pool.js';
import { parseManifestXlsx, normalizeCharterCode } from './manifestParser.js';
import { getSettings } from './settings.js';
import { uniquePnr } from './pnr.js';
import { emitFlight } from './live.js';
import { upsertPerson, refreshFlightCounts } from './people.js';

export const paxKey = (employeeId, fullName) =>
  employeeId ? `e:${String(employeeId)}` : `n:${String(fullName || '').toLowerCase()}`;

// Pure revision diff: compare the flight's current passenger rows with the
// incoming manifest rows. Exported separately so it is unit-testable.
export function diffManifest(existing, incoming) {
  const byKey = new Map();
  for (const p of existing) byKey.set(paxKey(p.employee_id, p.full_name), p);

  const matched = [];   // active row present again (may carry field changes)
  const restored = [];  // row removed by an earlier revision, now back
  const added = [];     // brand new person
  const changed = [];   // matched rows whose contact/waitlist data moved
  const seen = new Set();

  for (const next of incoming) {
    const prev = byKey.get(paxKey(next.employeeId, next.fullName));
    if (!prev) { added.push(next); continue; }
    seen.add(prev.id);
    (prev.active === false ? restored : matched).push({ prev, next });
    const fields = [];
    if (next.phone && prev.phone && next.phone !== prev.phone) fields.push('phone');
    if (Boolean(next.waitlisted) !== Boolean(prev.waitlisted)) fields.push('waitlisted');
    if (fields.length) changed.push({ name: next.fullName, employee_id: next.employeeId || null, fields });
  }

  // active rows that the new revision no longer contains
  const removed = existing.filter((p) => p.active !== false && !seen.has(p.id));
  return { matched, restored, added, removed, changed };
}

// Match a parsed manifest header against a flight: transport number equals the
// flight's charter code and the departure date (UB local) matches.
export async function findMatchingFlight(header) {
  if (!header.transportNumber || !header.departureDate) return null;
  const { rows } = await q(
    `SELECT f.*, a.code AS aircraft_code, a.total_seats
       FROM flights f JOIN aircraft_types a ON a.id = f.aircraft_type_id
      WHERE upper(replace(replace(f.charter_code,'_',' '),'-',' ')) =
            upper(replace(replace($1,'_',' '),'-',' '))
        AND (f.departure_ts AT TIME ZONE 'Asia/Ulaanbaatar')::date = $2::date
        AND f.status <> 'CANCELLED'
      ORDER BY f.departure_ts`,
    [normalizeCharterCode(header.transportNumber), header.departureDate]
  );
  if (rows.length <= 1) return rows[0] || null;
  // several rotations of the same transport number that day — pick by direction, then ETD
  const byDir = rows.filter((f) => !header.direction || f.direction === header.direction);
  const pool = byDir.length ? byDir : rows;
  if (header.etd) {
    const target = parseInt(header.etd, 10);
    pool.sort((a, b) => {
      const t = (f) => {
        const d = new Date(f.departure_ts);
        const loc = new Date(d.getTime() + 8 * 3600e3);
        return Math.abs(loc.getUTCHours() * 100 + loc.getUTCMinutes() - target);
      };
      return t(a) - t(b);
    });
  }
  return pool[0];
}

export function checkWindow(departureTs, windowCfg, now = new Date()) {
  const dep = new Date(departureTs).getTime();
  const hoursLeft = (dep - now.getTime()) / 3600e3;
  if (hoursLeft < windowCfg.min_hours_before) {
    return {
      ok: false,
      hoursLeft,
      reason: `Нислэг хөөрөхөд ${hoursLeft.toFixed(1)} цаг үлдсэн: manifest хүлээн авах хугацаа дууссан (доод хязгаар ${windowCfg.min_hours_before} цаг)`,
    };
  }
  if (hoursLeft > windowCfg.max_hours_before) {
    return {
      ok: false,
      hoursLeft,
      reason: `Нислэг хөөрөхөд ${hoursLeft.toFixed(1)} цаг байна: manifest-ийг нислэгээс өмнөх ${windowCfg.max_hours_before} цагийн дотор илгээнэ`,
    };
  }
  return { ok: true, hoursLeft };
}

export async function importManifest(buffer, { source, filename, userId = null, emailFrom = null, emailSubject = null, force = false }) {
  const settings = await getSettings();
  const warnings = [];
  let header = {};
  let flight = null;

  const reject = async (error) => {
    const { rows } = await q(
      `INSERT INTO manifests (flight_id, source, filename, status, passenger_count, error, warnings, header_meta, email_from, email_subject, imported_by)
       VALUES ($1,$2,$3,'REJECTED',0,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [flight?.id || null, source, filename, error, JSON.stringify(warnings), JSON.stringify(header), emailFrom, emailSubject, userId]
    );
    return { ok: false, error, manifest: rows[0], flight };
  };

  let parsed;
  try {
    parsed = await parseManifestXlsx(buffer);
  } catch (err) {
    return reject(`Файл уншихад алдаа: ${err.message}`);
  }
  header = parsed.header;
  const { passengers } = parsed;

  flight = await findMatchingFlight(header);
  if (!flight) {
    return reject(
      `Тохирох нислэг олдсонгүй: transport "${header.transportNumber || '?'}", огноо ${header.departureDate || '?'}. Нислэгийн кодоо шалгана уу.`
    );
  }

  const win = checkWindow(flight.departure_ts, settings.manifest_window);
  if (!win.ok && !force) return reject(win.reason);
  if (!win.ok && force) warnings.push(`Хугацааны хязгаарыг гараар алгасав: ${win.reason}`);

  if (header.direction && flight.direction && header.direction !== flight.direction) {
    warnings.push(`Чиглэл зөрүүтэй: manifest=${header.direction}, нислэг=${flight.direction}`);
  }
  if (header.passengerCount && header.passengerCount + (header.waitlistCount || 0) > flight.total_seats) {
    warnings.push(
      `Зорчигчийн тоо (${header.passengerCount}+${header.waitlistCount || 0} WL) онгоцны суудлаас (${flight.total_seats}) их байна`
    );
  }

  const result = await tx(async (client) => {
    const { rows: existing } = await client.query(
      'SELECT * FROM passengers WHERE flight_id = $1', [flight.id]
    );
    const d = diffManifest(existing, passengers);
    const personIds = [];

    // brand-new passengers
    const addedNames = [];
    for (const p of d.added) {
      const personId = await upsertPerson(client, p);
      if (personId) personIds.push(personId);
      const pnr = await uniquePnr(flight.id);
      await client.query(
        `INSERT INTO passengers (flight_id, seq, pnr, title, full_name, company, department, position,
           cost_center, employee_id, phone, pickup_address, waitlisted, person_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [flight.id, p.seq, pnr, p.title, p.fullName, p.company, p.department, p.position,
         p.costCenter, p.employeeId, p.phone, p.pickupAddress, p.waitlisted, personId]
      );
      addedNames.push({ name: p.fullName, employee_id: p.employeeId || null });
    }

    // returning rows: refresh manifest fields; restored rows come back active
    for (const { prev, next } of [...d.matched, ...d.restored]) {
      const personId = await upsertPerson(client, next);
      if (personId) personIds.push(personId);
      await client.query(
        `UPDATE passengers SET seq=$2, title=$3, full_name=$4, company=$5, department=$6, position=$7,
           cost_center=$8, employee_id=COALESCE($9, employee_id), phone=COALESCE($10, phone),
           pickup_address=$11, waitlisted=$12, active=TRUE, removed_manifest_id=NULL,
           person_id=COALESCE($13, person_id), updated_at=now()
         WHERE id=$1`,
        [prev.id, next.seq, next.title, next.fullName, next.company, next.department, next.position,
         next.costCenter, next.employeeId, next.phone, next.pickupAddress, next.waitlisted, personId]
      );
    }

    // the new manifest row: next revision number, becomes the active one
    const { rows: vrow } = await client.query(
      `SELECT COALESCE(MAX(version), 0) + 1 AS v FROM manifests WHERE flight_id = $1 AND status = 'ACCEPTED'`,
      [flight.id]
    );
    const version = vrow[0].v;
    await client.query(
      `UPDATE manifests SET is_active = FALSE WHERE flight_id = $1 AND is_active`, [flight.id]
    );

    // dropped passengers: soft-remove (records are kept for the audit trail),
    // but never auto-remove someone who is already past check-in
    const removable = [], kept = [];
    for (const p of d.removed) {
      if (p.status === 'PENDING') removable.push(p);
      else {
        kept.push(p);
        warnings.push(`${p.full_name} шинэ manifest-д алга, гэхдээ аль хэдийн ${p.status} тул хасаагүй`);
      }
    }

    const activeAfter = existing.length - removable.length
      - existing.filter((p) => p.active === false).length
      + d.added.length + d.restored.length;

    const diffJson = {
      added: addedNames,
      removed: removable.map((p) => ({ name: p.full_name, employee_id: p.employee_id || null })),
      kept_despite_removal: kept.map((p) => ({ name: p.full_name, status: p.status })),
      restored: d.restored.map(({ next }) => ({ name: next.fullName, employee_id: next.employeeId || null })),
      changed: d.changed,
      total_in_manifest: passengers.length,
      active_after: activeAfter,
    };

    const { rows: mrows } = await client.query(
      `INSERT INTO manifests (flight_id, source, filename, status, passenger_count, warnings, header_meta,
         email_from, email_subject, imported_by, version, is_active, diff)
       VALUES ($1,$2,$3,'ACCEPTED',$4,$5,$6,$7,$8,$9,$10,TRUE,$11) RETURNING *`,
      [flight.id, source, filename, passengers.length, JSON.stringify(warnings), JSON.stringify(header),
       emailFrom, emailSubject, userId, version, JSON.stringify(diffJson)]
    );

    for (const p of removable) {
      await client.query(
        `UPDATE passengers SET active = FALSE, removed_manifest_id = $2, updated_at = now() WHERE id = $1`,
        [p.id, mrows[0].id]
      );
    }

    await client.query('UPDATE passengers SET manifest_id = $1 WHERE flight_id = $2 AND manifest_id IS NULL', [mrows[0].id, flight.id]);
    await refreshFlightCounts(client, personIds);
    return {
      manifest: mrows[0],
      version,
      added: d.added.length,
      updated: d.matched.length,
      restored: d.restored.length,
      removed: removable.length,
      active_after: activeAfter,
      diff: diffJson,
    };
  });

  emitFlight(flight.id, 'manifest:imported', { flightId: flight.id, ...result });
  return { ok: true, flight, warnings, ...result };
}
