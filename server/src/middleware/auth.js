import jwt from 'jsonwebtoken';
import cfg from '../config.js';

export function signStaffToken(user) {
  return jwt.sign(
    {
      sub: user.id, username: user.username, role: user.role,
      name: user.full_name, station: user.station || null, kind: 'staff',
    },
    cfg.jwtSecret,
    { expiresIn: cfg.jwtExpires }
  );
}

export function signPassengerToken(phone) {
  return jwt.sign({ sub: phone, kind: 'passenger' }, cfg.jwtSecret, {
    expiresIn: cfg.passengerJwtExpires,
  });
}

export function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Нэвтрэх шаардлагатай' });
  try {
    const payload = jwt.verify(token, cfg.jwtSecret);
    if (payload.kind !== 'staff') return res.status(401).json({ error: 'Invalid token kind' });
    req.user = { id: payload.sub, username: payload.username, role: payload.role, name: payload.name, station: payload.station || null };
    next();
  } catch {
    return res.status(401).json({ error: 'Токен хүчингүй эсвэл хугацаа дууссан' });
  }
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
