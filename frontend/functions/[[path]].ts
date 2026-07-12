import { refreshUpstreamUsage, usageRefreshInterval, usageRefreshUserAgent } from "./usageRefresh.js";

type D1Result<T = unknown> = { results?: T[]; success: boolean; meta: unknown };
type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
};
type D1Database = {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
};

type Env = {
  DB: D1Database;
  JWT_SECRET?: string;
  TURNSTILE_SECRET_KEY?: string;
  ASSETS?: { fetch(request: Request): Promise<Response> };
};

type PagesFunction<E> = (context: { request: Request; env: E; next: () => Promise<Response> }) => Response | Promise<Response>;

type UserRecord = {
  id: number;
  username: string;
  password_hash: string;
  password_salt: string;
  role: "admin" | "user";
  status: "active" | "disabled";
  expires_at: string;
  remark: string;
  token: string;
  last_client: string | null;
  last_access_at: string | null;
  must_change_password: 0 | 1;
  upstream_id: number | null;
  custom_upstream_url: string;
  created_at: string;
  updated_at: string;
};

type UpstreamRecord = {
  id: number;
  client: string;
  name: string;
  url: string;
  enabled: 0 | 1;
  health_status: "unknown" | "healthy" | "unhealthy";
  last_checked_at: string | null;
  last_latency_ms: number | null;
  last_error: string;
  subscription_userinfo: string;
  created_at: string;
  updated_at: string;
};

type AccessLogRecord = {
  id: number;
  user_id: number | null;
  username: string;
  client: string;
  ip: string;
  ip_location: string;
  user_agent: string;
  status: "success" | "failed";
  response_time_ms: number;
  accessed_at: string;
};

type AnnouncementRecord = {
  id: number;
  title: string;
  content: string;
  created_at: string;
};

type AdminAuditLogRecord = {
  id: number;
  admin_user_id: number | null;
  admin_username: string;
  action: string;
  target_type: string;
  target_id: string;
  details: string;
  ip: string;
  user_agent: string;
  created_at: string;
};

const clients = [
  { client: "default", name: "默认" },
  { client: "clash", name: "Clash" },
  { client: "mihomo", name: "Mihomo" },
  { client: "shadowrocket", name: "Shadowrocket" },
  { client: "singbox", name: "SingBox" },
  { client: "surge", name: "Surge" },
  { client: "loon", name: "Loon" },
  { client: "stash", name: "Stash" },
  { client: "quantumultx", name: "Quantumult X" },
  { client: "egern", name: "Egern" },
  { client: "v2ray", name: "V2Ray" }
];

const userVisibleClients = clients.filter((item) => item.client !== "default" && item.client !== "v2ray");
const passthroughHeaders = ["subscription-userinfo", "profile-update-interval", "profile-web-page-url", "support-url", "profile-title", "content-disposition"];

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function text(data: string, status = 200, headers?: HeadersInit) {
  return new Response(data, { status, headers: { "content-type": "text/plain; charset=utf-8", ...(headers ?? {}) } });
}

function now() {
  return new Date().toISOString();
}

function futureDate(months = 1) {
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return date.toISOString();
}

function token(size = 24) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(36).padStart(2, "0")).join("").slice(0, size);
}

function base64Url(bytes: ArrayBuffer | Uint8Array) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64Url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
}

async function signJwt(user: UserRecord, secret: string) {
  const header = base64Url(new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = base64Url(new TextEncoder().encode(JSON.stringify({
    id: user.id,
    username: user.username,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60
  })));
  const body = `${header}.${payload}`;
  return `${body}.${await hmac(secret, body)}`;
}

async function verifyJwt(raw: string, secret: string) {
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const body = `${parts[0]}.${parts[1]}`;
  if (await hmac(secret, body) !== parts[2]) return null;
  const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[1]))) as { id: number; username: string; role: "admin" | "user"; exp: number };
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

async function hashPassword(password: string, salt = token(16)) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: 100_000 }, key, 256);
  return { salt, hash: base64Url(bits) };
}

async function verifyPassword(password: string, user: UserRecord) {
  const hashed = await hashPassword(password, user.password_salt);
  return hashed.hash === user.password_hash;
}

async function verifyTurnstileToken(tokenValue: string, env: Env, request: Request) {
  if (!env.TURNSTILE_SECRET_KEY) return true;
  if (!tokenValue) return false;

  const body = new URLSearchParams({
    secret: env.TURNSTILE_SECRET_KEY,
    response: tokenValue
  });
  const ip = requestIp(request);
  if (ip) body.set("remoteip", ip);

  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body
    });
    const result = await response.json() as { success?: boolean };
    return Boolean(result.success);
  } catch {
    return false;
  }
}

function publicUser(user: UserRecord) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    status: user.status,
    expiresAt: user.expires_at,
    remark: user.remark,
    token: user.token,
    lastClient: user.last_client,
    lastAccessAt: user.last_access_at,
    mustChangePassword: Boolean(user.must_change_password),
    upstreamId: user.upstream_id,
    customUpstreamUrl: user.custom_upstream_url || "",
    createdAt: user.created_at,
    updatedAt: user.updated_at
  };
}

function announcementRow(row: AnnouncementRecord) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    createdAt: row.created_at
  };
}

function normalizeClient(client?: string) {
  return client?.trim().toLowerCase() || "default";
}

function detectClientFromUserAgent(userAgent?: string) {
  const compact = (userAgent ?? "").toLowerCase().replace(/[\s._-]+/g, "");
  if (compact.includes("quantumultx")) return "quantumultx";
  if (compact.includes("clashmetaforandroid")) return "clashmetaforandroid";
  if (compact.includes("clashverge")) return "clashverge";
  if (compact.includes("shadowrocket")) return "shadowrocket";
  if (compact.includes("singbox")) return "singbox";
  if (compact.includes("mihomo")) return "mihomo";
  if (compact.includes("clashmeta")) return "clash";
  if (compact.includes("clash")) return "clash";
  if (compact.includes("surge")) return "surge";
  if (compact.includes("loon")) return "loon";
  if (compact.includes("stash")) return "stash";
  if (compact.includes("egern")) return "egern";
  if (compact.includes("v2ray")) return "v2ray";
  return undefined;
}

function normalizeIp(ip: string) {
  return ip.replace(/^::ffff:/, "").replace(/^::1$/, "127.0.0.1");
}

