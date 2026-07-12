import crypto from 'node:crypto';

// RFC 6238 TOTP (SHA-1, 6 digits, 30s step) — implemented directly so no
// extra dependency is pulled in for 20 lines of crypto.

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str) {
  const clean = str.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateSecret() {
  return base32Encode(crypto.randomBytes(20)); // 160-bit, the RFC-recommended size
}

function hotp(secretB32, counter) {
  const key = base32Decode(secretB32);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', key).update(msg).digest();
  const offset = h[h.length - 1] & 0x0f;
  const code = ((h[offset] & 0x7f) << 24) | (h[offset + 1] << 16) | (h[offset + 2] << 8) | h[offset + 3];
  return String(code % 1_000_000).padStart(6, '0');
}

export function totpCode(secretB32, time = Date.now(), stepSeconds = 30) {
  return hotp(secretB32, Math.floor(time / 1000 / stepSeconds));
}

// Accept the previous/next step too (clock drift on phones).
export function verifyTotp(secretB32, code, time = Date.now(), stepSeconds = 30) {
  const want = String(code || '').replace(/\D/g, '');
  if (want.length !== 6) return false;
  const counter = Math.floor(time / 1000 / stepSeconds);
  for (const c of [counter, counter - 1, counter + 1]) {
    const expected = hotp(secretB32, c);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(want))) return true;
  }
  return false;
}

export function otpauthUrl(secretB32, username, issuer = 'Voyage E-Boarding') {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(username)}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`;
}
