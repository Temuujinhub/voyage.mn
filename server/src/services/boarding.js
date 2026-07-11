import { q } from '../db/pool.js';
import { verifyPayload, parseBcbp } from './bcbp.js';
import { emitFlight } from './live.js';

// Two-step verification (Voyage Lite spec): SECURITY scan first, then GATE.
// Every attempt — valid or not — is written to scan_events for the audit trail.

async function logScan({ passengerId, flightId, point, result, rawCode, byUserId }) {
  await q(
    `INSERT INTO scan_events (passenger_id, flight_id, point, result, raw_code, scanned_by)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [passengerId, flightId, point, result, rawCode?.slice(0, 512) || null, byUserId]
  );
}

export async function processScan({ code, point, flightId = null, byUserId }) {
  const fail = async (result, message, pax = null) => {
    await logScan({ passengerId: pax?.id || null, flightId: pax?.flight_id || flightId, point, result, rawCode: code, byUserId });
    if (pax) emitFlight(pax.flight_id, 'scan:event', { flightId: pax.flight_id, result, passenger: publicPax(pax), point });
    return { ok: false, result, message, passenger: pax ? publicPax(pax) : null };
  };

  const sig = verifyPayload(String(code || '').trim());
  if (!sig.ok) return fail('INVALID', 'QR код хүчингүй эсвэл гарын үсэг буруу');
  const parsed = parseBcbp(sig.bcbp);
  if (!parsed) return fail('INVALID', 'BCBP формат танигдсангүй');

  const { rows } = await q(
    `SELECT p.*, f.status AS flight_status, f.flight_number, f.dest_code, f.gate
       FROM passengers p JOIN flights f ON f.id = p.flight_id
      WHERE p.pnr = $1 AND p.qr_token = $2`,
    [parsed.pnr, String(code).trim()]
  );
  const pax = rows[0];
  if (!pax) return fail('NOT_FOUND', 'Зорчигчийн бүртгэл олдсонгүй (offload хийгдсэн байж болно)');
  if (flightId && pax.flight_id !== flightId) return fail('WRONG_FLIGHT', `Өөр нислэгийн зорчигч: ${pax.flight_number}`, pax);
  if (pax.flight_status === 'DEPARTED' || pax.flight_status === 'CANCELLED') {
    return fail('FLIGHT_CLOSED', `Нислэг ${pax.flight_status === 'DEPARTED' ? 'хөөрсөн' : 'цуцлагдсан'}`, pax);
  }

  if (point === 'SECURITY') {
    if (pax.status === 'BOARDED') return fail('ALREADY_BOARDED', 'Аль хэдийн онгоцонд суусан', pax);
    if (pax.status === 'SECURITY_PASSED') return fail('DUPLICATE', 'Аюулгүй байдлын шалгалтыг давхар уншуулав', pax);
    if (pax.status !== 'CHECKED_IN') return fail('NOT_CHECKED_IN', 'Check-in хийгдээгүй байна', pax);
    await q(`UPDATE passengers SET status='SECURITY_PASSED', security_ts=now(), updated_at=now() WHERE id=$1`, [pax.id]);
  } else if (point === 'GATE') {
    if (pax.status === 'BOARDED') return fail('ALREADY_BOARDED', 'Давхар уншилт: аль хэдийн онгоцонд суусан', pax);
    if (pax.status === 'CHECKED_IN') return fail('NO_SECURITY', 'Аюулгүй байдлын шалгалтаар ороогүй байна', pax);
    if (pax.status !== 'SECURITY_PASSED') return fail('NOT_CHECKED_IN', 'Check-in хийгдээгүй байна', pax);
    await q(`UPDATE passengers SET status='BOARDED', boarded_ts=now(), updated_at=now() WHERE id=$1`, [pax.id]);
  } else {
    return fail('INVALID', 'Тодорхойгүй хяналтын цэг');
  }

  await logScan({ passengerId: pax.id, flightId: pax.flight_id, point, result: 'OK', rawCode: code, byUserId });
  const updated = { ...pax, status: point === 'GATE' ? 'BOARDED' : 'SECURITY_PASSED' };
  emitFlight(pax.flight_id, 'scan:event', { flightId: pax.flight_id, result: 'OK', point, passenger: publicPax(updated) });
  emitFlight(pax.flight_id, 'passenger:update', { flightId: pax.flight_id, passenger: publicPax(updated) });
  return {
    ok: true,
    result: 'OK',
    message: point === 'GATE' ? 'Онгоцонд суухыг зөвшөөрөв' : 'Аюулгүй байдлын шалгалт OK',
    passenger: publicPax(updated),
  };
}

function publicPax(p) {
  return {
    id: p.id,
    flight_id: p.flight_id,
    full_name: p.full_name,
    title: p.title,
    seat: p.seat,
    pnr: p.pnr,
    status: p.status,
    employee_id: p.employee_id,
    company: p.company,
    checkin_seq: p.checkin_seq,
  };
}
