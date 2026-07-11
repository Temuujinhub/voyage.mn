import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { pool, q } from './pool.js';
import { migrate } from './migrate.js';
import { AIRCRAFT, countSeats, generateSequence } from './seatmaps.js';

export const DEFAULT_SETTINGS = {
  airline: {
    name: 'Aero Mongolia',
    iata: 'M0',
    // 3-digit numeric code used on baggage tag license plates (IATA 740).
    // Charter operations may be assigned a custom code — configurable here.
    numeric_code: '888',
    logo_text: 'AERO MONGOLIA',
  },
  airports: [
    { code: 'UB', bcbp: 'ULN', name: 'Ulaanbaatar — Chinggis Khaan Intl' },
    { code: 'OT', bcbp: 'OYT', name: 'Oyu Tolgoi — Khanbumbat' },
  ],
  manifest_window: { max_hours_before: 24, min_hours_before: 3 },
  baggage: { free_allowance_kg: 15, excess_fee_per_kg: 2500, currency: 'MNT' },
  checkin: { open_hours_before: 24, close_minutes_before: 30 },
  otp: { mode: 'dev', ttl_minutes: 5 }, // dev | sms_gateway
  sms_gateway: { url: '', api_key: '', enabled: false },
  imap: {
    enabled: false,
    host: '',
    port: 993,
    secure: true,
    user: '',
    pass: '',
    folder: 'INBOX',
    poll_seconds: 120,
    allowed_senders: [],
  },
};

export async function seed() {
  await migrate();

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await q(
      'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
      [key, JSON.stringify(value)]
    );
  }

  for (const ac of AIRCRAFT) {
    await q(
      `INSERT INTO aircraft_types (code, model, total_seats, seat_map, assignment_sequence)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (code) DO NOTHING`,
      [
        ac.code,
        ac.model,
        countSeats(ac.seatMap),
        JSON.stringify(ac.seatMap),
        JSON.stringify(generateSequence(ac.seatMap)),
      ]
    );
  }

  const { rows } = await q('SELECT 1 FROM users LIMIT 1');
  if (rows.length === 0) {
    const password = process.env.ADMIN_PASSWORD || 'ChangeMe#2026';
    const hash = await bcrypt.hash(password, 10);
    await q(
      `INSERT INTO users (username, password_hash, full_name, role, email)
       VALUES ('admin', $1, 'System Administrator', 'admin', $2)`,
      [hash, process.env.ADMIN_EMAIL || 'admin@voyage.mn']
    );
    console.log(`seeded admin user (username: admin, password: ${password})`);
  }
  console.log('seed complete');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seed()
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
