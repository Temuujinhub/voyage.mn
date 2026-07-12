import test from 'node:test';
import assert from 'node:assert/strict';
import { totpCode, verifyTotp, base32Encode, base32Decode, generateSecret } from '../src/services/totp.js';

// RFC 6238 Appendix B test vectors (SHA-1, 8→6 digits, secret "12345678901234567890")
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

test('RFC 6238 test vectors (truncated to 6 digits)', () => {
  // T=59s → full 8-digit value 94287082 → 6-digit TOTP is 287082
  assert.equal(totpCode(RFC_SECRET, 59_000), '287082');
  // T=1111111109 → 07081804 → 081804
  assert.equal(totpCode(RFC_SECRET, 1_111_111_109_000), '081804');
  // T=2000000000 → 69279037 → 279037
  assert.equal(totpCode(RFC_SECRET, 2_000_000_000_000), '279037');
});

test('verifyTotp accepts current and adjacent steps, rejects others', () => {
  const t = 1_111_111_109_000;
  assert.equal(verifyTotp(RFC_SECRET, '081804', t), true);
  assert.equal(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, t - 30_000), t), true);  // clock drift −1 step
  assert.equal(verifyTotp(RFC_SECRET, '000000', t), false);
  assert.equal(verifyTotp(RFC_SECRET, '12345', t), false);   // wrong length
  assert.equal(verifyTotp(RFC_SECRET, 'abcdef', t), false);  // non-digits
});

test('base32 round-trips', () => {
  const buf = Buffer.from('voyage-eboarding-test');
  assert.deepEqual(base32Decode(base32Encode(buf)), buf);
});

test('generateSecret is 160-bit base32', () => {
  const s = generateSecret();
  assert.equal(base32Decode(s).length, 20);
  assert.match(s, /^[A-Z2-7]+$/);
});
