import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { q } from '../db/pool.js';
import { signStaffToken, authRequired } from '../middleware/auth.js';
import { audit } from '../services/audit.js';

const router = Router();

const loginLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 30, standardHeaders: true });

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Нэвтрэх нэр, нууц үг шаардлагатай' });
  const { rows } = await q('SELECT * FROM users WHERE username = $1 AND active', [String(username).toLowerCase()]);
  const user = rows[0];
  const ok = user && (await bcrypt.compare(password, user.password_hash));
  if (!ok) {
    await audit({ ip: req.ip }, 'LOGIN_FAILED', 'user', username, {});
    return res.status(401).json({ error: 'Нэвтрэх нэр эсвэл нууц үг буруу' });
  }
  const token = signStaffToken(user);
  req.user = { id: user.id, username: user.username, role: user.role };
  await audit(req, 'LOGIN', 'user', user.id, {});
  res.json({
    token,
    user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role, station: user.station || null },
  });
});

router.get('/me', authRequired, async (req, res) => {
  const { rows } = await q('SELECT id, username, full_name, role, station, email, phone FROM users WHERE id = $1', [req.user.id]);
  if (!rows[0]) return res.status(401).json({ error: 'not found' });
  res.json({ user: rows[0] });
});

router.post('/change-password', authRequired, async (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!new_password || String(new_password).length < 8) {
    return res.status(400).json({ error: 'Шинэ нууц үг доод тал нь 8 тэмдэгт байна' });
  }
  const { rows } = await q('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!(await bcrypt.compare(current_password || '', rows[0].password_hash))) {
    return res.status(400).json({ error: 'Одоогийн нууц үг буруу' });
  }
  const hash = await bcrypt.hash(new_password, 10);
  await q('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [hash, req.user.id]);
  await audit(req, 'PASSWORD_CHANGED', 'user', req.user.id, {});
  res.json({ ok: true });
});

export default router;
