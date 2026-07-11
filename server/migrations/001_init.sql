-- Voyage E-Boarding System — initial schema
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(128) NOT NULL,
  full_name     VARCHAR(128) NOT NULL,
  role          VARCHAR(16)  NOT NULL CHECK (role IN ('admin','manager','agent','ot_staff')),
  email         VARCHAR(128),
  phone         VARCHAR(32),
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS aircraft_types (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                VARCHAR(16) NOT NULL UNIQUE,      -- e.g. JU-1188
  model               VARCHAR(64) NOT NULL,             -- e.g. Airbus A319
  total_seats         INT NOT NULL,
  seat_map            JSONB NOT NULL,                   -- {rows:[{row:1, seats:[{c:'A',zone:'A',reserved:false,blocked:false}]}], aisle_after:'C'}
  assignment_sequence JSONB NOT NULL DEFAULT '[]',      -- ["2A","2B",...] auto-assign order
  active              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS flights (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flight_number    VARCHAR(16) NOT NULL,                -- e.g. M0-9516
  charter_code     VARCHAR(32),                         -- OT transport number, e.g. JU-1199 WED2
  aircraft_type_id UUID NOT NULL REFERENCES aircraft_types(id),
  origin_code      VARCHAR(8)  NOT NULL,                -- UB / OT
  origin_name      VARCHAR(64) NOT NULL,
  dest_code        VARCHAR(8)  NOT NULL,
  dest_name        VARCHAR(64) NOT NULL,
  direction        VARCHAR(4),                          -- OUT (site->UB) / IN (UB->site)
  departure_ts     TIMESTAMPTZ NOT NULL,
  arrival_ts       TIMESTAMPTZ,
  gate             VARCHAR(8),
  status           VARCHAR(16) NOT NULL DEFAULT 'SCHEDULED'
                   CHECK (status IN ('SCHEDULED','CHECKIN_OPEN','BOARDING','DEPARTED','CANCELLED')),
  delay_minutes    INT NOT NULL DEFAULT 0,
  delay_reason     TEXT,
  notes            TEXT,
  created_by       UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (flight_number, departure_ts)
);
CREATE INDEX IF NOT EXISTS idx_flights_departure ON flights (departure_ts);
CREATE INDEX IF NOT EXISTS idx_flights_charter   ON flights (charter_code);
CREATE INDEX IF NOT EXISTS idx_flights_status    ON flights (status);

CREATE TABLE IF NOT EXISTS manifests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flight_id       UUID REFERENCES flights(id) ON DELETE SET NULL,
  source          VARCHAR(16) NOT NULL CHECK (source IN ('email','upload')),
  filename        VARCHAR(256),
  status          VARCHAR(16) NOT NULL CHECK (status IN ('ACCEPTED','REJECTED')),
  passenger_count INT NOT NULL DEFAULT 0,
  error           TEXT,
  warnings        JSONB NOT NULL DEFAULT '[]',
  header_meta     JSONB NOT NULL DEFAULT '{}',          -- parsed header block from the Excel
  email_from      VARCHAR(256),
  email_subject   VARCHAR(512),
  imported_by     UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_manifests_flight ON manifests (flight_id);

CREATE TABLE IF NOT EXISTS passengers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flight_id      UUID NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
  manifest_id    UUID REFERENCES manifests(id) ON DELETE SET NULL,
  seq            INT,                                   -- row number in manifest
  pnr            VARCHAR(6) NOT NULL,
  title          VARCHAR(8),
  full_name      VARCHAR(128) NOT NULL,
  company        VARCHAR(128),
  department     VARCHAR(128),
  position       VARCHAR(128),
  cost_center    VARCHAR(128),
  employee_id    VARCHAR(32),                           -- OT SAP profile id
  phone          VARCHAR(32),
  pickup_address VARCHAR(256),
  waitlisted     BOOLEAN NOT NULL DEFAULT FALSE,
  status         VARCHAR(16) NOT NULL DEFAULT 'PENDING'
                 CHECK (status IN ('PENDING','CHECKED_IN','SECURITY_PASSED','BOARDED','OFFLOADED')),
  seat           VARCHAR(5),
  checkin_seq    INT,                                   -- boarding pass sequence number
  checkin_ts     TIMESTAMPTZ,
  checkin_by     UUID REFERENCES users(id),             -- NULL => self check-in
  security_ts    TIMESTAMPTZ,
  boarded_ts     TIMESTAMPTZ,
  qr_token       TEXT,                                  -- BCBP string + HMAC signature
  baggage_pending BOOLEAN NOT NULL DEFAULT FALSE,       -- self check-in declared baggage, not yet dropped
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (flight_id, pnr)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_passengers_seat ON passengers (flight_id, seat) WHERE seat IS NOT NULL AND status <> 'OFFLOADED';
CREATE INDEX IF NOT EXISTS idx_passengers_flight ON passengers (flight_id);
CREATE INDEX IF NOT EXISTS idx_passengers_phone  ON passengers (phone);
CREATE INDEX IF NOT EXISTS idx_passengers_emp    ON passengers (employee_id);
CREATE INDEX IF NOT EXISTS idx_passengers_name   ON passengers (full_name);

CREATE SEQUENCE IF NOT EXISTS baggage_serial_seq START 100001;

CREATE TABLE IF NOT EXISTS baggage (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id UUID NOT NULL REFERENCES passengers(id) ON DELETE CASCADE,
  flight_id    UUID NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
  tag_number   VARCHAR(10) NOT NULL UNIQUE,             -- IATA 740 license plate: 0 + 3-digit airline + 6-digit serial
  weight_kg    NUMERIC(6,2) NOT NULL DEFAULT 0,
  excess_kg    NUMERIC(6,2) NOT NULL DEFAULT 0,
  excess_fee   NUMERIC(12,2) NOT NULL DEFAULT 0,
  fee_paid     BOOLEAN NOT NULL DEFAULT FALSE,
  printed_at   TIMESTAMPTZ,
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_baggage_passenger ON baggage (passenger_id);

CREATE TABLE IF NOT EXISTS scan_events (
  id           BIGSERIAL PRIMARY KEY,
  passenger_id UUID REFERENCES passengers(id) ON DELETE SET NULL,
  flight_id    UUID REFERENCES flights(id) ON DELETE SET NULL,
  point        VARCHAR(12) NOT NULL CHECK (point IN ('SECURITY','GATE')),
  result       VARCHAR(24) NOT NULL,                    -- OK / ALREADY_BOARDED / NO_SECURITY / INVALID / ...
  raw_code     TEXT,
  scanned_by   UUID REFERENCES users(id),
  ts           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scan_flight ON scan_events (flight_id, ts DESC);

CREATE TABLE IF NOT EXISTS otp_codes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone      VARCHAR(32) NOT NULL,
  code_hash  VARCHAR(128) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts   INT NOT NULL DEFAULT 0,
  consumed   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_codes (phone, created_at DESC);

CREATE TABLE IF NOT EXISTS settings (
  key        VARCHAR(64) PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id        BIGSERIAL PRIMARY KEY,
  ts        TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id   UUID,
  username  VARCHAR(64),
  role      VARCHAR(16),
  action    VARCHAR(64)  NOT NULL,
  entity    VARCHAR(32),
  entity_id VARCHAR(64),
  details   JSONB NOT NULL DEFAULT '{}',
  ip        VARCHAR(64)
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log (ts DESC);

CREATE TABLE IF NOT EXISTS email_ingest_log (
  id          BIGSERIAL PRIMARY KEY,
  message_uid VARCHAR(64),
  mailbox     VARCHAR(128),
  from_addr   VARCHAR(256),
  subject     VARCHAR(512),
  received_at TIMESTAMPTZ,
  status      VARCHAR(16) NOT NULL,                     -- PROCESSED / SKIPPED / ERROR
  detail      TEXT,
  manifest_id UUID REFERENCES manifests(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mailbox, message_uid)
);
