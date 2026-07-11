import crypto from 'node:crypto';
import cfg from '../config.js';

// IATA Resolution 792 — Bar Coded Boarding Pass (BCBP), single-leg "M1" format.
// The mandatory 60-character block is produced exactly to spec so any airport
// scanner can decode it; we then append "^<sig>" — an HMAC-SHA256 signature the
// Voyage gate scanners verify so passes cannot be forged.

const pad = (s, len) => String(s ?? '').toUpperCase().slice(0, len).padEnd(len, ' ');

export function julianDay(date) {
  const d = new Date(date);
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((d.getTime() - start) / 86400000);
}

export function bcbpName(fullName, title) {
  // Manifest names come as "Mr. Adiya Sereenen" => first token given name,
  // remainder surname per OT convention "Firstname Lastname".
  let name = String(fullName || '').replace(/^(mr|ms|mrs|dr)\.?\s+/i, '').trim();
  const parts = name.split(/\s+/);
  const first = parts[0] || '';
  const last = parts.slice(1).join(' ') || first;
  return { first, last };
}

export function buildBcbp({
  fullName,
  pnr,
  fromBcbp,
  toBcbp,
  carrier,
  flightNumber, // numeric part, e.g. "9516"
  departureTs,
  compartment = 'Y',
  seat,
  checkinSeq,
}) {
  const { first, last } = bcbpName(fullName);
  const name = pad(`${last}/${first}`, 20);
  const jdate = String(julianDay(departureTs)).padStart(3, '0');
  const seatF = pad(String(seat || '').padStart(4, '0'), 4); // "12C" -> "012C"
  // take the trailing digit group so "M0-9516" -> "9516" (not the carrier's 0)
  const numPart = (String(flightNumber || '').match(/(\d+)\s*$/) || [])[1] || '0';
  const flightF = pad(numPart.padStart(4, '0'), 5);
  const seqF = String(checkinSeq || 1).padStart(4, '0') + ' ';
  const s =
    'M1' +
    name +
    'E' +
    pad(pnr, 7) +
    pad(fromBcbp, 3) +
    pad(toBcbp, 3) +
    pad(carrier, 3) +
    flightF +
    jdate +
    compartment +
    seatF +
    seqF +
    '1' + // passenger status: 1 = checked in
    '00'; // no conditional data
  return s;
}

export function signPayload(bcbp) {
  const sig = crypto
    .createHmac('sha256', cfg.qrSecret)
    .update(bcbp)
    .digest('base64url')
    .slice(0, 16);
  return `${bcbp}^${sig}`;
}

export function verifyPayload(raw) {
  const idx = raw.lastIndexOf('^');
  if (idx === -1) return { ok: false, reason: 'UNSIGNED' };
  const bcbp = raw.slice(0, idx);
  const sig = raw.slice(idx + 1);
  const expected = crypto
    .createHmac('sha256', cfg.qrSecret)
    .update(bcbp)
    .digest('base64url')
    .slice(0, 16);
  const ok =
    sig.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  return { ok, bcbp, reason: ok ? null : 'BAD_SIGNATURE' };
}

export function parseBcbp(bcbp) {
  if (!bcbp || !bcbp.startsWith('M1') || bcbp.length < 58) return null;
  return {
    name: bcbp.slice(2, 22).trim(),
    pnr: bcbp.slice(23, 30).trim(),
    from: bcbp.slice(30, 33).trim(),
    to: bcbp.slice(33, 36).trim(),
    carrier: bcbp.slice(36, 39).trim(),
    flightNumber: bcbp.slice(39, 44).trim(),
    julianDate: bcbp.slice(44, 47),
    compartment: bcbp.slice(47, 48),
    seat: bcbp.slice(48, 52).replace(/^0+/, ''),
    checkinSeq: parseInt(bcbp.slice(52, 57), 10),
  };
}
