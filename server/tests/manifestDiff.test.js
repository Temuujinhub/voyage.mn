import test from 'node:test';
import assert from 'node:assert/strict';
import { diffManifest, paxKey } from '../src/services/manifestImport.js';

const row = (over = {}) => ({
  id: over.id || Math.random().toString(36).slice(2),
  employee_id: null, full_name: 'X', status: 'PENDING', active: true, phone: null, waitlisted: false,
  ...over,
});
const inc = (over = {}) => ({ employeeId: null, fullName: 'X', phone: null, waitlisted: false, ...over });

test('paxKey prefers the SAP id, falls back to the name', () => {
  assert.equal(paxKey('1000123', 'Anyone'), 'e:1000123');
  assert.equal(paxKey(null, 'Saruul Bat'), 'n:saruul bat');
});

test('new manifest revision: added / removed / matched split', () => {
  const existing = [
    row({ id: 'a', employee_id: '1', full_name: 'A' }),
    row({ id: 'b', employee_id: '2', full_name: 'B' }),
  ];
  const incoming = [
    inc({ employeeId: '2', fullName: 'B' }),
    inc({ employeeId: '3', fullName: 'C' }),
  ];
  const d = diffManifest(existing, incoming);
  assert.equal(d.added.length, 1);
  assert.equal(d.added[0].fullName, 'C');
  assert.equal(d.removed.length, 1);
  assert.equal(d.removed[0].full_name, 'A');
  assert.equal(d.matched.length, 1);
});

test('a passenger removed by an earlier revision comes back as restored', () => {
  const existing = [row({ id: 'a', employee_id: '1', full_name: 'A', active: false })];
  const d = diffManifest(existing, [inc({ employeeId: '1', fullName: 'A' })]);
  assert.equal(d.restored.length, 1);
  assert.equal(d.added.length, 0);
  assert.equal(d.removed.length, 0);
});

test('inactive rows are not counted as removed again', () => {
  const existing = [row({ id: 'a', employee_id: '1', active: false })];
  const d = diffManifest(existing, []);
  assert.equal(d.removed.length, 0);
});

test('phone / waitlist changes are tracked', () => {
  const existing = [row({ id: 'a', employee_id: '1', full_name: 'A', phone: '99110000' })];
  const d = diffManifest(existing, [inc({ employeeId: '1', fullName: 'A', phone: '88110000', waitlisted: true })]);
  assert.equal(d.changed.length, 1);
  assert.deepEqual(d.changed[0].fields.sort(), ['phone', 'waitlisted']);
});

test('name-keyed matching is case-insensitive when there is no SAP id', () => {
  const existing = [row({ id: 'a', full_name: 'Saruul Bat' })];
  const d = diffManifest(existing, [inc({ fullName: 'SARUUL BAT' })]);
  assert.equal(d.matched.length, 1);
  assert.equal(d.added.length, 0);
});
