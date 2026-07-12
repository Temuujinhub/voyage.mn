import { Router } from 'express';
import { q } from '../db/pool.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { audit } from '../services/audit.js';

const router = Router();
router.use(authRequired);
router.use(requireRole('manager')); // directory holds PII across all flights

router.get('/', async (req, res) => {
  const { qtext } = req.query;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const params = [];
  let where = '';
  if (qtext && String(qtext).length >= 2) {
    params.push(`%${qtext}%`);
    where = `WHERE (full_name ILIKE $1 OR employee_id ILIKE $1 OR phone ILIKE $1 OR email ILIKE $1)`;
  }
  const [{ count }] = (await q(`SELECT count(*) AS count FROM people ${where}`, params)).rows;
  const { rows } = await q(
    `SELECT * FROM people ${where} ORDER BY last_seen_at DESC LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  res.json({ total: Number(count), people: rows, limit, offset });
});

// one person + their flight history
router.get('/:id', async (req, res) => {
  const { rows } = await q('SELECT * FROM people WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Олдсонгүй' });
  const { rows: flights } = await q(
    `SELECT p.id AS passenger_id, p.status, p.seat, p.active, p.checkin_ts,
            f.flight_number, f.origin_code, f.dest_code, f.departure_ts
       FROM passengers p JOIN flights f ON f.id = p.flight_id
      WHERE p.person_id = $1
      ORDER BY f.departure_ts DESC LIMIT 50`,
    [req.params.id]
  );
  res.json({ person: rows[0], flights });
});

// contact upkeep (email is the field manifests never carry — future notifications)
router.put('/:id', requireRole('admin'), async (req, res) => {
  const { phone, email, notify } = req.body || {};
  const { rows } = await q(
    `UPDATE people SET
       phone = COALESCE($2, phone),
       email = COALESCE($3, email),
       notify = COALESCE($4, notify),
       updated_at = now()
     WHERE id = $1 RETURNING *`,
    [req.params.id, phone, email, notify ? JSON.stringify(notify) : null]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Олдсонгүй' });
  await audit(req, 'PERSON_UPDATED', 'person', req.params.id, { phone: !!phone, email: !!email });
  res.json({ person: rows[0] });
});

export default router;
