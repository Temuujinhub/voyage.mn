import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { q } from '../db/pool.js';
import { getSettings } from './settings.js';

export function normalizePhone(raw) {
  let s = String(raw || '').replace(/[^\d+]/g, '');
  if (!s) return null;
  if (s.startsWith('+')) return s;
  if (s.startsWith('976')) return `+${s}`;
  if (s.length === 8) return `+976${s}`;
  return `+${s}`;
}

export async function requestOtp(phone) {
  const settings = await getSettings();
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const hash = await bcrypt.hash(code, 8);
  const ttl = settings.otp.ttl_minutes || 5;
  await q(`UPDATE otp_codes SET consumed = TRUE WHERE phone = $1 AND NOT consumed`, [phone]);
  await q(
    `INSERT INTO otp_codes (phone, code_hash, expires_at) VALUES ($1,$2, now() + ($3 || ' minutes')::interval)`,
    [phone, hash, String(ttl)]
  );

  if (settings.otp.mode === 'sms_gateway' && settings.sms_gateway.enabled && settings.sms_gateway.url) {
    // Pluggable HTTP SMS gateway: POST {to, text} with bearer key. The exact
    // provider (Mobicom/Unitel/Skytel corporate gateway) is configured in Settings.
    try {
      await fetch(settings.sms_gateway.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${settings.sms_gateway.api_key}`,
        },
        body: JSON.stringify({
          to: phone,
          text: `Voyage check-in code: ${code}. ${ttl} минутын дотор ашиглана уу.`,
        }),
      });
    } catch (err) {
      console.error('SMS gateway error:', err.message);
      throw new Error('СМС илгээхэд алдаа гарлаа. Түр хүлээгээд дахин оролдоно уу.');
    }
    return { sent: true };
  }
  // dev mode: code is returned to the client so the flow is fully testable
  // before an SMS gateway is connected.
  return { sent: true, devCode: code };
}

export async function verifyOtp(phone, code) {
  const { rows } = await q(
    `SELECT * FROM otp_codes WHERE phone = $1 AND NOT consumed AND expires_at > now()
     ORDER BY created_at DESC LIMIT 1`,
    [phone]
  );
  const rec = rows[0];
  if (!rec) return { ok: false, reason: 'Код хүчингүй болсон. Дахин код авна уу.' };
  if (rec.attempts >= 5) return { ok: false, reason: 'Хэт олон оролдлого. Дахин код авна уу.' };
  await q('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1', [rec.id]);
  const match = await bcrypt.compare(String(code), rec.code_hash);
  if (!match) return { ok: false, reason: 'Код буруу байна.' };
  await q('UPDATE otp_codes SET consumed = TRUE WHERE id = $1', [rec.id]);
  return { ok: true };
}
