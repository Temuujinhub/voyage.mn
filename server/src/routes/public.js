import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import QRCode from 'qrcode';
import { q } from '../db/pool.js';
import { passengerAuth, signPassengerToken } from '../middleware/auth.js';
import { requestOtp, verifyOtp, normalizePhone } from '../services/otp.js';
import { checkinPassenger, CheckinError, loadFlightForCheckin, assertCheckinOpen } from '../services/checkin.js';
import { getSettings } from '../services/settings.js';
import { audit } from '../services/audit.js';

const router = Router();

const otpLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 12, standardHeaders: true });
const publicLimiter = rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: true });
router.use(publicLimiter);

// Upcoming flights the phone number is manifested on (limited fields).
async function upcomingFlightsForPhone(phone) {
  const { rows } = await q(
    `SELECT p.id AS passenger_id, p.status, p.seat, p.full_name, p.title, p.baggage_pending,
            f.id AS flight_id, f.flight_number, f.charter_code, f.origin_code, f.origin_name,
            f.dest_code, f.dest_name, f.departure_ts, f.arrival_ts, f.gate,
            f.status AS flight_status, f.delay_minutes, f.delay_reason
       FROM passengers p JOIN flights f ON f.id = p.flight_id
      WHERE p.phone = $1
        AND p.status <> 'OFFLOADED'
        AND f.status <> 'CANCELLED'
        AND f.departure_ts > now() - interval '6 hours'
        AND f.departure_ts < now() + interval '48 hours'
      ORDER BY f.departure_ts`,
    [phone]
  );
  return rows;
}

router.post('/otp/request', otpLimiter, async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  if (!phone || phone.length < 9) return res.status(400).json({ error: 'Утасны дугаараа зөв оруулна уу' });
  const flights = await upcomingFlightsForPhone(phone);
  if (flights.length === 0) {
    return res.status(404).json({
      error: 'Энэ дугаартай зорчигч ойрын нислэгийн бүртгэлд олдсонгүй. Бүртгэлийн ажилтанд хандана уу.',
    });
  }
  const p = flights[0];
  const nameParts = p.full_name.split(/\s+/);
  const maskedName = nameParts.map((s) => (s[0] || '') + '*****').join(' ');
  const result = await requestOtp(phone);
  await audit({ ip: req.ip }, 'OTP_REQUESTED', 'passenger', p.passenger_id, { phone_last4: phone.slice(-4) });
  res.json({
    ok: true,
    maskedName: `${p.title ? p.title + ' ' : ''}${maskedName}`,
    // dev mode only — removed automatically once an SMS gateway is enabled
    devCode: result.devCode,
  });
});

router.post('/otp/verify', otpLimiter, async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const { code } = req.body || {};
  if (!phone || !code) return res.status(400).json({ error: 'Утас болон код шаардлагатай' });
  const result = await verifyOtp(phone, code);
  if (!result.ok) return res.status(400).json({ error: result.reason });
  await audit({ ip: req.ip }, 'OTP_VERIFIED', 'passenger', phone.slice(-4), {});
  res.json({ token: signPassengerToken(phone) });
});

router.get('/my-flights', passengerAuth, async (req, res) => {
  const flights = await upcomingFlightsForPhone(req.passenger.phone);
  res.json({ flights });
});

router.post('/checkin', passengerAuth, async (req, res) => {
  const { passenger_id, baggage_weight } = req.body || {};
  const { rows } = await q(
    'SELECT * FROM passengers WHERE id = $1 AND phone = $2',
    [passenger_id, req.passenger.phone]
  );
  const pax = rows[0];
  if (!pax) return res.status(404).json({ error: 'Зорчигчийн бүртгэл олдсонгүй' });

  const weight = Number(baggage_weight) || 0;
  try {
    // Self check-in never prints tags: declared baggage is registered at the
    // counter drop-off. baggage_pending routes the passenger to the desk.
    const result = await checkinPassenger({
      passengerId: pax.id,
      baggage: [],
      baggagePending: weight > 0,
      byUserId: null,
    });
    await audit({ ip: req.ip }, 'SELF_CHECKIN', 'passenger', pax.id, { declared_baggage_kg: weight });
    res.json({ ok: true, passenger: result.passenger, baggagePending: weight > 0 });
  } catch (err) {
    if (err instanceof CheckinError) return res.status(400).json({ error: err.message, code: err.code });
    throw err;
  }
});

router.get('/boarding-pass/:passengerId', passengerAuth, async (req, res) => {
  const { rows } = await q(
    `SELECT p.*, f.flight_number, f.charter_code, f.origin_code, f.origin_name, f.dest_code, f.dest_name,
            f.departure_ts, f.arrival_ts, f.gate, f.status AS flight_status, f.delay_minutes, f.delay_reason,
            a.model AS aircraft_model
       FROM passengers p
       JOIN flights f ON f.id = p.flight_id
       JOIN aircraft_types a ON a.id = f.aircraft_type_id
      WHERE p.id = $1 AND p.phone = $2`,
    [req.params.passengerId, req.passenger.phone]
  );
  const pax = rows[0];
  if (!pax) return res.status(404).json({ error: 'Олдсонгүй' });
  if (!pax.qr_token) return res.status(400).json({ error: 'Check-in хийгдээгүй байна' });
  const settings = await getSettings();
  const qrDataUrl = await QRCode.toDataURL(pax.qr_token, { errorCorrectionLevel: 'M', margin: 1, width: 320 });
  const { rows: bags } = await q('SELECT tag_number, weight_kg FROM baggage WHERE passenger_id = $1', [pax.id]);
  // strip internal fields
  const { qr_token, checkin_by, manifest_id, ...publicPax } = pax;
  res.json({ passenger: publicPax, airline: settings.airline, qrDataUrl, baggage: bags });
});

// OT App provider API (Voyage Lite spec, module A) — employee-id lookup,
// secured with a static integration key set in Settings > sms_gateway later if needed.
router.get('/employee/:employeeId/boarding-pass', async (req, res) => {
  const { rows } = await q(
    `SELECT p.id, p.status, p.seat, p.full_name, p.qr_token,
            f.flight_number, f.origin_code, f.dest_code, f.departure_ts, f.gate, f.delay_minutes
       FROM passengers p JOIN flights f ON f.id = p.flight_id
      WHERE p.employee_id = $1 AND f.departure_ts > now() - interval '6 hours' AND f.status <> 'CANCELLED'
      ORDER BY f.departure_ts LIMIT 1`,
    [req.params.employeeId]
  );
  const pax = rows[0];
  if (!pax) return res.status(404).json({ error: 'Not found' });
  if (pax.status === 'PENDING') {
    const { qr_token, ...rest } = pax;
    return res.json({ ...rest, checked_in: false, message: 'Not checked in' });
  }
  const qrDataUrl = await QRCode.toDataURL(pax.qr_token, { errorCorrectionLevel: 'M', margin: 1, width: 320 });
  const { qr_token, ...rest } = pax;
  res.json({ ...rest, checked_in: true, bcbp: qr_token, qrDataUrl });
});

// Live flight info board (public, no PII)
router.get('/flight-board', async (req, res) => {
  const { rows } = await q(
    `SELECT flight_number, origin_code, dest_code, departure_ts, gate, status, delay_minutes, delay_reason
       FROM flights
      WHERE departure_ts > now() - interval '3 hours' AND departure_ts < now() + interval '24 hours'
        AND status <> 'CANCELLED'
      ORDER BY departure_ts LIMIT 50`
  );
  res.json({ flights: rows });
});

export default router;
