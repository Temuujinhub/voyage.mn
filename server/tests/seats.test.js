import test from 'node:test';
import assert from 'node:assert/strict';
import { pickSeat, isValidSeat, allSeats } from '../src/services/seats.js';

const seatMap = {
  rows: [
    { row: 1, seats: [{ c: 'A' }, { c: 'B' }, { c: 'C', blocked: true }] },
    { row: 2, seats: [{ c: 'A' }, { c: 'B' }, { c: 'C' }] },
  ],
};
const sequence = ['1A', '1B', '2A', '2B', '2C'];

test('assignment follows the configured sequence', () => {
  assert.deepEqual(pickSeat({ seatMap, sequence, takenSeats: [] }), { seat: '1A', method: 'sequence' });
  assert.deepEqual(pickSeat({ seatMap, sequence, takenSeats: ['1A', '1B'] }), { seat: '2A', method: 'sequence' });
});

test('falls back to a random free seat when the sequence is exhausted', () => {
  const { seat, method } = pickSeat({ seatMap, sequence: ['1A'], takenSeats: ['1A'] });
  assert.equal(method, 'random');
  assert.ok(allSeats(seatMap).includes(seat));
});

test('returns full when no seats are free', () => {
  const taken = allSeats(seatMap);
  assert.deepEqual(pickSeat({ seatMap, sequence, takenSeats: taken }), { seat: null, method: 'full' });
});

test('blocked seats are invalid and never auto-assigned', () => {
  assert.equal(isValidSeat(seatMap, '1C'), false);
  assert.equal(isValidSeat(seatMap, '2C'), true);
  assert.equal(isValidSeat(seatMap, '9Z'), false);
  assert.ok(!allSeats(seatMap).includes('1C'));
});
