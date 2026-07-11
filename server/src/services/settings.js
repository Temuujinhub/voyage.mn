import { q } from '../db/pool.js';
import { DEFAULT_SETTINGS } from '../db/seed.js';

const cache = new Map();
let loadedAt = 0;
const TTL = 15000;

export async function getSettings(force = false) {
  if (force || Date.now() - loadedAt > TTL) {
    const { rows } = await q('SELECT key, value FROM settings');
    cache.clear();
    for (const r of rows) cache.set(r.key, r.value);
    loadedAt = Date.now();
  }
  const out = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    out[key] = cache.has(key) ? cache.get(key) : DEFAULT_SETTINGS[key];
  }
  return out;
}

export async function getSetting(key) {
  return (await getSettings())[key];
}

export async function setSetting(key, value, userId) {
  if (!(key in DEFAULT_SETTINGS)) throw new Error(`unknown setting: ${key}`);
  await q(
    `INSERT INTO settings (key, value, updated_by, updated_at) VALUES ($1,$2,$3,now())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = now()`,
    [key, JSON.stringify(value), userId || null]
  );
  loadedAt = 0;
}
