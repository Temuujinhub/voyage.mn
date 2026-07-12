import { Router } from 'express';
import QRCode from 'qrcode';
import { q } from '../db/pool.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { audit } from '../services/audit.js';
import { checkinPassenger, offloadPassenger, CheckinError } from '../services/checkin.js';
import { getSettings } from '../services/settings.js';
import { itf2of5Svg, licensePlate } from '../services/barcode.js';
import { uniquePnr } from '../services/pnr.js';
import { emitFlight } from '../services/live.js';

const router = Router();
router.use(authRequired);

router.get('/search', async (req, res) => {
  const { qtext, flight_id } = req.query;
  if (!qtext || String(qtext).length < 2) return res.json({ passengers: [] });
  const params = [`%${qtext}%`];
  let flightCond = '';
  if (flight_id) { params.push(flight_id); flightCond = `AND p.flight_id = $${params.length}`; }
  const { rows } = await q(
    `SELECT p.*, f.flight_number, f.origin_code, f.dest_code, f.departure_ts, f.status AS flight_status,
       (SELECT count(*) FROM baggage b WHERE b.passenger_id = p.id) AS bag_count
     FROM passengers p JOIN flights f ON f.id = p.flight_id
     WHERE (p.full_name ILIKE $1 OR p.employee_id ILIKE $1 OR p.pnr ILIKE $1 OR p.phone ILIKE $1)
       AND p.active
       ${flightCond}
     ORDER BY f.departure_ts DESC, p.full_name LIMIT 50`,
    params
  );
  res.json({ passengers: rows });
});

