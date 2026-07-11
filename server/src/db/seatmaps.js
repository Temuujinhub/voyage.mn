// Aircraft seat map definitions, transcribed from the OT charter seat charts
// (JU-1188 seat.png — 143 seats, JU-1199 seat.png — 141 seats).
// Seat flags: blocked = not sellable (excluded from total), reserved = held
// back from auto-assignment until the normal sequence is exhausted.

function buildRows(defs) {
  return defs.map(({ row, letters, zone, reserved = [], blocked = [] }) => ({
    row,
    zone,
    seats: letters.map((c) => ({
      c,
      reserved: reserved.includes(c),
      blocked: blocked.includes(c),
    })),
  }));
}

const ALL = ['A', 'B', 'C', 'D', 'E', 'F'];

// JU-1188 — Airbus A319, 143 seats. Row 1 blocked (crew), zones A:1-8 B:9-17 C:18-26.
const ju1188Rows = [];
for (let r = 1; r <= 26; r++) {
  const zone = r <= 8 ? 'A' : r <= 17 ? 'B' : 'C';
  let letters = ALL;
  if (r === 25) letters = ['A', 'B', 'C'];
  if (r === 26) letters = ['A', 'B'];
  const def = { row: r, letters, zone, reserved: [], blocked: [] };
  if (r === 1) def.blocked = [...letters];
  if (r === 9 || r === 10) def.reserved = [...letters];
  if (r === 24) def.reserved = ['D', 'E', 'F'];
  if (r === 26) def.reserved = ['A', 'B'];
  ju1188Rows.push(def);
}

// JU-1199 — Airbus A319, 141 seats. Zones A:1-6 B:7-15 C:16-24.
const ju1199Rows = [];
for (let r = 1; r <= 24; r++) {
  const zone = r <= 6 ? 'A' : r <= 15 ? 'B' : 'C';
  let letters = ALL;
  if (r === 24) letters = ['A', 'B', 'C'];
  const def = { row: r, letters, zone, reserved: [], blocked: [] };
  if (r === 1 || r === 9 || r === 10) def.reserved = [...letters];
  if (r === 23) def.reserved = ['D', 'E', 'F'];
  if (r === 24) def.reserved = ['A', 'B', 'C'];
  ju1199Rows.push(def);
}

// Embraer E145 — 50 seats, 1+2 layout (A | C D). Zones A:1-6 B:7-12 C:13-17.
const e145Rows = [];
for (let r = 1; r <= 17; r++) {
  const zone = r <= 6 ? 'A' : r <= 12 ? 'B' : 'C';
  const letters = r === 17 ? ['C', 'D'] : ['A', 'C', 'D'];
  e145Rows.push({ row: r, letters, zone, reserved: [], blocked: [] });
}

export function countSeats(seatMap) {
  return seatMap.rows.reduce(
    (n, row) => n + row.seats.filter((s) => !s.blocked).length,
    0
  );
}

// Default auto-assignment order: front-to-back, left-to-right, skipping
// blocked and reserved seats. Reserved seats are appended at the end so the
// sequence only reaches them once every regular seat is taken.
export function generateSequence(seatMap) {
  const normal = [];
  const reserved = [];
  for (const row of seatMap.rows) {
    for (const seat of row.seats) {
      if (seat.blocked) continue;
      const code = `${row.row}${seat.c}`;
      (seat.reserved ? reserved : normal).push(code);
    }
  }
  return [...normal, ...reserved];
}

export const AIRCRAFT = [
  {
    code: 'JU-1188',
    model: 'Airbus A319',
    seatMap: { aisleAfter: 'C', rows: buildRows(ju1188Rows) },
  },
  {
    code: 'JU-1199',
    model: 'Airbus A319',
    seatMap: { aisleAfter: 'C', rows: buildRows(ju1199Rows) },
  },
  {
    code: 'E145',
    model: 'Embraer ERJ-145',
    seatMap: { aisleAfter: 'A', rows: buildRows(e145Rows) },
  },
];
