import { Router } from 'express';
import { q } from '../db/pool.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { audit } from '../services/audit.js';
import { emitFlight, emitGlobal } from '../services/live.js';
import { flightManifestXlsx, flightManifestPdf } from '../services/exports.js';

const router = Router();
router.use(authRequired);

const FLIGHT_COLS = `f.*, a.code AS aircraft_code, a.model AS aircraft_model, a.total_seats,
  (SELECT count(*) FROM passengers p WHERE p.flight_id = f.id AND p.status <> 'OFFLOADED' AND NOT p.waitlisted) AS pax_total,
  (SELECT count(*) FROM passengers p WHERE p.flight_id = f.id AND p.status IN ('CHECKED_IN','SECURITY_PASSED','BOARDED')) AS pax_checked,
  (SELECT count(*) FROM passengers p WHERE p.flight_id = f.id AND p.status = 'BOARDED') AS pax_boarded,
  (SELECT count(*) FROM baggage b WHERE b.flight_id = f.id) AS bag_count,
  (SELECT COALESCE(sum(b.weight_kg),0) FROM baggage b WHERE b.flight_id = f.id) AS bag_weight`;

// Allowed lifecycle transitions
const TRANSITIONS = {
  SCHEDULED: ['CHECKIN_OPEN', 'CANCELLED'],
  CHECKIN_OPEN: ['BOARDING', 'SCHEDULED', 'CANCELLED'],
  BOARDING: ['DEPARTED', 'CHECKIN_OPEN', 'CANCELLED'],
  DEPARTED: [],
  CANCELLED: ['SCHEDULED'],
};

