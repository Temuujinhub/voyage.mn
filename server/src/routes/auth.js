import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import QRCode from 'qrcode';
import { q } from '../db/pool.js';
import { signStaffToken, authRequired, bumpTokenVersion } from '../middleware/auth.js';
import { audit } from '../services/audit.js';
import { generateSecret, verifyTotp, otpauthUrl } from '../services/totp.js';

const router = Router();

const loginLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 30, standardHeaders: true });

// Account lockout: after this many consecutive failures the account (not just
// the IP — distributed guessing is the point) is locked for LOCK_MINUTES.
const MAX_FAILED = 10;
const LOCK_MINUTES = 15;

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password, totp } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Нэвтрэх нэр, нууц үг шаардлагатай' });
  const { rows } = await q('SELECT * FROM users WHERE username = $1 AND active', [String(username).toLowerCase()]);
  const user = rows[0];

  if (user?.locked_until && new Date(user.locked_until) > new Date()) {
    const mins = Math.ceil((new Date(user.locked_until) - Date.now()) / 60000);
    await audit({ ip: req.ip }, 'LOGIN_LOCKED', 'user', user.id, { minutes_left: mins });
    return res.status(423).json({ error: `Данс түр түгжигдсэн — ${mins} минутын дараа дахин оролдоно уу` });
  }

  const ok = user && (await bcrypt.compare(password, user.password_hash));
  if (!ok) {
    if (user) {
      const failed = (user.failed_logins || 0) + 1;
      const lock = failed >= MAX_FAILED;
      await q(
        `UPDATE users SET failed_logins = $2, locked_until = $3 WHERE id = $1`,
        [user.id, lock ? 0 : failed, lock ? new Date(Date.now() + LOCK_MINUTES * 60000) : null]
      );
      if (lock) await audit({ ip: req.ip }, 'ACCOUNT_LOCKED', 'user', user.id, { after_failures: failed });
    }
    await audit({ ip: req.ip }, 'LOGIN_FAILED', 'user', username, {});
    return res.status(401).json({ error: 'Нэвтрэх нэр эсвэл нууц үг буруу' });
  }

  // 2FA: when the account has TOTP enabled the password alone is not enough
  if (user.totp_secret) {
    if (!totp) return res.status(401).json({ totp_required: true, error: 'Баталгаажуулах 6 оронтой кодоо оруулна уу' });
    if (!verifyTotp(user.totp_secret, totp)) {
      await audit({ ip: req.ip }, 'LOGIN_TOTP_FAILED', 'user', user.id, {});
      return res.status(401).json({ totp_required: true, error: 'Баталгаажуулах код буруу' });
    }
  }

  if (user.failed_logins > 0 || user.locked_until) {
    await q('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = $1', [user.id]);
  }
  const token = signStaffToken(user);
  req.user = { id: user.id, username: user.username, role: user.role };
  await audit(req, 'LOGIN', 'user', user.id, { totp: !!user.totp_secret });
  res.json({
    token,
    user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role, station: user.station || null },
  });
});

router.get('/me', authRequired, async (req, res) => {
  const { rows } = await q(
    'SELECT id, username, full_name, role, station, email, phone, (totp_secret IS NOT NULL) AS totp_enabled FROM users WHERE id = $1',
    [req.user.id]
  );
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
  // bumping token_version invalidates every previously issued token
  await q('UPDATE users SET password_hash = $1, token_version = token_version + 1, updated_at = now() WHERE id = $2', [hash, req.user.id]);
  bumpTokenVersion(req.user.id);
  await audit(req, 'PASSWORD_CHANGED', 'user', req.user.id, {});
  res.json({ ok: true });
});

// ── TOTP 2FA setup ──────────────────────────────────────────────────────────
// 1) /totp/setup returns a fresh secret + QR (not yet saved as enabled)
// 2) /totp/enable verifies one code from the authenticator, then stores it

router.post('/totp/setup', authRequired, async (req, res) => {
  const secret = generateSecret();
  const url = otpauthUrl(secret, req.user.username);
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 220 });
  res.json({ secret, otpauth_url: url, qr });
});

router.post('/totp/enable', authRequired, async (req, res) => {
  const { secret, code } = req.body || {};
  if (!secret || !verifyTotp(secret, code)) {
    return res.status(400).json({ error: 'Код буруу байна — аппаас шинэ кодоо оруулна уу' });
  }
  await q('UPDATE users SET totp_secret = $1, updated_at = now() WHERE id = $2', [secret, req.user.id]);
  await audit(req, 'TOTP_ENABLED', 'user', req.user.id, {});
  res.json({ ok: true });
});

router.post('/totp/disable', authRequired, async (req, res) => {
  const { password } = req.body || {};
  const { rows } = await q('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!(await bcrypt.compare(password || '', rows[0].password_hash))) {
    return res.status(400).json({ error: 'Нууц үг буруу' });
  }
  await q('UPDATE users SET totp_secret = NULL, updated_at = now() WHERE id = $1', [req.user.id]);
  await audit(req, 'TOTP_DISABLED', 'user', req.user.id, {});
  res.json({ ok: true });
});

export default router;