function requestIp(request: Request) {
  return normalizeIp(request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "");
}

function requestLocation(request: Request, ip: string) {
  const cf = (request as Request & { cf?: { country?: string; region?: string; city?: string } }).cf;
  const parts = [cf?.country, cf?.region, cf?.city].filter(Boolean);
  if (parts.length) return parts.join(" ");
  if (!ip || ip === "127.0.0.1" || ip.startsWith("10.") || ip.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return "本地网络";
  return "未知";
}

async function ensureBootstrapUsers(env: Env) {
  if (!env.DB) throw new Error("D1 数据库未绑定，请在 Cloudflare Pages 中绑定 DB");
  const userColumns = await env.DB.prepare("PRAGMA table_info(users)").all<{ name: string }>();
  if (!(userColumns.results ?? []).some((column) => column.name === "must_change_password")) {
    await env.DB.prepare("ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0").run();
  }
  const userCount = await env.DB.prepare("SELECT COUNT(*) AS count FROM users").first<{ count: number }>();
  if ((userCount?.count ?? 0) > 0) return;
  const time = now();
  const password = await hashPassword("admin123");
  const userPassword = await hashPassword("user123");
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO users (username, password_hash, password_salt, role, status, expires_at, remark, token, must_change_password, created_at, updated_at)
      VALUES (?, ?, ?, 'admin', 'active', ?, ?, ?, 1, ?, ?)
    `).bind("admin", password.hash, password.salt, "2099-12-31T23:59:59.000Z", "Cloudflare 默认管理员", token(), time, time),
    env.DB.prepare(`
      INSERT INTO users (username, password_hash, password_salt, role, status, expires_at, remark, token, must_change_password, created_at, updated_at)
      VALUES (?, ?, ?, 'user', 'active', ?, ?, ?, 1, ?, ?)
    `).bind("user", userPassword.hash, userPassword.salt, futureDate(), "Cloudflare 默认用户", token(), time, time)
  ]);
}

async function bodyJson<T>(request: Request) {
  try {
    return await request.json() as T;
  } catch {
    return {} as T;
  }
}

async function getUserById(env: Env, id: number) {
  return env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<UserRecord>();
}

async function getAuthedUser(request: Request, env: Env) {
  const raw = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!raw) return { error: json({ message: "请先登录" }, 401) };
  const payload = await verifyJwt(raw, env.JWT_SECRET || "sublink-cloudflare-secret");
  if (!payload) return { error: json({ message: "请先登录" }, 401) };
  const user = await getUserById(env, payload.id);
  if (!user) return { error: json({ message: "请先登录" }, 401) };
  if (user.status === "disabled") return { error: json({ message: "账号已被停用" }, 403) };
  return { user };
}

async function requireAdmin(request: Request, env: Env) {
  const auth = await getAuthedUser(request, env);
  if (auth.error) return auth;
  if (auth.user.role !== "admin") return { error: json({ message: "没有权限" }, 403) };
  return auth;
}

async function getSettings(env: Env) {
  const rows = await env.DB.prepare("SELECT key, value FROM settings").all<{ key: string; value: string }>();
  return Object.fromEntries((rows.results ?? []).map((row) => [row.key, row.value]));
}

async function setSettings(env: Env, settings: Record<string, string>) {
  const normalized = { ...settings };
  if (normalized.usageRefreshIntervalMinutes !== undefined) normalized.usageRefreshIntervalMinutes = String(usageRefreshInterval(normalized));
  if (normalized.usageRefreshUserAgent !== undefined) normalized.usageRefreshUserAgent = normalized.usageRefreshUserAgent.trim().slice(0, 512);
  delete normalized.usageRefreshLastAt;
  const time = now();
  await env.DB.batch(Object.entries(normalized).map(([key, value]) => env.DB.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).bind(key, value ?? "", time)));
  return getSettings(env);
}

async function writeAccessLog(env: Env, input: Omit<AccessLogRecord, "id" | "accessed_at">) {
  const time = now();
  await env.DB.prepare(`
    INSERT INTO access_logs (user_id, username, client, ip, ip_location, user_agent, status, response_time_ms, accessed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(input.user_id, input.username, input.client, input.ip, input.ip_location, input.user_agent, input.status, input.response_time_ms, time).run();
  if (input.user_id) {
    await env.DB.prepare("UPDATE users SET last_client = ?, last_access_at = ?, updated_at = ? WHERE id = ?").bind(input.client, time, time, input.user_id).run();
  }
}

function logRow(row: AccessLogRecord) {
  return {
    ...row,
    ipLocation: row.ip_location || "未知"
  };
}

function upstreamRow(row: UpstreamRecord) {
  return {
    id: row.id,
    client: row.client,
    name: row.name || row.client,
    url: row.url,
    enabled: Boolean(row.enabled),
    healthStatus: row.health_status,
    lastCheckedAt: row.last_checked_at,
    lastLatencyMs: row.last_latency_ms,
    lastError: row.last_error,
    subscriptionUserinfo: row.subscription_userinfo,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function parseSubscriptionUserinfo(value?: string | null, updatedAt?: string | null) {
  if (!value) return null;
  const fields = Object.fromEntries(value.split(";").map((part) => part.trim().split("=")).filter((item) => item.length === 2));
  const upload = Number(fields.upload ?? 0);
  const download = Number(fields.download ?? 0);
  const total = Number(fields.total ?? 0);
  const expireValue = fields.expire ? Number(fields.expire) : null;
  if (![upload, download, total].every(Number.isFinite) || total <= 0) return null;
  const used = upload + download;
  return { upload, download, used, total, remaining: Math.max(0, total - used), expire: expireValue && Number.isFinite(expireValue) ? expireValue : null, updatedAt: updatedAt ?? null };
}

async function updateUpstreamHealth(env: Env, client: string, input: { status: "healthy" | "unhealthy"; latencyMs: number; error?: string; subscriptionUserinfo?: string }) {
  const time = now();
  await env.DB.prepare(`
    UPDATE upstreams SET health_status = ?, last_checked_at = ?, last_latency_ms = ?, last_error = ?,
      subscription_userinfo = CASE WHEN ? != '' THEN ? ELSE subscription_userinfo END
    WHERE client = ?
  `).bind(input.status, time, input.latencyMs, input.error ?? "", input.subscriptionUserinfo ?? "", input.subscriptionUserinfo ?? "", client).run();
  return env.DB.prepare("SELECT * FROM upstreams WHERE client = ?").bind(client).first<UpstreamRecord>();
}

async function checkUpstreamHealth(env: Env, upstream: UpstreamRecord) {
  if (!upstream.url) return updateUpstreamHealth(env, upstream.client, { status: "unhealthy", latencyMs: 0, error: "未配置上游链接" });
  const started = Date.now();
  try {
    const settings = await getSettings(env);
    const response = await fetch(upstream.url, { headers: { "user-agent": usageRefreshUserAgent(settings) }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await updateUpstreamHealth(env, upstream.client, { status: "healthy", latencyMs: Date.now() - started, subscriptionUserinfo: response.headers.get("subscription-userinfo") ?? "" });
    await response.body?.cancel();
    return result;
  } catch (error) {
    return updateUpstreamHealth(env, upstream.client, { status: "unhealthy", latencyMs: Date.now() - started, error: error instanceof Error ? error.message : "上游链接不可用" });
  }
}

async function writeAdminAudit(env: Env, request: Request, admin: UserRecord, action: string, targetType: string, targetId = "", details: unknown = {}) {
  await env.DB.prepare(`
    INSERT INTO admin_audit_logs (admin_user_id, admin_username, action, target_type, target_id, details, ip, user_agent, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(admin.id, admin.username, action, targetType, targetId, JSON.stringify(details), requestIp(request), request.headers.get("user-agent") ?? "", now()).run();
}

async function queryAccessLogs(request: Request, env: Env, userId?: number) {
  const params = new URL(request.url).searchParams;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(params.get("pageSize")) || 20));
  const where: string[] = [];
  const values: unknown[] = [];
  if (userId) { where.push("access_logs.user_id = ?"); values.push(userId); }
  const username = params.get("username")?.trim();
  if (username) { where.push("COALESCE(users.username, access_logs.username) LIKE ?"); values.push(`%${username}%`); }
  const client = params.get("client")?.trim();
  if (client) { where.push("access_logs.client = ?"); values.push(client); }
  const status = params.get("status");
  if (status === "success" || status === "failed") { where.push("access_logs.status = ?"); values.push(status); }
  const keyword = params.get("keyword")?.trim();
  if (keyword) { where.push("(access_logs.ip LIKE ? OR access_logs.user_agent LIKE ?)"); values.push(`%${keyword}%`, `%${keyword}%`); }
  const from = params.get("from");
  if (from) { where.push("access_logs.accessed_at >= ?"); values.push(from); }
  const to = params.get("to");
  if (to) { where.push("access_logs.accessed_at <= ?"); values.push(to); }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const baseFrom = "FROM access_logs LEFT JOIN users ON users.id = access_logs.user_id";
  const total = await env.DB.prepare(`SELECT COUNT(*) AS count ${baseFrom} ${whereSql}`).bind(...values).first<{ count: number }>();
  const rows = await env.DB.prepare(`
    SELECT access_logs.*, COALESCE(users.username, access_logs.username) AS username
    ${baseFrom} ${whereSql} ORDER BY access_logs.id DESC LIMIT ? OFFSET ?
  `).bind(...values, pageSize, (page - 1) * pageSize).all<AccessLogRecord>();
  return { items: (rows.results ?? []).map(logRow), total: total?.count ?? 0, page, pageSize };
}

function subOrigin(request: Request, settings: Record<string, string>) {
  return (settings.publicBaseUrl || new URL(request.url).origin).replace(/\/+$/, "");
}

async function pickUpstream(env: Env, client: string, user?: UserRecord) {
  if (user?.custom_upstream_url) return { id: -user.id, client: `custom-${user.id}`, name: "专属上游", url: user.custom_upstream_url, enabled: 1, health_status: "unknown", last_checked_at: null, last_latency_ms: null, last_error: "", subscription_userinfo: "", created_at: now(), updated_at: now() } as UpstreamRecord;
  if (user?.upstream_id) {
    const assigned = await env.DB.prepare("SELECT * FROM upstreams WHERE id = ? AND enabled = 1").bind(user.upstream_id).first<UpstreamRecord>();
    if (assigned?.url) return assigned;
  }
  const requested = await env.DB.prepare("SELECT * FROM upstreams WHERE client = ?").bind(client).first<UpstreamRecord>();
  if (requested?.enabled && requested.url) return requested;
  const fallbackOrder = client === "default" ? ["clash", "mihomo", "default"] : ["default", "clash", "mihomo"];
  for (const fallback of fallbackOrder) {
    const upstream = await env.DB.prepare("SELECT * FROM upstreams WHERE client = ?").bind(fallback).first<UpstreamRecord>();
    if (upstream?.enabled && upstream.url) return upstream;
  }
  const source = await env.DB.prepare("SELECT * FROM upstreams WHERE client LIKE 'source-%' AND enabled = 1 AND url != '' ORDER BY id LIMIT 1").first<UpstreamRecord>();
  if (source) return source;
  return requested;
}

function sampleSubscription(username: string, client: string) {
  const label = encodeURIComponent(`SubLink Cloudflare 测试节点-${client}-${username}`);
  return `proxies:
  - name: SubLink Cloudflare 测试节点
    type: ss
    server: 127.0.0.1
    port: 8388
    cipher: aes-128-gcm
    password: sublink-cloudflare
proxy-groups:
  - name: 自动选择
    type: select
    proxies:
      - SubLink Cloudflare 测试节点
rules:
  - MATCH,自动选择

ss://YWVzLTEyOC1nY206c3VibGluay1jbG91ZGZsYXJlQDEyNy4wLjAuMTo4Mzg4#${label}
`;
}

async function handleApi(request: Request, env: Env, path: string) {
  const method = request.method.toUpperCase();

  if (path === "/api/health") return json({ status: "ok", message: "服务正常" });
  if (path === "/api/public/settings") {
    const settings = await getSettings(env);
    return json({ settings: { siteName: settings.siteName || "SubLink" } });
  }

  if (path === "/api/auth/login" && method === "POST") {
    await ensureBootstrapUsers(env);
    const input = await bodyJson<{ username?: string; password?: string; turnstileToken?: string }>(request);
    if (!(await verifyTurnstileToken(input.turnstileToken ?? "", env, request))) return json({ message: "人机验证失败，请重试" }, 403);
    const user = input.username ? await env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(input.username).first<UserRecord>() : null;
    if (!user || !input.password || !(await verifyPassword(input.password, user))) return json({ message: "账号或密码错误" }, 401);
    if (user.status === "disabled") return json({ message: "账号已被停用" }, 403);
    return json({ token: await signJwt(user, env.JWT_SECRET || "sublink-cloudflare-secret"), user: publicUser(user) });
  }

  if (path === "/api/auth/me") {
    const auth = await getAuthedUser(request, env);
    if (auth.error) return auth.error;
    return json({ user: publicUser(auth.user) });
  }

  if (path.startsWith("/api/user/")) {
    const auth = await getAuthedUser(request, env);
    if (auth.error) return auth.error;
    const user = auth.user;

    if (path === "/api/user/subscription") {
      const settings = await getSettings(env);
      const origin = subOrigin(request, settings);
      const upstreamRows = await env.DB.prepare("SELECT * FROM upstreams ORDER BY id").all<UpstreamRecord>();
      const upstreams = upstreamRows.results ?? [];
      const usageUpstream = user.upstream_id ? upstreams.find((row) => row.id === user.upstream_id) : upstreams.find((row) => row.enabled && row.url);
      let customUsage = null;
      if (user.custom_upstream_url) {
        try {
          const response = await fetch(user.custom_upstream_url, { headers: { "user-agent": usageRefreshUserAgent(settings) }, signal: AbortSignal.timeout(8000) });
          customUsage = parseSubscriptionUserinfo(response.headers.get("subscription-userinfo") || undefined, now());
          await response.body?.cancel();
        } catch { /* 专属上游不可用时仍返回订阅链接 */ }
      }
      return json({
        user: publicUser(user),
        genericLink: `${origin}/sub/${user.token}`,
        clientLinks: userVisibleClients.flatMap((item) => {
          const legacyClientConfig = upstreams.find((row) => row.client === item.client && !row.client.startsWith("source-"));
          if (legacyClientConfig && !legacyClientConfig.enabled) return [];
          return [{
            client: item.client,
            name: item.name,
            link: `${origin}/sub/${user.token}/${item.client}`,
            enabled: true
          }];
        }),
        usage: customUsage ?? parseSubscriptionUserinfo(usageUpstream?.subscription_userinfo, usageUpstream?.last_checked_at),
        upstreamName: user.custom_upstream_url ? "专属上游" : usageUpstream?.name || null,
        instructions: [
          "推荐优先使用通用订阅链接。",
          "如果客户端无法自动识别，请使用对应客户端专用链接。",
          "Token 重置后旧链接会立即失效。"
        ]
      });
    }

    if (path === "/api/user/reset-token" && method === "POST") {
      const next = token();
      await env.DB.prepare("UPDATE users SET token = ?, updated_at = ? WHERE id = ?").bind(next, now(), user.id).run();
      return json({ token: next, message: "操作成功" });
    }

    if (path === "/api/user/logs") {
      return json(await queryAccessLogs(request, env, user.id));
    }

    if (path === "/api/user/announcements") {
      const rows = await env.DB.prepare(`
        SELECT announcements.*, announcement_reads.read_at
        FROM announcements
        LEFT JOIN announcement_reads
          ON announcement_reads.announcement_id = announcements.id
         AND announcement_reads.user_id = ?
        ORDER BY announcements.id DESC
      `).bind(user.id).all<AnnouncementRecord & { read_at: string | null }>();
      return json({ items: (rows.results ?? []).map((row) => ({ ...announcementRow(row), isRead: Boolean(row.read_at), readAt: row.read_at })) });
    }

    const userAnnouncementMatch = /^\/api\/user\/announcements\/(\d+)\/read$/.exec(path);
    if (userAnnouncementMatch && method === "POST") {
      const id = Number(userAnnouncementMatch[1]);
      const announcement = await env.DB.prepare("SELECT * FROM announcements WHERE id = ?").bind(id).first<AnnouncementRecord>();
      if (!announcement) return json({ message: "公告不存在" }, 404);
      const time = now();
      await env.DB.prepare(`
        INSERT INTO announcement_reads (announcement_id, user_id, read_at) VALUES (?, ?, ?)
        ON CONFLICT(announcement_id, user_id) DO UPDATE SET read_at = excluded.read_at
      `).bind(id, user.id, time).run();
      return json({ announcement: { ...announcementRow(announcement), isRead: true, readAt: time }, message: "操作成功" });
    }

    if (path === "/api/user/profile" && method === "PATCH") {
      const input = await bodyJson<{ username?: string; remark?: string }>(request);
      if (!input.username) return json({ message: "表单内容不完整" }, 400);
      try {
        await env.DB.prepare("UPDATE users SET username = ?, remark = ?, updated_at = ? WHERE id = ?").bind(input.username, input.remark ?? "", now(), user.id).run();
        const next = await getUserById(env, user.id);
        return json({ user: publicUser(next!), message: "保存成功" });
      } catch {
        return json({ message: "用户名已存在" }, 400);
      }
    }

    if (path === "/api/user/password" && method === "POST") {
      const input = await bodyJson<{ currentPassword?: string; newPassword?: string }>(request);
      if (!input.currentPassword || !input.newPassword || input.newPassword.length < 6) return json({ message: "表单内容不完整" }, 400);
      if (!(await verifyPassword(input.currentPassword, user))) return json({ message: "当前密码错误" }, 400);
      const hashed = await hashPassword(input.newPassword);
      await env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ?, must_change_password = 0, updated_at = ? WHERE id = ?").bind(hashed.hash, hashed.salt, now(), user.id).run();
      return json({ message: "保存成功" });
    }

    if (path === "/api/user/force-password" && method === "POST") {
      const input = await bodyJson<{ newPassword?: string }>(request);
      if (!input.newPassword || input.newPassword.length < 6) return json({ message: "密码不能少于 6 位" }, 400);
      const hashed = await hashPassword(input.newPassword);
      await env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ?, must_change_password = 0, updated_at = ? WHERE id = ?").bind(hashed.hash, hashed.salt, now(), user.id).run();
      return json({ message: "保存成功" });
    }
  }

  if (path.startsWith("/api/admin/")) {
    const auth = await requireAdmin(request, env);
    if (auth.error) return auth.error;

    if (path === "/api/admin/dashboard") {
      const today = new Date().toISOString().slice(0, 10);
      const totalUsers = await env.DB.prepare("SELECT COUNT(*) AS count FROM users").first<{ count: number }>();
      const activeUsers = await env.DB.prepare("SELECT COUNT(*) AS count FROM users WHERE status = 'active'").first<{ count: number }>();
      const disabledUsers = await env.DB.prepare("SELECT COUNT(*) AS count FROM users WHERE status = 'disabled'").first<{ count: number }>();
      const todayMetrics = await env.DB.prepare(`
        SELECT COUNT(*) AS requests,
          SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success,
          COALESCE(AVG(response_time_ms), 0) AS average_response_ms,
          COUNT(DISTINCT user_id) AS active_users
        FROM access_logs WHERE accessed_at LIKE ?
      `).bind(`${today}%`).first<{ requests: number; success: number; average_response_ms: number; active_users: number }>();
      const expiringSoon = await env.DB.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'user' AND status = 'active' AND expires_at BETWEEN ? AND ?")
        .bind(now(), new Date(Date.now() + 7 * 86400000).toISOString()).first<{ count: number }>();
      const upstreamSummary = await env.DB.prepare("SELECT health_status AS status, COUNT(*) AS count FROM upstreams WHERE enabled = 1 AND url != '' GROUP BY health_status").all<{ status: string; count: number }>();
      const upstreams = await env.DB.prepare("SELECT * FROM upstreams WHERE url != '' ORDER BY id").all<UpstreamRecord>();
      const dailyTrend = await env.DB.prepare(`
        SELECT substr(accessed_at, 1, 10) AS date, COUNT(*) AS requests,
          SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success
        FROM access_logs WHERE accessed_at >= ? GROUP BY substr(accessed_at, 1, 10) ORDER BY date
      `).bind(new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)).all<{ date: string; requests: number; success: number }>();
      const clientStats = await env.DB.prepare("SELECT client, COUNT(*) AS count FROM access_logs GROUP BY client ORDER BY count DESC LIMIT 6").all<{ client: string; count: number }>();
      const recentLogs = await env.DB.prepare(`
        SELECT access_logs.*, COALESCE(users.username, access_logs.username) AS username
        FROM access_logs
        LEFT JOIN users ON users.id = access_logs.user_id
        ORDER BY access_logs.id DESC
        LIMIT 8
      `).all<AccessLogRecord>();
      const todayRequests = todayMetrics?.requests ?? 0;
      const todaySuccess = todayMetrics?.success ?? 0;
      return json({
        totalUsers: totalUsers?.count ?? 0,
        activeUsers: activeUsers?.count ?? 0,
        disabledUsers: disabledUsers?.count ?? 0,
        todayRequests,
        todaySuccess,
        todayFailed: todayRequests - todaySuccess,
        averageResponseMs: Math.round(todayMetrics?.average_response_ms ?? 0),
        activeToday: todayMetrics?.active_users ?? 0,
        expiringSoon: expiringSoon?.count ?? 0,
        upstreamSummary: upstreamSummary.results ?? [],
        upstreams: (upstreams.results ?? []).map(upstreamRow),
        dailyTrend: dailyTrend.results ?? [],
        clientStats: clientStats.results ?? [],
        recentLogs: (recentLogs.results ?? []).map(logRow)
      });
    }

    if (path === "/api/admin/announcements") {
      if (method === "GET") {
        const rows = await env.DB.prepare("SELECT * FROM announcements ORDER BY id DESC").all<AnnouncementRecord>();
        return json({ items: (rows.results ?? []).map(announcementRow) });
      }
      if (method === "POST") {
        const input = await bodyJson<{ title?: string; content?: string }>(request);
        if (!input.title?.trim() || !input.content?.trim()) return json({ message: "表单内容不完整" }, 400);
        const time = now();
        const result = await env.DB.prepare("INSERT INTO announcements (title, content, created_at) VALUES (?, ?, ?)")
          .bind(input.title.trim(), input.content.trim(), time)
          .run();
        const id = Number((result.meta as { last_row_id?: number; lastRowId?: number }).last_row_id ?? (result.meta as { lastRowId?: number }).lastRowId ?? 0);
        const announcement = id
          ? await env.DB.prepare("SELECT * FROM announcements WHERE id = ?").bind(id).first<AnnouncementRecord>()
          : await env.DB.prepare("SELECT * FROM announcements ORDER BY id DESC LIMIT 1").first<AnnouncementRecord>();
        await writeAdminAudit(env, request, auth.user, "announcement.create", "announcement", String(announcement?.id ?? ""), { title: input.title.trim() });
        return json({ announcement: announcementRow(announcement!), message: "创建成功" }, 201);
      }
    }

    const adminAnnouncementMatch = /^\/api\/admin\/announcements\/(\d+)$/.exec(path);
    if (adminAnnouncementMatch && method === "DELETE") {
      const id = Number(adminAnnouncementMatch[1]);
      await env.DB.prepare("DELETE FROM announcement_reads WHERE announcement_id = ?").bind(id).run();
      await env.DB.prepare("DELETE FROM announcements WHERE id = ?").bind(id).run();
      await writeAdminAudit(env, request, auth.user, "announcement.delete", "announcement", String(id));
      return json({ message: "删除成功" });
    }

    if (path === "/api/admin/users") {
      if (method === "GET") {
        const rows = await env.DB.prepare("SELECT * FROM users ORDER BY id DESC").all<UserRecord>();
        return json({ items: (rows.results ?? []).map(publicUser) });
      }
      if (method === "POST") {
        const input = await bodyJson<{ username?: string; password?: string; expiresAt?: string; remark?: string; role?: "admin" | "user" }>(request);
        if (!input.username || !input.password || input.password.length < 6) return json({ message: "表单内容不完整" }, 400);
        const hashed = await hashPassword(input.password);
        const time = now();
        await env.DB.prepare(`
          INSERT INTO users (username, password_hash, password_salt, role, status, expires_at, remark, token, must_change_password, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'active', ?, ?, ?, 1, ?, ?)
        `).bind(input.username, hashed.hash, hashed.salt, input.role ?? "user", input.expiresAt ?? futureDate(), input.remark ?? "", token(), time, time).run();
        const user = await env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(input.username).first<UserRecord>();
        await writeAdminAudit(env, request, auth.user, "user.create", "user", String(user?.id ?? ""), { username: input.username, role: input.role ?? "user" });
        return json({ user: publicUser(user!) }, 201);
      }
    }

    if (path === "/api/admin/users/batch" && method === "POST") {
      const input = await bodyJson<{ ids?: number[]; action?: "enable" | "disable" | "delete" | "extend"; days?: number }>(request);
      const ids = [...new Set((input.ids ?? []).filter((id) => Number.isInteger(id) && id > 0))].slice(0, 500);
      if (!ids.length || !input.action || (input.action === "extend" && (!input.days || input.days < 1))) return json({ message: "批量操作参数不完整" }, 400);
      const placeholders = ids.map(() => "?").join(",");
      let statement: D1PreparedStatement;
      if (input.action === "delete") {
        statement = env.DB.prepare(`DELETE FROM users WHERE id IN (${placeholders}) AND role != 'admin'`).bind(...ids);
      } else if (input.action === "extend") {
        statement = env.DB.prepare(`UPDATE users SET expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', expires_at, ?), updated_at = ? WHERE id IN (${placeholders}) AND role != 'admin'`).bind(`+${input.days} days`, now(), ...ids);
      } else {
        statement = env.DB.prepare(`UPDATE users SET status = ?, updated_at = ? WHERE id IN (${placeholders}) AND role != 'admin'`).bind(input.action === "enable" ? "active" : "disabled", now(), ...ids);
      }
      const result = await statement.run();
      const affected = Number((result.meta as { changes?: number }).changes ?? ids.length);
      await writeAdminAudit(env, request, auth.user, `user.batch.${input.action}`, "user", ids.join(","), { affected, days: input.days });
      return json({ affected, message: `已处理 ${affected} 个用户` });
    }

    const userMatch = /^\/api\/admin\/users\/(\d+)(?:\/([a-z-]+))?$/.exec(path);
    if (userMatch) {
      const id = Number(userMatch[1]);
      const action = userMatch[2];
      if (!action && method === "GET") {
        const user = await getUserById(env, id);
        return user ? json({ user: publicUser(user) }) : json({ message: "用户不存在" }, 404);
      }
      if (!action && method === "PATCH") {
        const input = await bodyJson<{ username?: string; expiresAt?: string; remark?: string; status?: "active" | "disabled"; upstreamId?: number | null; customUpstreamUrl?: string }>(request);
        const old = await getUserById(env, id);
        if (!old) return json({ message: "用户不存在" }, 404);
        await env.DB.prepare("UPDATE users SET username = ?, expires_at = ?, remark = ?, status = ?, upstream_id = ?, custom_upstream_url = ?, updated_at = ? WHERE id = ?")
          .bind(input.username ?? old.username, input.expiresAt ?? old.expires_at, input.remark ?? old.remark, input.status ?? old.status, input.upstreamId === undefined ? old.upstream_id : input.upstreamId, input.customUpstreamUrl ?? old.custom_upstream_url, now(), id).run();
        const user = await getUserById(env, id);
        await writeAdminAudit(env, request, auth.user, "user.update", "user", String(id), input);
        return json({ user: publicUser(user!) });
      }
      if (!action && method === "DELETE") {
        await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id).run();
        await writeAdminAudit(env, request, auth.user, "user.delete", "user", String(id));
        return json({ message: "删除成功" });
      }
      if (action === "enable" && method === "POST") {
        await env.DB.prepare("UPDATE users SET status = 'active', updated_at = ? WHERE id = ?").bind(now(), id).run();
        await writeAdminAudit(env, request, auth.user, "user.enable", "user", String(id));
        return json({ user: publicUser((await getUserById(env, id))!) });
      }
      if (action === "disable" && method === "POST") {
        await env.DB.prepare("UPDATE users SET status = 'disabled', updated_at = ? WHERE id = ?").bind(now(), id).run();
        await writeAdminAudit(env, request, auth.user, "user.disable", "user", String(id));
        return json({ user: publicUser((await getUserById(env, id))!) });
      }
      if (action === "reset-token" && method === "POST") {
        const next = token();
        await env.DB.prepare("UPDATE users SET token = ?, updated_at = ? WHERE id = ?").bind(next, now(), id).run();
        await writeAdminAudit(env, request, auth.user, "user.reset_token", "user", String(id));
        return json({ token: next, message: "操作成功" });
      }
      if (action === "password" && method === "POST") {
        const input = await bodyJson<{ password?: string }>(request);
        if (!input.password || input.password.length < 6) return json({ message: "密码不能少于 6 位" }, 400);
        const hashed = await hashPassword(input.password);
        await env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ?, must_change_password = 0, updated_at = ? WHERE id = ?").bind(hashed.hash, hashed.salt, now(), id).run();
        await writeAdminAudit(env, request, auth.user, "user.password", "user", String(id));
        return json({ message: "保存成功" });
      }
    }

    if (path === "/api/admin/upstreams") {
      if (method === "POST") {
        const input = await bodyJson<{ name?: string; url?: string; enabled?: boolean }>(request);
        if (!input.name?.trim() || !input.url || !/^https?:\/\//i.test(input.url)) return json({ message: "请输入名称和有效的订阅链接" }, 400);
        const key = `source-${token().slice(0, 10)}`;
        const time = now();
        await env.DB.prepare("INSERT INTO upstreams (client, name, url, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").bind(key, input.name.trim(), input.url, input.enabled === false ? 0 : 1, time, time).run();
        const upstream = await env.DB.prepare("SELECT * FROM upstreams WHERE client = ?").bind(key).first<UpstreamRecord>();
        await writeAdminAudit(env, request, auth.user, "upstream.create", "upstream", String(upstream?.id || ""), { name: input.name });
        return json({ upstream: upstreamRow(upstream!), message: "添加成功" }, 201);
      }
      if (method === "PUT") {
        const input = await bodyJson<{ items?: Array<{ client?: string; url?: string; enabled?: boolean }> }>(request);
        if (!Array.isArray(input.items) || input.items.length === 0 || input.items.some((item) => !item.client)) return json({ message: "表单内容不完整" }, 400);
        const time = now();
        await env.DB.batch(input.items.map((item) => env.DB.prepare(`
          INSERT INTO upstreams (client, url, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(client) DO UPDATE SET
            health_status = CASE WHEN upstreams.url != excluded.url THEN 'unknown' ELSE upstreams.health_status END,
            last_checked_at = CASE WHEN upstreams.url != excluded.url THEN NULL ELSE upstreams.last_checked_at END,
            last_latency_ms = CASE WHEN upstreams.url != excluded.url THEN NULL ELSE upstreams.last_latency_ms END,
            last_error = CASE WHEN upstreams.url != excluded.url THEN '' ELSE upstreams.last_error END,
            subscription_userinfo = CASE WHEN upstreams.url != excluded.url THEN '' ELSE upstreams.subscription_userinfo END,
            url = excluded.url, enabled = excluded.enabled, updated_at = excluded.updated_at
        `).bind(item.client, item.url ?? "", item.enabled === false ? 0 : 1, time, time)));
        await writeAdminAudit(env, request, auth.user, "upstream.save_all", "upstream", "", { count: input.items.length });
      }

      const rows = await env.DB.prepare("SELECT * FROM upstreams WHERE url != '' OR client LIKE 'source-%' ORDER BY id").all<UpstreamRecord>();
      const items = (rows.results ?? []).map(upstreamRow);
      return json(method === "PUT" ? { items, message: "保存成功" } : { items });
    }

    const upstreamDelete = /^\/api\/admin\/upstreams\/id\/(\d+)$/.exec(path);
    if (upstreamDelete && method === "DELETE") {
      const id = Number(upstreamDelete[1]);
      await env.DB.prepare("UPDATE users SET upstream_id = NULL WHERE upstream_id = ?").bind(id).run();
      await env.DB.prepare("DELETE FROM upstreams WHERE id = ?").bind(id).run();
      await writeAdminAudit(env, request, auth.user, "upstream.delete", "upstream", String(id));
      return json({ message: "删除成功" });
    }

    if (path === "/api/admin/upstreams/health-check" && method === "POST") {
      const rows = await env.DB.prepare("SELECT * FROM upstreams WHERE enabled = 1 AND url != '' ORDER BY id").all<UpstreamRecord>();
      const checked = await Promise.all((rows.results ?? []).map((item) => checkUpstreamHealth(env, item)));
      await writeAdminAudit(env, request, auth.user, "upstream.health_check_all", "upstream", "", { count: checked.length });
      return json({ items: checked.filter(Boolean).map((item) => upstreamRow(item!)), message: `已检测 ${checked.length} 个上游` });
    }

    if (path === "/api/admin/upstreams/refresh-usage" && method === "POST") {
      const result = await refreshUpstreamUsage(env.DB, true);
      await writeAdminAudit(env, request, auth.user, "upstream.refresh_usage", "upstream", "", result);
      return json({ ...result, message: `已刷新 ${result.refreshed} 个上游，失败 ${result.failed} 个` });
    }

    const upstreamMatch = /^\/api\/admin\/upstreams\/([^/]+)(?:\/test)?$/.exec(path);
    if (upstreamMatch) {
      const client = normalizeClient(decodeURIComponent(upstreamMatch[1]));
      if (path.endsWith("/test") && method === "POST") {
        const upstream = await env.DB.prepare("SELECT * FROM upstreams WHERE client = ?").bind(client).first<UpstreamRecord>();
        if (!upstream?.url) return json({ message: "上游链接不可用" }, 400);
        const checked = await checkUpstreamHealth(env, upstream);
        await writeAdminAudit(env, request, auth.user, "upstream.health_check", "upstream", client, { status: checked?.health_status, latencyMs: checked?.last_latency_ms });
        return checked?.health_status === "healthy" ? json({ upstream: upstreamRow(checked), message: "测试成功" }) : json({ upstream: checked ? upstreamRow(checked) : null, message: checked?.last_error || "上游链接不可用" }, 400);
      }
      if (method === "PUT") {
        const input = await bodyJson<{ url?: string; enabled?: boolean }>(request);
        const time = now();
        await env.DB.prepare(`
          INSERT INTO upstreams (client, url, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(client) DO UPDATE SET
            health_status = CASE WHEN upstreams.url != excluded.url THEN 'unknown' ELSE upstreams.health_status END,
            last_checked_at = CASE WHEN upstreams.url != excluded.url THEN NULL ELSE upstreams.last_checked_at END,
            last_latency_ms = CASE WHEN upstreams.url != excluded.url THEN NULL ELSE upstreams.last_latency_ms END,
            last_error = CASE WHEN upstreams.url != excluded.url THEN '' ELSE upstreams.last_error END,
            subscription_userinfo = CASE WHEN upstreams.url != excluded.url THEN '' ELSE upstreams.subscription_userinfo END,
            url = excluded.url, enabled = excluded.enabled, updated_at = excluded.updated_at
        `).bind(client, input.url ?? "", input.enabled === false ? 0 : 1, time, time).run();
        const upstream = await env.DB.prepare("SELECT * FROM upstreams WHERE client = ?").bind(client).first<UpstreamRecord>();
        await writeAdminAudit(env, request, auth.user, "upstream.update", "upstream", client, { enabled: input.enabled !== false, hasUrl: Boolean(input.url) });
        return json({ upstream: upstream ? upstreamRow(upstream) : null, message: "保存成功" });
      }
    }

    if (path === "/api/admin/logs") {
      if (method === "GET") return json(await queryAccessLogs(request, env));
      if (method === "DELETE") {
        const before = new URL(request.url).searchParams.get("before") ?? "";
        if (!before || Number.isNaN(new Date(before).getTime())) return json({ message: "清理日期无效" }, 400);
        const result = await env.DB.prepare("DELETE FROM access_logs WHERE accessed_at < ?").bind(before).run();
        const deleted = Number((result.meta as { changes?: number }).changes ?? 0);
        await writeAdminAudit(env, request, auth.user, "access_log.cleanup", "access_log", "", { before, deleted });
        return json({ deleted, message: `已清理 ${deleted} 条日志` });
      }
    }

    if (path === "/api/admin/audit-logs" && method === "GET") {
      const rows = await env.DB.prepare("SELECT * FROM admin_audit_logs ORDER BY id DESC LIMIT 200").all<AdminAuditLogRecord>();
      return json({ items: rows.results ?? [] });
    }

    if (path === "/api/admin/settings") {
      if (method === "GET") return json({ settings: await getSettings(env) });
      if (method === "PUT") {
        const input = await bodyJson<Record<string, string>>(request);
        const settings = await setSettings(env, input);
        await writeAdminAudit(env, request, auth.user, "settings.update", "settings", "", { keys: Object.keys(input) });
        return json({ settings, message: "保存成功" });
      }
    }
  }

  return json({ message: "接口不存在" }, 404);
}

async function handleSubscription(request: Request, env: Env, path: string) {
  const started = Date.now();
  const parts = path.split("/").filter(Boolean);
  const tokenParam = parts[1];
  const clientParam = parts[2];
  const ua = request.headers.get("user-agent") || "";
  const client = clientParam ? normalizeClient(clientParam) : detectClientFromUserAgent(ua) ?? "default";
  const user = tokenParam ? await env.DB.prepare("SELECT * FROM users WHERE token = ?").bind(tokenParam).first<UserRecord>() : null;
  const ip = requestIp(request);
  const ip_location = requestLocation(request, ip);

  if (!user || user.status !== "active" || (user.role !== "admin" && new Date(user.expires_at).getTime() < Date.now())) {
    await writeAccessLog(env, { user_id: user?.id ?? null, username: user?.username ?? "未知用户", client, ip, ip_location, user_agent: ua, status: "failed", response_time_ms: Date.now() - started });
    return text("订阅链接已失效", 403);
  }

  const upstream = await pickUpstream(env, client, user);
  const settings = await getSettings(env);
  const converterUrl = settings.converterUrl;
  const remoteConfig = settings.remoteConfig;
  const siteName = settings.siteName || "SubLink";
  const targetMap: Record<string, string> = { default: "clash", clash: "clash", mihomo: "clash", shadowrocket: "ss", singbox: "singbox", surge: "surge", loon: "loon", stash: "clash", quantumultx: "quanx", egern: "clash", v2ray: "v2ray" };
  const useConverter = Boolean(converterUrl) && client !== "default";

  try {
    if (upstream?.enabled && upstream.url) {
      // 如果配置了订阅转换，不能直跳（需要转换）
      if (settings.subscriptionMode === "redirect" && !useConverter) {
        await writeAccessLog(env, { user_id: user.id, username: user.username, client, ip, ip_location, user_agent: ua, status: "success", response_time_ms: Date.now() - started });
        return Response.redirect(upstream.url, 302);
      }

      // 如果配置了订阅转换服务和远程配置
      if (useConverter) {
        const convertUrl = new URL(converterUrl);
        convertUrl.searchParams.set("target", targetMap[client] || "clash");
        convertUrl.searchParams.set("url", upstream.url);
        if (remoteConfig && remoteConfig !== "none") convertUrl.searchParams.set("config", remoteConfig);

        const headers = new Headers();
        if (ua) headers.set("user-agent", ua);
        const accept = request.headers.get("accept");
        if (accept) headers.set("accept", accept);

        const remote = await fetch(convertUrl.toString(), { headers, signal: AbortSignal.timeout(15000) });
        if (!remote.ok) throw new Error("converter failed");

        const responseHeaders = new Headers();
        const contentType = remote.headers.get("content-type");
        if (contentType) responseHeaders.set("content-type", contentType);

        // 复制其他响应头，但跳过 profile-title
        for (const header of passthroughHeaders) {
          if (header === "profile-title") continue;
          const value = remote.headers.get(header);
          if (value) responseHeaders.set(header, value);
        }

        // 最后设置自定义订阅名称（确保覆盖任何之前的值）
        responseHeaders.set("profile-title", siteName);
        responseHeaders.set("content-disposition", `attachment; filename=${siteName}`);

        if (upstream.id > 0) await updateUpstreamHealth(env, upstream.client, { status: "healthy", latencyMs: Date.now() - started, subscriptionUserinfo: remote.headers.get("subscription-userinfo") ?? "" });
        await writeAccessLog(env, { user_id: user.id, username: user.username, client, ip, ip_location, user_agent: ua, status: "success", response_time_ms: Date.now() - started });
        return new Response(remote.body, { headers: responseHeaders });
      }

      // 否则直接代理上游
      const headers = new Headers();
      if (ua) headers.set("user-agent", ua);
      const accept = request.headers.get("accept");
      if (accept) headers.set("accept", accept);
      const remote = await fetch(upstream.url, { headers, signal: AbortSignal.timeout(8000) });
      if (!remote.ok) throw new Error("bad upstream");

      const responseHeaders = new Headers();
      const contentType = remote.headers.get("content-type");
      if (contentType) responseHeaders.set("content-type", contentType);

      // 复制其他响应头，但跳过 profile-title
      for (const header of passthroughHeaders) {
        if (header === "profile-title") continue;
        const value = remote.headers.get(header);
        if (value) responseHeaders.set(header, value);
      }

      // 最后设置自定义订阅名称（确保覆盖任何之前的值）
      responseHeaders.set("profile-title", siteName);
      responseHeaders.set("content-disposition", `attachment; filename=${siteName}`);

      if (upstream.id > 0) await updateUpstreamHealth(env, upstream.client, { status: "healthy", latencyMs: Date.now() - started, subscriptionUserinfo: remote.headers.get("subscription-userinfo") ?? "" });
      await writeAccessLog(env, { user_id: user.id, username: user.username, client, ip, ip_location, user_agent: ua, status: "success", response_time_ms: Date.now() - started });
      return new Response(remote.body, { headers: responseHeaders });
    }

    await writeAccessLog(env, { user_id: user.id, username: user.username, client, ip, ip_location, user_agent: ua, status: "success", response_time_ms: Date.now() - started });
    return text(sampleSubscription(user.username, client));
  } catch (error) {
    if (upstream && upstream.id > 0) await updateUpstreamHealth(env, upstream.client, { status: "unhealthy", latencyMs: Date.now() - started, error: error instanceof Error ? error.message : "上游请求失败" });
    await writeAccessLog(env, { user_id: user.id, username: user.username, client, ip, ip_location, user_agent: ua, status: "failed", response_time_ms: Date.now() - started });
    return text("上游链接不可用", 502);
  }
}

export const onRequest: PagesFunction<Env> = async ({ request, env, next }) => {
  try {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") return json({ status: "ok", message: "服务正常" });
    if (url.pathname.startsWith("/api/")) return await handleApi(request, env, url.pathname);
    if (url.pathname.startsWith("/sub/")) return await handleSubscription(request, env, url.pathname);
    if (env.ASSETS) return await env.ASSETS.fetch(request);
    return next();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Worker 运行异常";
    console.error(error);
    return json({ message: "服务器内部错误", detail: message }, 500);
  }
};
