import pg from 'pg';
import cfg from '../config.js';

const { Pool } = pg;

// Prefer discrete PG* env vars (PGHOST/PGUSER/PGPASSWORD/PGDATABASE/PGPORT)
// when provided — this avoids embedding the password in a connection-string
// URL, so passwords containing URL-special characters (spaces, @, /, [, …)
// work without any encoding. Fall back to DATABASE_URL, then the dev default.
function makePool() {
  if (process.env.DATABASE_URL) {
    return new Pool({ connectionString: process.env.DATABASE_URL, max: 20 });
  }
  if (process.env.PGHOST || process.env.PGPASSWORD || process.env.PGUSER) {
    // node-postgres reads the PG* variables from the environment directly
    return new Pool({ max: 20 });
  }
  return new Pool({ connectionString: cfg.databaseUrl, max: 20 });
}

export const pool = makePool();

export const q = (text, params) => pool.query(text, params);

export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
