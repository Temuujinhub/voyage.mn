import { q } from '../db/pool.js';

export async function audit(req, action, entity, entityId, details = {}) {
  const u = req?.user || {};
  try {
    await q(
      `INSERT INTO audit_log (user_id, username, role, action, entity, entity_id, details, ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        u.id || null,
        u.username || (req?.passenger ? 'self-checkin' : 'system'),
        u.role || null,
        action,
        entity || null,
        entityId ? String(entityId) : null,
        JSON.stringify(details),
        req?.ip || null,
      ]
    );
  } catch (err) {
    console.error('audit write failed', err.message);
  }
}
