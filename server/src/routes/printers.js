import { Router } from 'express';
import { q } from '../db/pool.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { audit } from '../services/audit.js';
import { PRINTER_CATALOG, catalogEntry } from '../services/printers.js';

const router = Router();
router.use(authRequired);

// Any staff member can browse the catalog and the installed list (agents
// need it to pick a printer at the counter); only admins mutate.
router.get('/catalog', requireRole('agent'), (req, res) => {
  res.json({ catalog: PRINTER_CATALOG });
});

router.get('/', requireRole('agent'), async (req, res) => {
  const { rows } = await q('SELECT * FROM printers ORDER BY is_default DESC, name');
  res.json({ printers: rows });
});

router.post('/install', requireRole('admin'), async (req, res) => {
  const { model_key, name, station } = req.body || {};
  const entry = catalogEntry(model_key);
  if (!entry) return res.status(400).json({ error: 'Каталогид байхгүй загвар' });
  const displayName = (name || '').trim() || `${entry.vendor} ${entry.model}`;
  const { rows } = await q(
    `INSERT INTO printers (model_key, name, kind, station, config, installed_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [entry.model_key, displayName, entry.kind, station || null, JSON.stringify(entry.config), req.user.id]
  );
  await audit(req, 'PRINTER_INSTALLED', 'printer', rows[0].id, { model_key, name: displayName, station: station || null });
  res.status(201).json({ printer: rows[0] });
});

router.put('/:id', requireRole('admin'), async (req, res) => {
  const { name, station, config, active, is_default } = req.body || {};
  const { rows: cur } = await q('SELECT * FROM printers WHERE id = $1', [req.params.id]);
  if (!cur.length) return res.status(404).json({ error: 'Хэвлэгч олдсонгүй' });
  const p = cur[0];
  if (is_default === true) {
    // one default per (kind, station) group
    await q('UPDATE printers SET is_default = FALSE WHERE kind = $1 AND station IS NOT DISTINCT FROM $2', [
      p.kind, station !== undefined ? station || null : p.station,
    ]);
  }
  const { rows } = await q(
    `UPDATE printers SET
       name = COALESCE($2, name),
       station = CASE WHEN $3::boolean THEN $4 ELSE station END,
       config = COALESCE($5, config),
       active = COALESCE($6, active),
       is_default = COALESCE($7, is_default),
       updated_at = now()
     WHERE id = $1 RETURNING *`,
    [
      req.params.id,
      name !== undefined ? String(name).trim() : null,
      station !== undefined,
      station !== undefined ? station || null : null,
      config !== undefined ? JSON.stringify(config) : null,
      active !== undefined ? !!active : null,
      is_default !== undefined ? !!is_default : null,
    ]
  );
  await audit(req, 'PRINTER_UPDATED', 'printer', req.params.id, req.body);
  res.json({ printer: rows[0] });
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  const { rows } = await q('DELETE FROM printers WHERE id = $1 RETURNING name, model_key', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Хэвлэгч олдсонгүй' });
  await audit(req, 'PRINTER_REMOVED', 'printer', req.params.id, rows[0]);
  res.json({ ok: true });
});

// Download the profile as a JSON config file (importable on another counter
// PC or kept as documentation of the tuned settings).
router.get('/:id/config', requireRole('agent'), async (req, res) => {
  const { rows } = await q('SELECT * FROM printers WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Хэвлэгч олдсонгүй' });
  const p = rows[0];
  const entry = catalogEntry(p.model_key);
  res.setHeader('Content-Disposition', `attachment; filename="voyage-printer-${p.model_key}.json"`);
  res.json({
    voyage_printer_profile: 1,
    model_key: p.model_key,
    vendor: entry?.vendor,
    model: entry?.model,
    name: p.name,
    kind: p.kind,
    station: p.station,
    config: p.config,
    driver_url: entry?.driver_url || null,
  });
});

export default router;
