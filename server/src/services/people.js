import { q } from '../db/pool.js';

// Central passenger directory. Every manifest import upserts each passenger
// into `people` keyed by their SAP employee_id, so the airline accumulates a
// master registry that outlives individual flights: phone changes are kept as
// history (so a SAP-number lookup still works after a passenger changes SIM),
// and the row is the future anchor for notifications (email/SMS reminders).

// Upsert one manifest row into the directory. Runs inside the import
// transaction (client) so a rejected import leaves no directory changes.
// Matching key, strongest first: SAP employee_id → phone → name+company.
// (Not every OT manifest variant carries a SAP column, so the directory must
// still accumulate from name/phone-only files.)
export async function upsertPerson(client, p) {
  if (!p.employeeId && !p.phone && !p.fullName) return null;

  let found = { rows: [] };
  if (p.employeeId) {
    found = await client.query('SELECT * FROM people WHERE employee_id = $1', [p.employeeId]);
  }
  if (!found.rows.length && p.phone) {
    found = await client.query(
      'SELECT * FROM people WHERE phone = $1 AND employee_id IS NULL LIMIT 1', [p.phone]
    );
  }
  if (!found.rows.length && p.fullName) {
    found = await client.query(
      `SELECT * FROM people WHERE employee_id IS NULL AND lower(full_name) = lower($1)
        AND (company IS NOT DISTINCT FROM $2 OR $2 IS NULL) LIMIT 1`,
      [p.fullName, p.company || null]
    );
  }

  if (!found.rows.length) {
    const { rows } = await client.query(
      `INSERT INTO people (employee_id, full_name, title, phone, company, department, position)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [p.employeeId || null, p.fullName, p.title, p.phone, p.company, p.department, p.position]
    );
    return rows[0].id;
  }
  const cur = found.rows[0];
  // phone changed → keep the old one in history before overwriting
  const phoneChanged = p.phone && cur.phone && p.phone !== cur.phone;
  await client.query(
    `UPDATE people SET
       full_name  = COALESCE($2, full_name),
       title      = COALESCE($3, title),
       phone      = COALESCE($4, phone),
       company    = COALESCE($5, company),
       department = COALESCE($6, department),
       position   = COALESCE($7, position),
       phone_history = CASE WHEN $8::boolean
         THEN phone_history || jsonb_build_object('phone', phone, 'replaced_at', now())
         ELSE phone_history END,
       last_seen_at = now(),
       updated_at   = now()
     WHERE id = $1`,
    [cur.id, p.fullName, p.title, p.phone, p.company, p.department, p.position, phoneChanged]
  );
  return cur.id;
}

export async function refreshFlightCounts(client, personIds) {
  if (!personIds.length) return;
  await client.query(
    `UPDATE people SET flights_count =
       (SELECT count(DISTINCT flight_id) FROM passengers WHERE person_id = people.id AND active)
     WHERE id = ANY($1)`,
    [personIds]
  );
}

// Directory lookup used by the public SAP-number check-in: the manifested
// phone wins, but when the manifest row has no phone (or the number changed)
// the directory's current phone still lets the passenger verify.
export async function phoneFromDirectory(employeeId) {
  const { rows } = await q('SELECT phone FROM people WHERE employee_id = $1', [employeeId]);
  return rows[0]?.phone || null;
}
