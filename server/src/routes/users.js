import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { q } from '../db/pool.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { audit } from '../services/audit.js';

const router = Router();
router.use(authRequired, requireRole('admin'));

const ROLES = ['admin', 'manager', 'agent', 'ot_staff'];

router.get('/', async (req, res) => {
  const { rows } = await q(
    'SELECT id, username, full_name, role, email, phone, active, created_at FROM users ORDER BY created_at'
  );
  res.json({ users: rows });
});

router.post('/', async (req, res) => {
  const { username, password, full_name, role, email, phone } = req.body || {};
  if (!username || !password || !full_name || !ROLES.includes(role)) {
    return res.status(400).json({ error: 'username, password, full_name, role шаардлагатай' });
  }
  if (String(password).length < 8) return res.status(400).json({ error: 'Нууц үг доод тал нь 8 тэмдэгт' });
  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await q(
      `INSERT INTO users (username, password_hash, full_name, role, email, phone)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, username, full_name, role, email, phone, active`,
      [String(username).toLowerCase(), hash, full_name, role, email || null, phone || null]
    );
    await audit(req, 'USER_CREATED', 'user', rows[0].id, { username, role });
    res.status(201).json({ user: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Нэвтрэх нэр давхардаж байна' });
    throw err;
  }
});

router.put('/:id', async (req, res) => {
  const { full_name, role, email, phone, active, password } = req.body || {};
  if (role && !ROLES.includes(role)) return res.status(400).json({ error: 'Буруу role' });
  if (req.params.id === req.user.id && active === false) {
    return res.status(400).json({ error: 'Өөрийгөө идэвхгүй болгох боломжгүй' });
  }
  const { rows } = await q(
    `UPDATE users SET
       full_name = COALESCE($2, full_name),
       role      = COALESCE($3, role),
       email     = COALESCE($4, email),
       phone     = COALESCE($5, phone),
       active    = COALESCE($6, active),
       updated_at = now()
     WHERE id = $1 RETURNING id, username, full_name, role, email, phone, active`,
    [req.params.id, full_name, role, email, phone, active]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Хэрэглэгч олдсонгүй' });
  if (password) {
    if (String(password).length < 8) return res.status(400).json({ error: 'Нууц үг доод тал нь 8 тэмдэгт' });
    const hash = await bcrypt.hash(password, 10);
    await q('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.params.id]);
  }
  await audit(req, 'USER_UPDATED', 'user', req.params.id, { role, active, password_reset: !!password });
  res.json({ user: rows[0] });
});

router.delete('/:id', async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Өөрийгөө устгах боломжгүй' });
  const { rows } = await q(
    'UPDATE users SET active = FALSE, updated_at = now() WHERE id = $1 RETURNING id',
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Хэрэглэгч олдсонгүй' });
  await audit(req, 'USER_DEACTIVATED', 'user', req.params.id, {});
  res.json({ ok: true });
});

export default router;
