import crypto from 'node:crypto';
import { q } from '../db/pool.js';

// Unambiguous alphabet (no 0/O, 1/I) for 6-character record locators.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomPnr() {
  const bytes = crypto.randomBytes(6);
  let out = '';
  for (let i = 0; i < 6; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export async function uniquePnr(flightId) {
  for (let i = 0; i < 20; i++) {
    const pnr = randomPnr();
    const { rows } = await q(
      'SELECT 1 FROM passengers WHERE flight_id = $1 AND pnr = $2',
      [flightId, pnr]
    );
    if (rows.length === 0) return pnr;
  }
  throw new Error('could not generate unique PNR');
}
