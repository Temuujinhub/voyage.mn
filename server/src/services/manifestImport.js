import { q, tx } from '../db/pool.js';
import { parseManifestXlsx, normalizeCharterCode } from './manifestParser.js';
import { getSettings } from './settings.js';
import { uniquePnr } from './pnr.js';
import { emitFlight } from './live.js';

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
    const byKey = new Map();
    for (const p of existing) {
      byKey.set(p.employee_id ? `e:${p.employee_id}` : `n:${p.full_name.toLowerCase()}`, p);
    }

    let added = 0, updated = 0, removed = 0;
    const seenIds = new Set();

    for (const p of passengers) {
      const key = p.employeeId ? `e:${p.employeeId}` : `n:${p.fullName.toLowerCase()}`;
      const prev = byKey.get(key);
      if (prev) {
        seenIds.add(prev.id);
        await client.query(
          `UPDATE passengers SET seq=$2, title=$3, full_name=$4, company=$5, department=$6, position=$7,
             cost_center=$8, employee_id=COALESCE($9, employee_id), phone=COALESCE($10, phone),
             pickup_address=$11, waitlisted=$12, updated_at=now()
           WHERE id=$1`,
          [prev.id, p.seq, p.title, p.fullName, p.company, p.department, p.position,
           p.costCenter, p.employeeId, p.phone, p.pickupAddress, p.waitlisted]
        );
        updated++;
      } else {
        const pnr = await uniquePnr(flight.id);
        const { rows: ins } = await client.query(
          `INSERT INTO passengers (flight_id, seq, pnr, title, full_name, company, department, position,
             cost_center, employee_id, phone, pickup_address, waitlisted)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
          [flight.id, p.seq, pnr, p.title, p.fullName, p.company, p.department, p.position,
           p.costCenter, p.employeeId, p.phone, p.pickupAddress, p.waitlisted]
        );
        seenIds.add(ins[0].id);
        added++;
      }
    }

    // passengers dropped from the new manifest: remove if still PENDING, warn otherwise
    for (const p of existing) {
      if (seenIds.has(p.id)) continue;
      if (p.status === 'PENDING') {
        await client.query('DELETE FROM passengers WHERE id = $1', [p.id]);
        removed++;
      } else {
        warnings.push(`${p.full_name} шинэ manifest-д алга, гэхдээ аль хэдийн ${p.status} тул хасаагүй`);
      }
    }

    const { rows: mrows } = await client.query(
      `INSERT INTO manifests (flight_id, source, filename, status, passenger_count, warnings, header_meta, email_from, email_subject, imported_by)
       VALUES ($1,$2,$3,'ACCEPTED',$4,$5,$6,$7,$8,$9) RETURNING *`,
      [flight.id, source, filename, passengers.length, JSON.stringify(warnings), JSON.stringify(header), emailFrom, emailSubject, userId]
    );
    await client.query('UPDATE passengers SET manifest_id = $1 WHERE flight_id = $2 AND manifest_id IS NULL', [mrows[0].id, flight.id]);
    return { manifest: mrows[0], added, updated, removed };
  });

  emitFlight(flight.id, 'manifest:imported', { flightId: flight.id, ...result });
  return { ok: true, flight, warnings, ...result };
}
