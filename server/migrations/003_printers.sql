-- Installed printer profiles (baggage tag / boarding pass printers).
-- A profile is "installed" from the built-in catalog (services/printers.js)
-- or added manually; agents pick from installed profiles when printing.
CREATE TABLE IF NOT EXISTS printers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_key    VARCHAR(48)  NOT NULL,            -- catalog key, e.g. fujitsu-f9870
  name         VARCHAR(128) NOT NULL,            -- display name, e.g. "Counter 1 — Fujitsu F9870"
  kind         VARCHAR(16)  NOT NULL CHECK (kind IN ('bagtag','boarding','both')),
  station      VARCHAR(8),                       -- UB / OT / NULL = all stations
  config       JSONB NOT NULL DEFAULT '{}',      -- {media:"470mm 51mm", dpi:203, darkness:..., speed:...}
  is_default   BOOLEAN NOT NULL DEFAULT FALSE,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  installed_by UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_printers_station ON printers (station);
