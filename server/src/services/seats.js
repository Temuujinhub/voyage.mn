// Seat auto-assignment: walk the aircraft's configured sequence; when the
// sequence is exhausted (irregular ops, oversize manifest edits, manual seat
// changes) fall back to a random free seat so check-in is never blocked.

export function allSeats(seatMap, { includeBlocked = false } = {}) {
  const out = [];
  for (const row of seatMap.rows) {
    for (const seat of row.seats) {
      if (seat.blocked && !includeBlocked) continue;
      out.push(`${row.row}${seat.c}`);
    }
  }
  return out;
}

export function pickSeat({ seatMap, sequence, takenSeats }) {
  const taken = new Set(takenSeats);
  for (const code of sequence || []) {
    if (!taken.has(code)) return { seat: code, method: 'sequence' };
  }
  const free = allSeats(seatMap).filter((code) => !taken.has(code));
  if (free.length === 0) return { seat: null, method: 'full' };
  const seat = free[Math.floor(Math.random() * free.length)];
  return { seat, method: 'random' };
}

export function isValidSeat(seatMap, code) {
  for (const row of seatMap.rows) {
    for (const seat of row.seats) {
      if (`${row.row}${seat.c}` === code) return !seat.blocked;
    }
  }
  return false;
}
