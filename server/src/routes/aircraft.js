import { Router } from 'express';
import { q } from '../db/pool.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { audit } from '../services/audit.js';
import { countSeats, generateSequence } from '../db/seatmaps.js';

const router = Router();
router.use(authRequired);

router.get('/', async (req, res) => {
  const { rows } = await q('SELECT * FROM aircraft_types WHERE active ORDER BY code');
  res.json({ aircraft: rows });
});

router.post('/', requireRole('admin'), async (req, res) => {
  const { code, model, seat_map } = req.body || {};
  if (!code || !model || !seat_map?.rows) {
    return res.status(400).json({ error: 'code, model, seat_map шаардлагатай' });
  }
  try {
    const { rows } = await q(
      `INSERT INTO aircraft_types (code, model, total_seats, seat_map, assignment_sequence)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [code.toUpperCase().trim(), model.trim(), countSeats(seat_map),
       JSON.stringify(seat_map), JSON.stringify(generateSequence(seat_map))]
    );
    await audit(req, 'AIRCRAFT_CREATED', 'aircraft', rows[0].id, { code, model });
    res.status(201).json({ aircraft: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Код давхардаж байна' });
    throw err;
  }
});

router.put('/:id', requireRole('admin'), async (req, res) => {
  const { model, seat_map, assignment_sequence, active } = req.body || {};
  const current = (await q('SELECT * FROM aircraft_types WHERE id = $1', [req.params.id])).rows[0];
  if (!current) return res.status(404).json({ error: 'Онгоц олдсонгүй' });
  const newMap = seat_map || current.seat_map;
  const newSeq = assignment_sequence || (seat_map ? generateSequence(seat_map) : current.assignment_sequence);
  const { rows } = await q(
    `UPDATE aircraft_types SET model=$2, seat_map=$3, assignment_sequence=$4, total_seats=$5,
       active=COALESCE($6, active), updated_at=now()
     WHERE id=$1 RETURNING *`,
    [req.params.id, model || current.model, JSON.stringify(newMap), JSON.stringify(newSeq), countSeats(newMap), active]
  );
  await audit(req, 'AIRCRAFT_UPDATED', 'aircraft', req.params.id, { model, seat_map_changed: !!seat_map });
  res.json({ aircraft: rows[0] });
});

export default router;
