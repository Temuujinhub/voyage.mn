import jwt from 'jsonwebtoken';
import cfg from '../config.js';
import { q } from '../db/pool.js';

export function signStaffToken(user) {
  return jwt.sign(
    {
      sub: user.id, username: user.username, role: user.role,
      name: user.full_name, station: user.station || null, kind: 'staff',
      tv: user.token_version || 0,
    },
    cfg.jwtSecret,
    { expiresIn: cfg.jwtExpires }
  );
}

// token_version check makes issued JWTs revocable (password change bumps the
// version). A short-lived cache keeps it from costing a DB round-trip per
// request; bumpTokenVersion() drops the cache entry so revocation is instant
// on this node.
const tvCache = new Map(); // userId -> {tv, at}
const TV_TTL = 60_000;

async function currentTokenVersion(userId) {
  const hit = tvCache.get(userId);
  if (hit && Date.now() - hit.at < TV_TTL) return hit.tv;
  const { rows } = await q('SELECT token_version FROM users WHERE id = $1 AND active', [userId]);
  const tv = rows.length ? rows[0].token_version || 0 : null; // null → user gone/disabled
  tvCache.set(userId, { tv, at: Date.now() });
  return tv;
}

export function bumpTokenVersion(userId) {
  tvCache.delete(userId);
}

export function signPassengerToken(phone) {
  return jwt.sign({ sub: phone, kind: 'passenger' }, cfg.jwtSecret, {
    expiresIn: cfg.passengerJwtExpires,
  });
}

export async function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Нэвтрэх шаардлагатай' });
  let payload;
  try {
    payload = jwt.verify(token, cfg.jwtSecret);
  } catch {
    return res.status(401).json({ error: 'Токен хүчингүй эсвэл хугацаа дууссан' });
  }
  if (payload.kind !== 'staff') return res.status(401).json({ error: 'Invalid token kind' });
  try {
    const tv = await currentTokenVersion(payload.sub);
    if (tv === null || (payload.tv || 0) !== tv) {
      return res.status(401).json({ error: 'Токен хүчингүй болсон — дахин нэвтэрнэ үү' });
    }
  } catch {
    // DB hiccup: fail open on the version check rather than lock everyone out
  }
  req.user = { id: payload.sub, username: payload.username, role: payload.role, name: payload.name, station: payload.station || null };
  next();
}

export function passengerAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Нэвтрэх шаардлагатай' });
  try {
    const payload = jwt.verify(token, cfg.jwtSecret);
    if (payload.kind !== 'passenger') return res.status(401).json({ error: 'Invalid token kind' });
    req.passenger = { phone: payload.sub };
    next();
  } catch {
    return res.status(401).json({ error: 'Хугацаа дууссан. Дахин нэвтэрнэ үү.' });
  }
}

// Role hierarchy: admin > manager > agent; ot_staff is a separate limited role.
const LEVELS = { admin: 3, manager: 2, agent: 1 };

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Нэвтрэх шаардлагатай' });
    if (roles.includes(req.user.role)) return next();
    // allow higher staff levels through when a lower staff role is required
    const required = Math.min(...roles.filter((r) => LEVELS[r]).map((r) => LEVELS[r]));
    if (LEVELS[req.user.role] && required && LEVELS[req.user.role] >= required) return next();
    return res.status(403).json({ error: 'Эрх хүрэлцэхгүй байна' });
  };
}
