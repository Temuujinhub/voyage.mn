import os from 'node:os';
import { Router } from 'express';
import { q, pool } from '../db/pool.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { getSettings } from '../services/settings.js';
import { socketCount } from '../services/live.js';
import cfg from '../config.js';

const router = Router();
router.use(authRequired);
router.use(requireRole('admin'));

// ---- System health ---------------------------------------------------------

router.get('/health', async (req, res) => {
  const health = { checked_at: new Date().toISOString() };

  // Database
  const t0 = Date.now();
  try {
    const { rows } = await q('SELECT version() AS version, pg_database_size(current_database()) AS size');
    const [counts] = (
      await q(`SELECT
        (SELECT count(*) FROM flights)    AS flights,
        (SELECT count(*) FROM passengers) AS passengers,
        (SELECT count(*) FROM baggage)    AS baggage,
        (SELECT count(*) FROM users WHERE active) AS users,
        (SELECT count(*) FROM audit_log)  AS audit_rows`)
    ).rows;
    health.database = {
      ok: true,
      latency_ms: Date.now() - t0,
      version: rows[0].version.split(' on ')[0],
      size_bytes: Number(rows[0].size),
      pool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount },
      counts: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Number(v)])),
    };
  } catch (err) {
    health.database = { ok: false, error: err.message, latency_ms: Date.now() - t0 };
  }

  // Application process
  const mem = process.memoryUsage();
  health.server = {
    ok: true,
    env: cfg.env,
    node: process.version,
    uptime_seconds: Math.round(process.uptime()),
    memory: { rss: mem.rss, heap_used: mem.heapUsed, heap_total: mem.heapTotal },
    load_avg: os.loadavg().map((n) => Math.round(n * 100) / 100),
    hostname: os.hostname(),
  };

  // Realtime (Socket.IO)
  health.realtime = { ok: true, connected_clients: socketCount() };

  // Mail ingest (IMAP manifest poller)
  try {
    const imap = (await getSettings()).imap || {};
    const { rows: last } = await q(
      'SELECT status, subject, detail, created_at FROM email_ingest_log ORDER BY id DESC LIMIT 1'
    );
    health.mail_ingest = {
      ok: !imap.enabled || !!imap.host,
      enabled: !!imap.enabled,
      host: imap.host || null,
      poll_seconds: imap.poll_seconds || null,
      last_event: last[0] || null,
    };
  } catch (err) {
    health.mail_ingest = { ok: false, error: err.message };
  }

  // SMS gateway config presence (no live probe — avoid burning credits)
  try {
    const s = await getSettings();
    health.sms = {
      ok: s.otp?.mode !== 'sms_gateway' || (!!s.sms_gateway?.enabled && !!s.sms_gateway?.api_key),
      mode: s.otp?.mode,
      gateway_enabled: !!s.sms_gateway?.enabled,
    };
  } catch (err) {
    health.sms = { ok: false, error: err.message };
  }

  health.ok = [health.database, health.server, health.realtime, health.mail_ingest, health.sms]
    .every((c) => c.ok);
  res.json(health);
});

// ---- Audit log -------------------------------------------------------------

router.get('/audit/actions', async (req, res) => {
  const { rows } = await q('SELECT DISTINCT action FROM audit_log ORDER BY action');
  res.json({ actions: rows.map((r) => r.action) });
});

router.get('/audit', async (req, res) => {
  const { action, username, entity, from, to, qtext } = req.query;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const conds = [];
  const params = [];
  const add = (sql, val) => { params.push(val); conds.push(sql.replace('?', `$${params.length}`)); };

  if (action) add('action = ?', action);
  if (username) add('username ILIKE ?', `%${username}%`);
  if (entity) add('entity = ?', entity);
  if (from) add('ts >= ?', from);
  if (to) add('ts <= ?', to);
  if (qtext) {
    params.push(`%${qtext}%`);
    conds.push(`(entity_id ILIKE $${params.length} OR details::text ILIKE $${params.length})`);
  }

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const [{ count }] = (await q(`SELECT count(*) AS count FROM audit_log ${where}`, params)).rows;
  const { rows } = await q(
    `SELECT id, ts, username, role, action, entity, entity_id, details, ip
     FROM audit_log ${where} ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  res.json({ total: Number(count), rows, limit, offset });
});

export default router;
