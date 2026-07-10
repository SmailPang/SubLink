import type { Store } from "./db.js";

export const USAGE_REFRESH_PRESETS = [15, 30, 60, 120, 360, 720, 1440] as const;
export const DEFAULT_USAGE_REFRESH_INTERVAL = 60;
export const DEFAULT_USAGE_REFRESH_USER_AGENT = "clash-verge/v2.5.1";

export function usageRefreshInterval(settings: Record<string, string>) {
  const value = Number(settings.usageRefreshIntervalMinutes);
  return USAGE_REFRESH_PRESETS.includes(value as (typeof USAGE_REFRESH_PRESETS)[number]) ? value : DEFAULT_USAGE_REFRESH_INTERVAL;
}

export function usageRefreshUserAgent(settings: Record<string, string>) {
  return settings.usageRefreshUserAgent?.trim() || DEFAULT_USAGE_REFRESH_USER_AGENT;
}

export async function refreshUsage(store: Store, force = false) {
  const settings = store.getSettings();
  const interval = usageRefreshInterval(settings);
  const last = settings.usageRefreshLastAt ? Date.parse(settings.usageRefreshLastAt) : 0;
  if (!force && last && Date.now() - last < interval * 60_000) return { skipped: true, refreshed: 0, failed: 0, interval };

  const userAgent = usageRefreshUserAgent(settings);
  let refreshed = 0;
  let failed = 0;
  await Promise.all(store.listUpstreams().filter((item) => item.enabled && item.url).map(async (upstream) => {
    const started = Date.now();
    try {
      const response = await fetch(upstream.url, { headers: { "user-agent": userAgent }, signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      store.updateUpstreamHealth(upstream.client, { status: "healthy", latencyMs: Date.now() - started, subscriptionUserinfo: response.headers.get("subscription-userinfo") ?? "" });
      await response.body?.cancel();
      refreshed += 1;
    } catch (error) {
      failed += 1;
      store.updateUpstreamHealth(upstream.client, { status: "unhealthy", latencyMs: Date.now() - started, error: error instanceof Error ? error.message : "上游请求失败" });
    }
  }));
  store.setSettings({ usageRefreshLastAt: new Date().toISOString() });
  return { skipped: false, refreshed, failed, interval };
}

export function startUsageRefreshScheduler(store: Store) {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    void refreshUsage(store).catch((error) => console.error("定时刷新流量失败", error)).finally(() => { running = false; });
  }, 60_000);
  timer.unref?.();
  return timer;
}
