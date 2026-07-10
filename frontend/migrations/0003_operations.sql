ALTER TABLE upstreams ADD COLUMN health_status TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE upstreams ADD COLUMN last_checked_at TEXT;
ALTER TABLE upstreams ADD COLUMN last_latency_ms INTEGER;
ALTER TABLE upstreams ADD COLUMN last_error TEXT NOT NULL DEFAULT '';
ALTER TABLE upstreams ADD COLUMN subscription_userinfo TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_user_id INTEGER,
  admin_username TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_access_logs_status ON access_logs(status);
CREATE INDEX IF NOT EXISTS idx_access_logs_client ON access_logs(client);

INSERT OR IGNORE INTO upstreams (client, url, enabled, created_at, updated_at) VALUES
  ('default', '', 1, datetime('now'), datetime('now')),
  ('clash', '', 1, datetime('now'), datetime('now')),
  ('mihomo', '', 1, datetime('now'), datetime('now')),
  ('shadowrocket', '', 1, datetime('now'), datetime('now')),
  ('singbox', '', 1, datetime('now'), datetime('now')),
  ('surge', '', 1, datetime('now'), datetime('now')),
  ('loon', '', 1, datetime('now'), datetime('now')),
  ('stash', '', 1, datetime('now'), datetime('now')),
  ('quantumultx', '', 1, datetime('now'), datetime('now')),
  ('egern', '', 1, datetime('now'), datetime('now')),
  ('v2ray', '', 1, datetime('now'), datetime('now'));
