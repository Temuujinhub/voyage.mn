import { Router } from 'express';
import multer from 'multer';
import { q } from '../db/pool.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { audit } from '../services/audit.js';
import { importManifest } from '../services/manifestImport.js';

const router = Router();
router.use(authRequired);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.xlsx?$/i.test(file.originalname);
    cb(ok ? null : new Error('Зөвхөн Excel (.xlsx) файл хүлээн авна'), ok);
  },
});

// OT travel staff may only upload manifests; agents may not.
function canUpload(req, res, next) {
  if (['ot_staff', 'manager', 'admin'].includes(req.user.role)) return next();
  return res.status(403).json({ error: 'Manifest оруулах эрхгүй' });
}

router.post('/upload', canUpload, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл хавсаргана уу' });
  const force = req.body?.force === 'true' && ['manager', 'admin'].includes(req.user.role);
  const result = await importManifest(req.file.buffer, {
    source: 'upload',
    filename: req.file.originalname,
    userId: req.user.id,
    force,
  });
  await audit(req, result.ok ? 'MANIFEST_IMPORTED' : 'MANIFEST_REJECTED', 'manifest', result.manifest?.id, {
    filename: req.file.originalname,
    flight: result.flight?.flight_number,
    error: result.error,
    added: result.added, updated: result.updated, removed: result.removed,
  });
  res.status(result.ok ? 200 : 422).json(result);
});

router.get('/', async (req, res) => {
  const { rows } = await q(
    `SELECT m.*, f.flight_number, f.departure_ts, f.origin_code, f.dest_code, u.full_name AS imported_by_name
       FROM manifests m
       LEFT JOIN flights f ON f.id = m.flight_id
       LEFT JOIN users u ON u.id = m.imported_by
      ORDER BY m.created_at DESC LIMIT 200`
  );
  res.json({ manifests: rows });
});

router.get('/email-log', requireRole('manager'), async (req, res) => {
  const { rows } = await q(
    `SELECT * FROM email_ingest_log ORDER BY created_at DESC LIMIT 200`
  );
  res.json({ log: rows });
});

export default router;
