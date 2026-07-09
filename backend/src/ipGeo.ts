import type { AccessLogRecord } from "./types.js";

type IpApiResponse = {
  status?: string;
  country?: string;
  regionName?: string;
  city?: string;
  district?: string;
};

const cache = new Map<string, string>();

export function normalizeIp(ip: string) {
  return ip.replace(/^::ffff:/, "").replace(/^::1$/, "127.0.0.1");
}

export function isPrivateIp(ip: string) {
  const value = normalizeIp(ip);
  if (value === "127.0.0.1" || value === "localhost") return true;
  if (value.startsWith("10.")) return true;
  if (value.startsWith("192.168.")) return true;
  const match = /^172\.(\d+)\./.exec(value);
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}

export async function resolveIpLocation(ip: string) {
  const value = normalizeIp(ip);
  if (!value) return "未知";
  if (isPrivateIp(value)) return "本地网络";
  const cached = cache.get(value);
  if (cached) return cached;

  try {
    const response = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(value)}?lang=zh-CN&fields=status,country,regionName,city,district`,
      { signal: AbortSignal.timeout(2500) }
    );
    if (!response.ok) throw new Error("ip geo failed");
    const data = await response.json() as IpApiResponse;
    if (data.status !== "success") throw new Error("ip geo failed");
    const parts = [data.country, data.regionName, data.city, data.district].filter(Boolean);
    const location = parts.length ? parts.join(" ") : "未知";
    cache.set(value, location);
    return location;
  } catch {
    cache.set(value, "未知");
    return "未知";
  }
}

export async function withIpLocation(logs: AccessLogRecord[]) {
  return Promise.all(logs.map(async (log) => ({
    ...log,
    ip: normalizeIp(log.ip),
    ipLocation: await resolveIpLocation(log.ip)
  })));
}
