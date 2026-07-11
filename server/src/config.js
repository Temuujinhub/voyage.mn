import 'dotenv/config';

const cfg = {
  port: parseInt(process.env.PORT || '4000', 10),
  env: process.env.NODE_ENV || 'development',
  databaseUrl:
    process.env.DATABASE_URL ||
    'postgres://voyage:voyage_dev_pw@localhost:5432/voyage',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  // HMAC key used to sign boarding pass QR payloads
  qrSecret: process.env.QR_SECRET || process.env.JWT_SECRET || 'dev-only-qr-secret',
  jwtExpires: process.env.JWT_EXPIRES || '12h',
  passengerJwtExpires: process.env.PASSENGER_JWT_EXPIRES || '2h',
  publicBaseUrl: process.env.PUBLIC_BASE_URL || 'http://localhost:4000',
};

if (cfg.env === 'production' && (!process.env.JWT_SECRET || !process.env.QR_SECRET)) {
  // eslint-disable-next-line no-console
  console.error('FATAL: JWT_SECRET and QR_SECRET must be set in production');
  process.exit(1);
}

export default cfg;
