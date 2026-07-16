ALTER TABLE users ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS login_rate_limits (
  rate_key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL,
  blocked_until TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_rate_limits_updated_at ON login_rate_limits(updated_at);
