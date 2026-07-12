import { Router } from 'express';
import { q } from '../db/pool.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { audit } from '../services/audit.js';
import { opsReportXlsx } from '../services/exports.js';

const router = Router();
router.use(authRequired);

const FLIGHT_STATS = `
  SELECT f.*, a.code AS aircraft_code, a.model AS aircraft_model, a.total_seats,
    (SELECT count(*) FROM passengers p WHERE p.flight_id = f.id AND p.active AND p.status <> 'OFFLOADED' AND NOT p.waitlisted) AS pax_total,
    (SELECT count(*) FROM passengers p WHERE p.flight_id = f.id AND p.active AND p.status IN ('CHECKED_IN','SECURITY_PASSED','BOARDED')) AS pax_checked,
    (SELECT count(*) FROM passengers p WHERE p.flight_id = f.id AND p.active AND p.status = 'BOARDED') AS pax_boarded,
    (SELECT count(*) FROM baggage b WHERE b.flight_id = f.id) AS bag_count,
    (SELECT COALESCE(sum(b.weight_kg),0) FROM baggage b WHERE b.flight_id = f.id) AS bag_weight
  FROM flights f JOIN aircraft_types a ON a.id = f.aircraft_type_id`;

function rangeCond(query, params, cond) {
  const { date_from, date_to } = query;
  if (date_from) { params.push(date_from); cond.push(`f.departure_ts >= $${params.length}::date`); }
  if (date_to) { params.push(date_to); cond.push(`f.departure_ts < ($${params.length}::date + interval '1 day')`); }
}

router.get('/overview', async (req, res) => {
  const params = [];
  const cond = [];
  rangeCond(req.query, params, cond);
  if (!req.query.date_from && !req.query.date_to) {
    cond.push(`f.departure_ts >= now() - interval '24 hours' AND f.departure_ts <= now() + interval '48 hours'`);
  }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const { rows: flights } = await q(`${FLIGHT_STATS} ${where} ORDER BY f.departure_ts`, params);

  const totals = {
    flights: flights.length,
    boarding: flights.filter((f) => f.status === 'BOARDING').length,
    checkinOpen: flights.filter((f) => f.status === 'CHECKIN_OPEN').length,
    delayed: flights.filter((f) => f.delay_minutes > 0 && !['DEPARTED', 'CANCELLED'].includes(f.status)).length,
    departed: flights.filter((f) => f.status === 'DEPARTED').length,
    passengers: flights.reduce((s, f) => s + Number(f.pax_total), 0),
    checkedIn: flights.reduce((s, f) => s + Number(f.pax_checked), 0),
    boarded: flights.reduce((s, f) => s + Number(f.pax_boarded), 0),
    bags: flights.reduce((s, f) => s + Number(f.bag_count), 0),
    bagWeight: flights.reduce((s, f) => s + Number(f.bag_weight), 0),
  };
  totals.pending = totals.passengers - totals.checkedIn;
  res.json({ totals, flights });
});

router.get('/flights.xlsx', requireRole('manager'), async (req, res) => {
  const params = [];
  const cond = [];
  rangeCond(req.query, params, cond);
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const { rows } = await q(`${FLIGHT_STATS} ${where} ORDER BY f.departure_ts DESC LIMIT 1000`, params);
  const buf = await opsReportXlsx(rows);
  await audit(req, 'EXPORT_OPS_XLSX', 'report', null, req.query);
  res.setHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('content-disposition', 'attachment; filename="voyage_flights_report.xlsx"');
  res.send(Buffer.from(buf));
});

router.get('/audit', requireRole('admin'), async (req, res) => {
  const { action, limit } = req.query;
  const params = [];
  let cond = '';
  if (action) { params.push(`%${action}%`); cond = `WHERE action ILIKE $1`; }
  params.push(Math.min(parseInt(limit, 10) || 200, 1000));
  const { rows } = await q(
    `SELECT * FROM audit_log ${cond} ORDER BY ts DESC LIMIT $${params.length}`, params
  );
  res.json({ audit: rows });
});

export default router;
