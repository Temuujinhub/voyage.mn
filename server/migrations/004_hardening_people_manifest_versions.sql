-- Security hardening, central passenger directory, manifest versioning.

-- ── users: token revocation, lockout, TOTP 2FA ──────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_logins INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS totp_secret   VARCHAR(64);

-- ── central passenger directory (master registry across all flights) ────
CREATE TABLE IF NOT EXISTS people (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   VARCHAR(32) UNIQUE,            -- OT SAP profile id
  full_name     VARCHAR(128) NOT NULL,
  title         VARCHAR(8),
  phone         VARCHAR(32),
  email         VARCHAR(128),
  company       VARCHAR(128),
  department    VARCHAR(128),
  position      VARCHAR(128),
  phone_history JSONB NOT NULL DEFAULT '[]',   -- [{phone, replaced_at}]
  notify        JSONB NOT NULL DEFAULT '{}',   -- future notification channels/prefs
  flights_count INT NOT NULL DEFAULT 0,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_people_phone ON people (phone);
CREATE INDEX IF NOT EXISTS idx_people_name  ON people (full_name);

-- ── manifest versioning ──────────────────────────────────────────────────
ALTER TABLE manifests
  ADD COLUMN IF NOT EXISTS version   INT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS diff      JSONB NOT NULL DEFAULT '{}';

-- ── passengers: soft-remove instead of delete + person link ─────────────
ALTER TABLE passengers
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS removed_manifest_id UUID REFERENCES manifests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS person_id UUID REFERENCES people(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_passengers_person ON passengers (person_id);

-- ── backfill: number existing accepted manifests, newest one active ─────
WITH v AS (
  SELECT id, row_number() OVER (PARTITION BY flight_id ORDER BY created_at) AS rn
  FROM manifests WHERE status = 'ACCEPTED' AND flight_id IS NOT NULL
)
UPDATE manifests m SET version = v.rn FROM v WHERE m.id = v.id;

UPDATE manifests SET is_active = TRUE
WHERE id IN (
  SELECT DISTINCT ON (flight_id) id FROM manifests
  WHERE status = 'ACCEPTED' AND flight_id IS NOT NULL
  ORDER BY flight_id, created_at DESC
);

-- ── backfill: seed the directory from passengers already in the system ──
INSERT INTO people (employee_id, full_name, title, phone, company, department, position)
SELECT DISTINCT ON (employee_id)
  employee_id, full_name, title, phone, company, department, position
FROM passengers
WHERE employee_id IS NOT NULL
ORDER BY employee_id, created_at DESC
ON CONFLICT (employee_id) DO NOTHING;

UPDATE passengers p SET person_id = pe.id
FROM people pe
WHERE p.employee_id = pe.employee_id AND p.person_id IS NULL;

UPDATE people SET flights_count =
  (SELECT count(DISTINCT flight_id) FROM passengers WHERE person_id = people.id);