router.get('/', async (req, res) => {
  const { status, date_from, date_to, qtext } = req.query;
  const cond = [];
  const params = [];
  if (status) { params.push(status); cond.push(`f.status = $${params.length}`); }
  if (date_from) { params.push(date_from); cond.push(`f.departure_ts >= $${params.length}::date`); }
  if (date_to) { params.push(date_to); cond.push(`f.departure_ts < ($${params.length}::date + interval '1 day')`); }
  if (qtext) { params.push(`%${qtext}%`); cond.push(`(f.flight_number ILIKE $${params.length} OR f.charter_code ILIKE $${params.length})`); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const { rows } = await q(
    `SELECT ${FLIGHT_COLS} FROM flights f JOIN aircraft_types a ON a.id = f.aircraft_type_id
     ${where} ORDER BY f.departure_ts DESC LIMIT 500`,
    params
  );
  res.json({ flights: rows });
});

router.post('/', requireRole('manager'), async (req, res) => {
  const {
    flight_number, charter_code, aircraft_type_id, origin_code, origin_name,
    dest_code, dest_name, direction, departure_ts, arrival_ts, gate, notes,
  } = req.body || {};
  if (!flight_number || !aircraft_type_id || !origin_code || !dest_code || !departure_ts) {
    return res.status(400).json({ error: 'flight_number, aircraft_type_id, origin_code, dest_code, departure_ts шаардлагатай' });
  }
  if (origin_code === dest_code) return res.status(400).json({ error: 'Хөөрөх, буух буудал ижил байж болохгүй' });
  if (arrival_ts && new Date(arrival_ts) <= new Date(departure_ts)) {
    return res.status(400).json({ error: 'Буух цаг нь хөөрөх цагаас хойно байх ёстой' });
  }
  try {
    const { rows } = await q(
      `INSERT INTO flights (flight_number, charter_code, aircraft_type_id, origin_code, origin_name,
         dest_code, dest_name, direction, departure_ts, arrival_ts, gate, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [flight_number.toUpperCase().trim(), charter_code?.toUpperCase().trim() || null, aircraft_type_id,
       origin_code, origin_name || origin_code, dest_code, dest_name || dest_code,
       direction || null, departure_ts, arrival_ts || null, gate || null, notes || null, req.user.id]
    );
    await audit(req, 'FLIGHT_CREATED', 'flight', rows[0].id, { flight_number, departure_ts });
    emitGlobal('flight:update', { flight: rows[0] });
    res.status(201).json({ flight: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Энэ дугаартай нислэг тухайн цагт бүртгэлтэй байна' });
    throw err;
  }
});

router.get('/:id', async (req, res) => {
  const { rows } = await q(
    `SELECT ${FLIGHT_COLS}, a.seat_map, a.assignment_sequence
       FROM flights f JOIN aircraft_types a ON a.id = f.aircraft_type_id WHERE f.id = $1`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Нислэг олдсонгүй' });
  res.json({ flight: rows[0] });
});

router.put('/:id', requireRole('manager'), async (req, res) => {
  const allowed = ['flight_number', 'charter_code', 'aircraft_type_id', 'origin_code', 'origin_name',
    'dest_code', 'dest_name', 'direction', 'departure_ts', 'arrival_ts', 'gate', 'notes'];
  const sets = [];
  const params = [req.params.id];
  for (const key of allowed) {
    if (key in (req.body || {})) {
      params.push(req.body[key]);
      sets.push(`${key} = $${params.length}`);
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'Өөрчлөх талбар алга' });
  const { rows } = await q(
    `UPDATE flights SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 RETURNING *`,
    params
  );
  if (!rows[0]) return res.status(404).json({ error: 'Нислэг олдсонгүй' });
  await audit(req, 'FLIGHT_UPDATED', 'flight', req.params.id, req.body);
  emitFlight(req.params.id, 'flight:update', { flight: rows[0] });
  res.json({ flight: rows[0] });
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  const { rows: pax } = await q(
    `SELECT count(*) AS n FROM passengers WHERE flight_id = $1 AND status <> 'PENDING'`,
    [req.params.id]
  );
  if (Number(pax[0].n) > 0) {
    return res.status(400).json({ error: 'Бүртгүүлсэн зорчигчтой нислэгийг устгах боломжгүй. Эхлээд цуцлана уу.' });
  }
  const { rows } = await q('DELETE FROM flights WHERE id = $1 RETURNING id, flight_number', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Нислэг олдсонгүй' });
  await audit(req, 'FLIGHT_DELETED', 'flight', req.params.id, { flight_number: rows[0].flight_number });
  emitGlobal('flight:removed', { flightId: req.params.id });
  res.json({ ok: true });
});

router.post('/:id/status', requireRole('agent'), async (req, res) => {
  const { status } = req.body || {};
  const { rows: cur } = await q('SELECT status FROM flights WHERE id = $1', [req.params.id]);
  if (!cur[0]) return res.status(404).json({ error: 'Нислэг олдсонгүй' });
  if (!TRANSITIONS[cur[0].status]?.includes(status)) {
    return res.status(400).json({ error: `${cur[0].status} → ${status} шилжилт боломжгүй` });
  }
  const { rows } = await q(
    'UPDATE flights SET status = $2, updated_at = now() WHERE id = $1 RETURNING *',
    [req.params.id, status]
  );
  await audit(req, 'FLIGHT_STATUS', 'flight', req.params.id, { from: cur[0].status, to: status });
  emitFlight(req.params.id, 'flight:update', { flight: rows[0] });
  res.json({ flight: rows[0] });
});

router.post('/:id/delay', requireRole('manager'), async (req, res) => {
  const minutes = parseInt(req.body?.minutes, 10);
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 24 * 60) {
    return res.status(400).json({ error: 'Хойшлуулах минут 0–1440 хооронд байна' });
  }
  const { rows } = await q(
    'UPDATE flights SET delay_minutes = $2, delay_reason = $3, updated_at = now() WHERE id = $1 RETURNING *',
    [req.params.id, minutes, req.body?.reason || null]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Нислэг олдсонгүй' });
  await audit(req, 'FLIGHT_DELAY', 'flight', req.params.id, { minutes, reason: req.body?.reason });
  emitFlight(req.params.id, 'flight:update', { flight: rows[0], delay: true });
  res.json({ flight: rows[0] });
});

router.get('/:id/passengers', async (req, res) => {
  const { rows } = await q(
    `SELECT p.*,
       (SELECT count(*) FROM baggage b WHERE b.passenger_id = p.id) AS bag_count,
       (SELECT COALESCE(sum(b.weight_kg),0) FROM baggage b WHERE b.passenger_id = p.id) AS bag_weight
     FROM passengers p WHERE p.flight_id = $1
     ORDER BY p.waitlisted, p.seq NULLS LAST, p.full_name`,
    [req.params.id]
  );
  res.json({ passengers: rows });
});

router.get('/:id/seatmap', async (req, res) => {
  const { rows } = await q(
    `SELECT a.seat_map, a.assignment_sequence, a.code, a.model
       FROM flights f JOIN aircraft_types a ON a.id = f.aircraft_type_id WHERE f.id = $1`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Нислэг олдсонгүй' });
  const { rows: occupied } = await q(
    `SELECT seat, full_name, status, pnr FROM passengers
      WHERE flight_id = $1 AND seat IS NOT NULL AND status <> 'OFFLOADED'`,
    [req.params.id]
  );
  res.json({ ...rows[0], occupied });
});

async function loadFlightWithPax(id) {
  const { rows: frows } = await q(
    `SELECT ${FLIGHT_COLS} FROM flights f JOIN aircraft_types a ON a.id = f.aircraft_type_id WHERE f.id = $1`,
    [id]
  );
  if (!frows[0]) return null;
  const { rows: pax } = await q(
    `SELECT p.*,
       (SELECT count(*) FROM baggage b WHERE b.passenger_id = p.id) AS bag_count,
       (SELECT COALESCE(sum(b.weight_kg),0) FROM baggage b WHERE b.passenger_id = p.id) AS bag_weight
     FROM passengers p WHERE p.flight_id = $1 AND p.status <> 'OFFLOADED'
     ORDER BY p.waitlisted, p.seq NULLS LAST, p.full_name`,
    [id]
  );
  return { flight: frows[0], pax };
}

router.get('/:id/manifest.xlsx', async (req, res) => {
  const data = await loadFlightWithPax(req.params.id);
  if (!data) return res.status(404).json({ error: 'Нислэг олдсонгүй' });
  const buf = await flightManifestXlsx(data.flight, data.pax);
  await audit(req, 'EXPORT_MANIFEST_XLSX', 'flight', req.params.id, {});
  res.setHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('content-disposition', `attachment; filename="${data.flight.flight_number}_manifest.xlsx"`);
  res.send(Buffer.from(buf));
});

router.get('/:id/manifest.pdf', async (req, res) => {
  const data = await loadFlightWithPax(req.params.id);
  if (!data) return res.status(404).json({ error: 'Нислэг олдсонгүй' });
  await audit(req, 'EXPORT_MANIFEST_PDF', 'flight', req.params.id, {});
  res.setHeader('content-type', 'application/pdf');
  res.setHeader('content-disposition', `attachment; filename="${data.flight.flight_number}_manifest.pdf"`);
  flightManifestPdf(data.flight, data.pax, res);
});

export default router;
