import { q, tx } from '../db/pool.js';
import { getSettings } from './settings.js';
import { pickSeat, isValidSeat } from './seats.js';
import { buildBcbp, signPayload } from './bcbp.js';
import { licensePlate } from './barcode.js';
import { emitFlight } from './live.js';

export class CheckinError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.status = 400;
  }
}

export async function loadFlightForCheckin(flightId) {
  const { rows } = await q(
    `SELECT f.*, a.seat_map, a.assignment_sequence, a.total_seats, a.code AS aircraft_code, a.model AS aircraft_model
       FROM flights f JOIN aircraft_types a ON a.id = f.aircraft_type_id
      WHERE f.id = $1`,
    [flightId]
  );
  return rows[0] || null;
}

export function assertCheckinOpen(flight) {
  if (flight.status === 'CHECKIN_OPEN' || flight.status === 'BOARDING') return;
  const msg = {
    SCHEDULED: 'Check-in нээгдээгүй байна',
    DEPARTED: 'Нислэг хөөрсөн',
    CANCELLED: 'Нислэг цуцлагдсан',
  }[flight.status] || `Check-in боломжгүй (${flight.status})`;
  throw new CheckinError('CHECKIN_CLOSED', msg);
}

// Perform check-in: assign a seat (requested or auto), allocate the boarding
// sequence number, build + sign the BCBP QR payload, register baggage.
export async function checkinPassenger({
  passengerId,
  requestedSeat = null,
  baggage = [], // [{weight_kg}]
  baggagePending = false,
  byUserId = null,
}) {
  const settings = await getSettings();

  return tx(async (client) => {
    const { rows: prow } = await client.query(
      'SELECT * FROM passengers WHERE id = $1 FOR UPDATE', [passengerId]
    );
    const pax = prow[0];
    if (!pax) throw new CheckinError('NOT_FOUND', 'Зорчигч олдсонгүй');
    if (pax.active === false) {
      throw new CheckinError('REMOVED', `${pax.full_name} сүүлийн manifest-ээс хасагдсан — бүртгэх боломжгүй`);
    }
    if (pax.status !== 'PENDING' && pax.status !== 'OFFLOADED') {
      throw new CheckinError('ALREADY_CHECKED_IN', `${pax.full_name} аль хэдийн бүртгүүлсэн (${pax.status})`);
    }

    const flight = await loadFlightForCheckin(pax.flight_id);
    assertCheckinOpen(flight);

    const { rows: taken } = await client.query(
      `SELECT seat FROM passengers WHERE flight_id = $1 AND seat IS NOT NULL AND status <> 'OFFLOADED'`,
      [pax.flight_id]
    );
    const takenSeats = taken.map((r) => r.seat);

    let seat = requestedSeat;
    let method = 'manual';
    if (seat) {
      if (!isValidSeat(flight.seat_map, seat)) throw new CheckinError('BAD_SEAT', `${seat} суудал энэ онгоцонд байхгүй`);
      if (takenSeats.includes(seat)) throw new CheckinError('SEAT_TAKEN', `${seat} суудал захиалагдсан байна`);
    } else {
      ({ seat, method } = pickSeat({
        seatMap: flight.seat_map,
        sequence: flight.assignment_sequence,
        takenSeats,
      }));
      if (!seat) throw new CheckinError('FLIGHT_FULL', 'Сул суудал байхгүй');
    }

    const { rows: seqr } = await client.query(
      `SELECT COALESCE(MAX(checkin_seq), 0) + 1 AS next FROM passengers WHERE flight_id = $1`,
      [pax.flight_id]
    );
    const checkinSeq = seqr[0].next;

    const airports = settings.airports || [];
    const bcbpOf = (code) => airports.find((a) => a.code === code)?.bcbp || code;
    const bcbp = buildBcbp({
      fullName: pax.full_name,
      pnr: pax.pnr,
      fromBcbp: bcbpOf(flight.origin_code),
      toBcbp: bcbpOf(flight.dest_code),
      carrier: settings.airline.iata,
      flightNumber: flight.flight_number,
      departureTs: flight.departure_ts,
      seat,
      checkinSeq,
    });
    const qrToken = signPayload(bcbp);

    await client.query(
      `UPDATE passengers SET status='CHECKED_IN', seat=$2, checkin_seq=$3, checkin_ts=now(),
         checkin_by=$4, qr_token=$5, baggage_pending=$6, security_ts=NULL, boarded_ts=NULL, updated_at=now()
       WHERE id=$1`,
      [pax.id, seat, checkinSeq, byUserId, qrToken, baggagePending]
    );

    const allowance = settings.baggage.free_allowance_kg;
    const feePerKg = settings.baggage.excess_fee_per_kg;
    const tags = [];
    for (const bag of baggage) {
      const weight = Number(bag.weight_kg) || 0;
      const excess = Math.max(0, weight - allowance);
      const { rows: ser } = await client.query(`SELECT nextval('baggage_serial_seq') AS s`);
      const tag = licensePlate(settings.airline.numeric_code, ser[0].s);
      const { rows: brow } = await client.query(
        `INSERT INTO baggage (passenger_id, flight_id, tag_number, weight_kg, excess_kg, excess_fee, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [pax.id, pax.flight_id, tag, weight, excess, excess * feePerKg, byUserId]
      );
      tags.push(brow[0]);
    }

    const { rows: fresh } = await client.query('SELECT * FROM passengers WHERE id = $1', [pax.id]);
    emitFlight(pax.flight_id, 'passenger:update', { flightId: pax.flight_id, passenger: fresh[0] });
    return { passenger: fresh[0], flight, baggage: tags, seatMethod: method };
  });
}

export async function offloadPassenger(passengerId, byUserId) {
  const { rows } = await q(
    `UPDATE passengers SET status='OFFLOADED', seat=NULL, qr_token=NULL, baggage_pending=FALSE,
       checkin_by=$2, updated_at=now()
     WHERE id=$1 AND status IN ('CHECKED_IN','SECURITY_PASSED') RETURNING *`,
    [passengerId, byUserId]
  );
  if (rows.length === 0) throw new CheckinError('CANNOT_OFFLOAD', 'Зөвхөн бүртгүүлсэн (онгоцонд суугаагүй) зорчигчийг offload хийнэ');
  await q('DELETE FROM baggage WHERE passenger_id = $1', [passengerId]);
  emitFlight(rows[0].flight_id, 'passenger:update', { flightId: rows[0].flight_id, passenger: rows[0] });
  return rows[0];
}
