import test from 'node:test';
import assert from 'node:assert/strict';
import { licensePlate, itf2of5Svg } from '../src/services/barcode.js';

test('licensePlate builds an IATA 740 10-digit tag number', () => {
  assert.equal(licensePlate('888', 100001), '0888100001');
  assert.equal(licensePlate('5', 42), '0005000042');
  assert.equal(licensePlate('888', '99100001'), '0888100001'); // serial keeps its last 6 digits
});

test('itf2of5Svg renders an SVG with bars', () => {
  const svg = itf2of5Svg('0888100001');
  assert.ok(svg.startsWith('<svg'), 'svg root');
  assert.ok(svg.includes('<rect'), 'has bars');
});

test('itf2of5Svg rejects odd-length input (ITF encodes digit pairs)', () => {
  assert.throws(() => itf2of5Svg('12345'), /even number/);
});
