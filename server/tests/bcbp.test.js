import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBcbp, signPayload, verifyPayload, parseBcbp, bcbpName, julianDay } from '../src/services/bcbp.js';

const sample = () => buildBcbp({
  fullName: 'Saruul Bat',
  pnr: 'LVHWJ3',
  fromBcbp: 'ULN',
  toBcbp: 'OYT',
  carrier: 'M0',
  flightNumber: 'M0-9515',
  departureTs: '2026-07-12T02:00:00Z',
  seat: '2B',
  checkinSeq: 2,
});

test('buildBcbp produces an IATA M1 record', () => {
  const s = sample();
  assert.ok(s.startsWith('M1'), 'starts with M1');
  assert.ok(s.includes('LVHWJ3'), 'contains PNR');
  assert.ok(s.includes('ULN'), 'origin BCBP code');
  assert.ok(s.includes('OYT'), 'destination BCBP code');
  assert.ok(s.length >= 58, 'mandatory field length');
});

test('parseBcbp round-trips the fields', () => {
  const p = parseBcbp(sample());
  assert.equal(p.pnr, 'LVHWJ3');
  assert.equal(p.from, 'ULN');
  assert.equal(p.to, 'OYT');
});

test('signed payload verifies; tampering is rejected', () => {
  const signed = signPayload(sample());
  assert.equal(verifyPayload(signed).ok, true);

  // flip the seat inside the payload — signature must fail
  const tampered = signed.replace('LVHWJ3', 'HACKED1');
  assert.equal(verifyPayload(tampered).ok, false);

  // strip the signature entirely
  assert.equal(verifyPayload(sample()).ok, false);
});

test('bcbpName transliterates and splits', () => {
  const { first, last } = bcbpName('Saruul Bat');
  assert.equal(typeof first, 'string');
  assert.equal(typeof last, 'string');
  assert.ok(last.length > 0);
});

test('julianDay matches known dates', () => {
  assert.equal(julianDay('2026-01-01T00:00:00Z'), 1);
  assert.equal(julianDay('2026-12-31T12:00:00Z'), 365);
});
