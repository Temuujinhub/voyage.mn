import { Router } from 'express';
import { q } from '../db/pool.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { processScan } from '../services/boarding.js';

const router = Router();
router.use(authRequired);

router.post('/scan', requireRole('agent'), async (req, res) => {
  const { code, point, flight_id } = req.body || {};
  if (!code || !['SECURITY', 'GATE'].includes(point)) {
    return res.status(400).json({ error: 'code болон point (SECURITY|GATE) шаардлагатай' });
  }
  const result = await processScan({ code, point, flightId: flight_id || null, byUserId: req.user.id });
  res.json(result);
});

router.get('/flights/:id/status', async (req, res) => {
  const { rows: counts } = await q(
    `SELECT status, count(*) AS n FROM passengers
      WHERE flight_id = $1 AND status <> 'OFFLOADED' AND NOT waitlisted GROUP BY status`,
    [req.params.id]
  );
  const { rows: recent } = await q(
    `SELECT s.id, s.point, s.result, s.ts, p.full_name, p.seat, p.pnr
       FROM scan_events s LEFT JOIN passengers p ON p.id = s.passenger_id
      WHERE s.flight_id = $1 ORDER BY s.ts DESC LIMIT 30`,
    [req.params.id]
  );
  const byStatus = Object.fromEntries(counts.map((r) => [r.status, Number(r.n)]));
  res.json({ byStatus, recent });
});

export default router;
