import { Router } from 'express';
import { authRequired, requireRole } from '../middleware/auth.js';
import { getSettings, setSetting } from '../services/settings.js';
import { audit } from '../services/audit.js';

const router = Router();
router.use(authRequired);

const SECRET_KEYS = { imap: ['pass'], sms_gateway: ['api_key'] };

function mask(key, value) {
  const secrets = SECRET_KEYS[key];
  if (!secrets || !value) return value;
  const copy = { ...value };
  for (const s of secrets) if (copy[s]) copy[s] = '••••••••';
  return copy;
}

router.get('/', requireRole('manager'), async (req, res) => {
  const settings = await getSettings(true);
  const out = {};
  for (const [k, v] of Object.entries(settings)) out[k] = mask(k, v);
  res.json({ settings: out });
});

router.put('/:key', requireRole('admin'), async (req, res) => {
  const key = req.params.key;
  const incoming = req.body?.value;
  if (incoming === undefined) return res.status(400).json({ error: 'value шаардлагатай' });
  try {
    // keep stored secrets when the client sends back the masked placeholder
    const current = (await getSettings(true))[key];
    const secrets = SECRET_KEYS[key] || [];
    const value = typeof incoming === 'object' && incoming !== null ? { ...incoming } : incoming;
    for (const s of secrets) {
      if (value && value[s] === '••••••••') value[s] = current?.[s] || '';
    }
    await setSetting(key, value, req.user.id);
    await audit(req, 'SETTING_UPDATED', 'setting', key, { keys: typeof value === 'object' ? Object.keys(value) : undefined });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
