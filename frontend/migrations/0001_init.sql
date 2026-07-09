CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'user')),
  status TEXT NOT NULL CHECK(status IN ('active', 'disabled')),
  expires_at TEXT NOT NULL,
  remark TEXT NOT NULL DEFAULT '',
  token TEXT NOT NULL UNIQUE,
  last_client TEXT,
  last_access_at TEXT,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS upstreams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS access_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  username TEXT NOT NULL,
  client TEXT NOT NULL,
  ip TEXT NOT NULL,
  ip_location TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('success', 'failed')),
  response_time_ms INTEGER NOT NULL,
  accessed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_access_logs_user_id ON access_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_accessed_at ON access_logs(accessed_at);
