ALTER TABLE users ADD COLUMN upstream_id INTEGER;
ALTER TABLE users ADD COLUMN custom_upstream_url TEXT NOT NULL DEFAULT '';
ALTER TABLE upstreams ADD COLUMN name TEXT NOT NULL DEFAULT '';
UPDATE upstreams SET name = CASE client WHEN 'default' THEN '默认上游' WHEN 'clash' THEN 'Clash 上游' ELSE client END WHERE name = '';
CREATE INDEX IF NOT EXISTS idx_users_upstream_id ON users(upstream_id);
