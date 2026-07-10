export type UsageRefreshDatabase = {
  prepare(query: string): {
    bind(...values: unknown[]): {
      first<T = unknown>(): Promise<T | null>;
      all<T = unknown>(): Promise<{ results?: T[] }>;
      run(): Promise<{ meta: unknown }>;
    };
  };
};

export const USAGE_REFRESH_PRESETS = [15, 30, 60, 120, 360, 720, 1440] as const;
export const DEFAULT_USAGE_REFRESH_INTERVAL = 60;
export const DEFAULT_USAGE_REFRESH_USER_AGENT = "clash-verge/v2.5.1";

type Upstream = { client: string; url: string; enabled: 0 | 1 };

function now() {
  return new Date().toISOString();
}

export function usageRefreshInterval(settings: Record<string, string>) {
  const value = Number(settings.usageRefreshIntervalMinutes);
  return USAGE_REFRESH_PRESETS.includes(value as (typeof USAGE_REFRESH_PRESETS)[number]) ? value : DEFAULT_USAGE_REFRESH_INTERVAL;
}

export function usageRefreshUserAgent(settings: Record<string, string>) {
  return settings.usageRefreshUserAgent?.trim() || DEFAULT_USAGE_REFRESH_USER_AGENT;
}

export async function refreshUpstreamUsage(db: UsageRefreshDatabase, force = false) {
  const settingsRows = await db.prepare("SELECT key, value FROM settings").bind().all<{ key: string; value: string }>();
  const settings = Object.fromEntries((settingsRows.results ?? []).map((row) => [row.key, row.value]));
  const interval = usageRefreshInterval(settings);
  const lastAt = settings.usageRefreshLastAt ? Date.parse(settings.usageRefreshLastAt) : 0;
  if (!force && lastAt && Date.now() - lastAt < interval * 60_000) return { skipped: true, refreshed: 0, failed: 0, interval };

  const rows = await db.prepare("SELECT client, url, enabled FROM upstreams WHERE enabled = 1 AND url != '' ORDER BY id").bind().all<Upstream>();
  const userAgent = usageRefreshUserAgent(settings);
  let refreshed = 0;
  let failed = 0;
  await Promise.all((rows.results ?? []).map(async (upstream) => {
    const started = Date.now();
    try {
      const response = await fetch(upstream.url, { headers: { "user-agent": userAgent }, signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await db.prepare(`
        UPDATE upstreams SET health_status = 'healthy', last_checked_at = ?, last_latency_ms = ?, last_error = '',
          subscription_userinfo = CASE WHEN ? != '' THEN ? ELSE subscription_userinfo END
        WHERE client = ?
      `).bind(now(), Date.now() - started, response.headers.get("subscription-userinfo") ?? "", response.headers.get("subscription-userinfo") ?? "", upstream.client).run();
      await response.body?.cancel();
      refreshed += 1;
    } catch (error) {
      failed += 1;
      await db.prepare("UPDATE upstreams SET health_status = 'unhealthy', last_checked_at = ?, last_latency_ms = ?, last_error = ? WHERE client = ?")
        .bind(now(), Date.now() - started, error instanceof Error ? error.message : "上游请求失败", upstream.client).run();
    }
  }));
  await db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES ('usageRefreshLastAt', ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).bind(now(), now()).run();
  return { skipped: false, refreshed, failed, interval };
}