router.get('/:id', async (req, res) => {
  if (!/^[0-9a-f-]{36}$/.test(req.params.id)) return res.status(404).json({ error: 'Зорчигч олдсонгүй' });
  const { rows } = await q(
    `SELECT p.*, f.flight_number, f.origin_code, f.dest_code, f.departure_ts, f.status AS flight_status,
       (SELECT count(*) FROM baggage b WHERE b.passenger_id = p.id) AS bag_count
     FROM passengers p JOIN flights f ON f.id = p.flight_id WHERE p.id = $1`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Зорчигч олдсонгүй' });
  res.json({ passenger: rows[0] });
});

// Manual add (irregular ops) — manager+
router.post('/', requireRole('manager'), async (req, res) => {
  const { flight_id, full_name, title, company, employee_id, phone } = req.body || {};
  if (!flight_id || !full_name) return res.status(400).json({ error: 'flight_id, full_name шаардлагатай' });
  const pnr = await uniquePnr(flight_id);
  const { rows } = await q(
    `INSERT INTO passengers (flight_id, pnr, title, full_name, company, employee_id, phone)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [flight_id, pnr, title || null, full_name.trim(), company || null, employee_id || null, phone || null]
  );
  await audit(req, 'PASSENGER_ADDED', 'passenger', rows[0].id, { flight_id, full_name });
  emitFlight(flight_id, 'passenger:update', { flightId: flight_id, passenger: rows[0] });
  res.status(201).json({ passenger: rows[0] });
});

router.put('/:id', requireRole('manager'), async (req, res) => {
  const allowed = ['full_name', 'title', 'company', 'department', 'position', 'employee_id', 'phone'];
  const sets = [];
  const params = [req.params.id];
  for (const key of allowed) {
    if (key in (req.body || {})) { params.push(req.body[key]); sets.push(`${key} = $${params.length}`); }
  }
  if (!sets.length) return res.status(400).json({ error: 'Өөрчлөх талбар алга' });
  const { rows } = await q(
    `UPDATE passengers SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 RETURNING *`, params
  );
  if (!rows[0]) return res.status(404).json({ error: 'Зорчигч олдсонгүй' });
  await audit(req, 'PASSENGER_UPDATED', 'passenger', req.params.id, req.body);
  emitFlight(rows[0].flight_id, 'passenger:update', { flightId: rows[0].flight_id, passenger: rows[0] });
  res.json({ passenger: rows[0] });
});

// Counter check-in (agent): optional seat, baggage list
router.post('/:id/checkin', requireRole('agent'), async (req, res) => {
  const { seat, baggage } = req.body || {};
  const bags = Array.isArray(baggage) ? baggage.filter((b) => Number(b.weight_kg) > 0) : [];
  try {
    const result = await checkinPassenger({
      passengerId: req.params.id,
      requestedSeat: seat || null,
      baggage: bags,
      byUserId: req.user.id,
    });
    await audit(req, 'CHECKIN', 'passenger', req.params.id, {
      seat: result.passenger.seat, seat_method: result.seatMethod, bags: bags.length,
    });
    res.json(result);
  } catch (err) {
    if (err instanceof CheckinError) return res.status(400).json({ error: err.message, code: err.code });
    throw err;
  }
});

router.post('/:id/offload', requireRole('agent'), async (req, res) => {
  try {
    const pax = await offloadPassenger(req.params.id, req.user.id);
    await audit(req, 'OFFLOAD', 'passenger', req.params.id, {});
    res.json({ passenger: pax });
  } catch (err) {
    if (err instanceof CheckinError) return res.status(400).json({ error: err.message, code: err.code });
    throw err;
  }
});

// Add a bag after check-in (e.g. self-checked-in passenger dropping baggage)
router.post('/:id/baggage', requireRole('agent'), async (req, res) => {
  const weight = Number(req.body?.weight_kg) || 0;
  if (weight <= 0 || weight > 200) return res.status(400).json({ error: 'Ачааны жин 0–200кг хооронд байна' });
  const { rows: prow } = await q('SELECT * FROM passengers WHERE id = $1', [req.params.id]);
  const pax = prow[0];
  if (!pax) return res.status(404).json({ error: 'Зорчигч олдсонгүй' });
  if (pax.status === 'PENDING' || pax.status === 'OFFLOADED') {
    return res.status(400).json({ error: 'Эхлээд check-in хийнэ үү' });
  }
  const settings = await getSettings();
  const { rows: ser } = await q(`SELECT nextval('baggage_serial_seq') AS s`);
  const tag = licensePlate(settings.airline.numeric_code, ser[0].s);
  const excess = Math.max(0, weight - settings.baggage.free_allowance_kg);
  const { rows } = await q(
    `INSERT INTO baggage (passenger_id, flight_id, tag_number, weight_kg, excess_kg, excess_fee, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [pax.id, pax.flight_id, tag, weight, excess, excess * settings.baggage.excess_fee_per_kg, req.user.id]
  );
  await q('UPDATE passengers SET baggage_pending = FALSE, updated_at = now() WHERE id = $1', [pax.id]);
  await audit(req, 'BAGGAGE_ADDED', 'baggage', rows[0].id, { passenger_id: pax.id, weight, tag });
  emitFlight(pax.flight_id, 'passenger:update', { flightId: pax.flight_id, passenger: { ...pax, baggage_pending: false } });
  res.status(201).json({ baggage: rows[0] });
});

router.post('/baggage/:bagId/paid', requireRole('agent'), async (req, res) => {
  const { rows } = await q(
    'UPDATE baggage SET fee_paid = TRUE WHERE id = $1 RETURNING *', [req.params.bagId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Ачаа олдсонгүй' });
  await audit(req, 'BAGGAGE_FEE_PAID', 'baggage', req.params.bagId, { fee: rows[0].excess_fee });
  res.json({ baggage: rows[0] });
});

router.delete('/baggage/:bagId', requireRole('agent'), async (req, res) => {
  const { rows } = await q('DELETE FROM baggage WHERE id = $1 RETURNING *', [req.params.bagId]);
  if (!rows[0]) return res.status(404).json({ error: 'Ачаа олдсонгүй' });
  await audit(req, 'BAGGAGE_REMOVED', 'baggage', req.params.bagId, { tag: rows[0].tag_number });
  res.json({ ok: true });
});

async function boardingPassData(passengerId) {
  const { rows } = await q(
    `SELECT p.*, f.flight_number, f.charter_code, f.origin_code, f.origin_name, f.dest_code, f.dest_name,
            f.departure_ts, f.arrival_ts, f.gate, f.status AS flight_status, f.delay_minutes, f.delay_reason,
            a.model AS aircraft_model, a.code AS aircraft_code
       FROM passengers p
       JOIN flights f ON f.id = p.flight_id
       JOIN aircraft_types a ON a.id = f.aircraft_type_id
      WHERE p.id = $1`,
    [passengerId]
  );
  const pax = rows[0];
  if (!pax || !pax.qr_token) return null;
  const settings = await getSettings();
  const qrDataUrl = await QRCode.toDataURL(pax.qr_token, { errorCorrectionLevel: 'M', margin: 1, width: 320 });
  const { rows: bags } = await q('SELECT * FROM baggage WHERE passenger_id = $1 ORDER BY created_at', [passengerId]);
  return {
    passenger: pax,
    airline: settings.airline,
    qrDataUrl,
    baggage: bags,
  };
}

router.get('/:id/boarding-pass', async (req, res) => {
  const data = await boardingPassData(req.params.id);
  if (!data) return res.status(404).json({ error: 'Boarding pass олдсонгүй — эхлээд check-in хийнэ үү' });
  res.json(data);
});

router.get('/:id/baggage-tags', async (req, res) => {
  const { rows } = await q(
    `SELECT b.*, p.full_name, p.title, p.pnr, p.seat, f.flight_number, f.charter_code,
            f.origin_code, f.dest_code, f.dest_name, f.departure_ts
       FROM baggage b
       JOIN passengers p ON p.id = b.passenger_id
       JOIN flights f ON f.id = b.flight_id
      WHERE b.passenger_id = $1 ORDER BY b.created_at`,
    [req.params.id]
  );
  const tags = rows.map((b) => ({ ...b, barcodeSvg: itf2of5Svg(b.tag_number, { height: 70, narrow: 2.4 }) }));
  res.json({ tags });
});

router.post('/baggage/:bagId/printed', requireRole('agent'), async (req, res) => {
  await q('UPDATE baggage SET printed_at = now() WHERE id = $1', [req.params.bagId]);
  await audit(req, 'BAGGAGE_TAG_PRINTED', 'baggage', req.params.bagId, {});
  res.json({ ok: true });
});

export default router;
