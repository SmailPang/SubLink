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
  created_at: string;
  updated_at: string;
};

type UpstreamRecord = {
  id: number;
  client: string;
  url: string;
  enabled: 0 | 1;
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
let schemaReady = false;

const schemaStatements = [
`CREATE TABLE IF NOT EXISTS users (
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
)`,
`CREATE TABLE IF NOT EXISTS upstreams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`,
`CREATE TABLE IF NOT EXISTS access_logs (
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
)`,
`CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`,
`CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
)`,
`CREATE TABLE IF NOT EXISTS announcement_reads (
  announcement_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  read_at TEXT NOT NULL,
  PRIMARY KEY (announcement_id, user_id)
)`,
"CREATE INDEX IF NOT EXISTS idx_access_logs_user_id ON access_logs(user_id)",
"CREATE INDEX IF NOT EXISTS idx_access_logs_accessed_at ON access_logs(accessed_at)",
"CREATE INDEX IF NOT EXISTS idx_announcement_reads_user_id ON announcement_reads(user_id)"
];

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
  if (compact.includes("clashmetaforandroid")) return "clash";
  if (compact.includes("clashverge")) return "clash";
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

async function seed(env: Env) {
  if (!env.DB) throw new Error("D1 数据库未绑定，请在 Cloudflare Pages 中绑定 DB");
  if (!schemaReady) {
    for (const statement of schemaStatements) {
      await env.DB.prepare(statement).run();
    }
    const userColumns = await env.DB.prepare("PRAGMA table_info(users)").all<{ name: string }>();
    if (!(userColumns.results ?? []).some((column) => column.name === "must_change_password")) {
      await env.DB.prepare("ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0").run();
    }
    schemaReady = true;
  }
  const time = now();
  const upstreams = clients.map((item) => env.DB.prepare("INSERT OR IGNORE INTO upstreams (client, url, enabled, created_at, updated_at) VALUES (?, '', 1, ?, ?)").bind(item.client, time, time));
  await env.DB.batch(upstreams);

  const userCount = await env.DB.prepare("SELECT COUNT(*) AS count FROM users").first<{ count: number }>();
  if ((userCount?.count ?? 0) === 0) {
    const password = await hashPassword("admin123");
    await env.DB.prepare(`
      INSERT INTO users (username, password_hash, password_salt, role, status, expires_at, remark, token, created_at, updated_at)
      VALUES (?, ?, ?, 'admin', 'active', ?, ?, ?, ?, ?)
    `).bind("admin", password.hash, password.salt, "2099-12-31T23:59:59.000Z", "Cloudflare 默认管理员", token(), time, time).run();

    const userPassword = await hashPassword("user123");
    await env.DB.prepare(`
      INSERT INTO users (username, password_hash, password_salt, role, status, expires_at, remark, token, created_at, updated_at)
      VALUES (?, ?, ?, 'user', 'active', ?, ?, ?, ?, ?)
    `).bind("user", userPassword.hash, userPassword.salt, futureDate(), "Cloudflare 默认用户", token(), time, time).run();
  } else {
    await env.DB.prepare(`
      DELETE FROM users
      WHERE username = 'admin'
        AND remark = 'Cloudflare 默认管理员'
        AND (SELECT COUNT(*) FROM users WHERE role = 'admin') > 1
    `).run();
    await env.DB.prepare(`
      DELETE FROM users
      WHERE username = 'user'
        AND remark = 'Cloudflare 默认用户'
        AND (SELECT COUNT(*) FROM users WHERE role = 'user') > 1
    `).run();
  }
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
  const time = now();
  await env.DB.batch(Object.entries(settings).map(([key, value]) => env.DB.prepare(`
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

function subOrigin(request: Request, settings: Record<string, string>) {
  return (settings.publicBaseUrl || new URL(request.url).origin).replace(/\/+$/, "");
}

async function pickUpstream(env: Env, client: string) {
  const requested = await env.DB.prepare("SELECT * FROM upstreams WHERE client = ?").bind(client).first<UpstreamRecord>();
  if (requested?.enabled && requested.url) return requested;
  const fallbackOrder = client === "default" ? ["clash", "mihomo", "default"] : ["default", "clash", "mihomo"];
  for (const fallback of fallbackOrder) {
    const upstream = await env.DB.prepare("SELECT * FROM upstreams WHERE client = ?").bind(fallback).first<UpstreamRecord>();
    if (upstream?.enabled && upstream.url) return upstream;
  }
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
  await seed(env);
  const method = request.method.toUpperCase();

  if (path === "/api/health") return json({ status: "ok", message: "服务正常" });
  if (path === "/api/public/settings") {
    const settings = await getSettings(env);
    return json({ settings: { siteName: settings.siteName || "SubLink" } });
  }

  if (path === "/api/auth/login" && method === "POST") {
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
      return json({
        user: publicUser(user),
        genericLink: `${origin}/sub/${user.token}`,
        clientLinks: userVisibleClients.map((item) => ({
          client: item.client,
          name: item.name,
          link: `${origin}/sub/${user.token}/${item.client}`,
          enabled: Boolean(upstreams.find((row) => row.client === item.client)?.enabled ?? 1)
        })),
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
      const rows = await env.DB.prepare("SELECT * FROM access_logs WHERE user_id = ? ORDER BY id DESC LIMIT 200").bind(user.id).all<AccessLogRecord>();
      return json({ items: (rows.results ?? []).map(logRow) });
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
      const totalUsers = await env.DB.prepare("SELECT COUNT(*) AS count FROM users").first<{ count: number }>();
      const activeUsers = await env.DB.prepare("SELECT COUNT(*) AS count FROM users WHERE status = 'active'").first<{ count: number }>();
      const disabledUsers = await env.DB.prepare("SELECT COUNT(*) AS count FROM users WHERE status = 'disabled'").first<{ count: number }>();
      const todayRequests = await env.DB.prepare("SELECT COUNT(*) AS count FROM access_logs WHERE accessed_at LIKE ?").bind(`${new Date().toISOString().slice(0, 10)}%`).first<{ count: number }>();
      const recentLogs = await env.DB.prepare(`
        SELECT access_logs.*, COALESCE(users.username, access_logs.username) AS username
        FROM access_logs
        LEFT JOIN users ON users.id = access_logs.user_id
        ORDER BY access_logs.id DESC
        LIMIT 8
      `).all<AccessLogRecord>();
      return json({ totalUsers: totalUsers?.count ?? 0, activeUsers: activeUsers?.count ?? 0, disabledUsers: disabledUsers?.count ?? 0, todayRequests: todayRequests?.count ?? 0, recentLogs: (recentLogs.results ?? []).map(logRow) });
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
        return json({ announcement: announcementRow(announcement!), message: "创建成功" }, 201);
      }
    }

    const adminAnnouncementMatch = /^\/api\/admin\/announcements\/(\d+)$/.exec(path);
    if (adminAnnouncementMatch && method === "DELETE") {
      const id = Number(adminAnnouncementMatch[1]);
      await env.DB.prepare("DELETE FROM announcement_reads WHERE announcement_id = ?").bind(id).run();
      await env.DB.prepare("DELETE FROM announcements WHERE id = ?").bind(id).run();
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
        return json({ user: publicUser(user!) }, 201);
      }
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
        const input = await bodyJson<{ username?: string; expiresAt?: string; remark?: string; status?: "active" | "disabled" }>(request);
        const old = await getUserById(env, id);
        if (!old) return json({ message: "用户不存在" }, 404);
        await env.DB.prepare("UPDATE users SET username = ?, expires_at = ?, remark = ?, status = ?, updated_at = ? WHERE id = ?")
          .bind(input.username ?? old.username, input.expiresAt ?? old.expires_at, input.remark ?? old.remark, input.status ?? old.status, now(), id).run();
        const user = await getUserById(env, id);
        return json({ user: publicUser(user!) });
      }
      if (!action && method === "DELETE") {
        await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id).run();
        return json({ message: "删除成功" });
      }
      if (action === "enable" && method === "POST") {
        await env.DB.prepare("UPDATE users SET status = 'active', updated_at = ? WHERE id = ?").bind(now(), id).run();
        return json({ user: publicUser((await getUserById(env, id))!) });
      }
      if (action === "disable" && method === "POST") {
        await env.DB.prepare("UPDATE users SET status = 'disabled', updated_at = ? WHERE id = ?").bind(now(), id).run();
        return json({ user: publicUser((await getUserById(env, id))!) });
      }
      if (action === "reset-token" && method === "POST") {
        const next = token();
        await env.DB.prepare("UPDATE users SET token = ?, updated_at = ? WHERE id = ?").bind(next, now(), id).run();
        return json({ token: next, message: "操作成功" });
      }
      if (action === "password" && method === "POST") {
        const input = await bodyJson<{ password?: string }>(request);
        if (!input.password || input.password.length < 6) return json({ message: "密码不能少于 6 位" }, 400);
        const hashed = await hashPassword(input.password);
        await env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ?, must_change_password = 0, updated_at = ? WHERE id = ?").bind(hashed.hash, hashed.salt, now(), id).run();
        return json({ message: "保存成功" });
      }
    }

    if (path === "/api/admin/upstreams") {
      if (method === "PUT") {
        const input = await bodyJson<{ items?: Array<{ client?: string; url?: string; enabled?: boolean }> }>(request);
        if (!Array.isArray(input.items) || input.items.length === 0 || input.items.some((item) => !item.client)) return json({ message: "表单内容不完整" }, 400);
        const time = now();
        await env.DB.batch(input.items.map((item) => env.DB.prepare(`
          INSERT INTO upstreams (client, url, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(client) DO UPDATE SET url = excluded.url, enabled = excluded.enabled, updated_at = excluded.updated_at
        `).bind(item.client, item.url ?? "", item.enabled === false ? 0 : 1, time, time)));
      }

      const rows = await env.DB.prepare("SELECT * FROM upstreams ORDER BY id").all<UpstreamRecord>();
      const upstreams = rows.results ?? [];
      const items = clients.map((item) => {
        const row = upstreams.find((value) => value.client === item.client);
        return row ? { ...row, enabled: Boolean(row.enabled) } : { id: 0, client: item.client, url: "", enabled: true, created_at: now(), updated_at: now() };
      });
      return json(method === "PUT" ? { items, message: "保存成功" } : { items });
    }

    const upstreamMatch = /^\/api\/admin\/upstreams\/([^/]+)(?:\/test)?$/.exec(path);
    if (upstreamMatch) {
      const client = normalizeClient(decodeURIComponent(upstreamMatch[1]));
      if (path.endsWith("/test") && method === "POST") {
        const upstream = await env.DB.prepare("SELECT * FROM upstreams WHERE client = ?").bind(client).first<UpstreamRecord>();
        if (!upstream?.url) return json({ message: "上游链接不可用" }, 400);
        try {
          const result = await fetch(upstream.url, { signal: AbortSignal.timeout(5000) });
          return result.ok ? json({ message: "测试成功" }) : json({ message: "上游链接不可用" }, 400);
        } catch {
          return json({ message: "上游链接不可用" }, 400);
        }
      }
      if (method === "PUT") {
        const input = await bodyJson<{ url?: string; enabled?: boolean }>(request);
        const time = now();
        await env.DB.prepare(`
          INSERT INTO upstreams (client, url, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(client) DO UPDATE SET url = excluded.url, enabled = excluded.enabled, updated_at = excluded.updated_at
        `).bind(client, input.url ?? "", input.enabled === false ? 0 : 1, time, time).run();
        const upstream = await env.DB.prepare("SELECT * FROM upstreams WHERE client = ?").bind(client).first<UpstreamRecord>();
        return json({ upstream: { ...upstream, enabled: Boolean(upstream?.enabled) }, message: "保存成功" });
      }
    }

    if (path === "/api/admin/logs") {
      const rows = await env.DB.prepare(`
        SELECT access_logs.*, COALESCE(users.username, access_logs.username) AS username
        FROM access_logs
        LEFT JOIN users ON users.id = access_logs.user_id
        ORDER BY access_logs.id DESC
        LIMIT 200
      `).all<AccessLogRecord>();
      return json({ items: (rows.results ?? []).map(logRow) });
    }

    if (path === "/api/admin/settings") {
      if (method === "GET") return json({ settings: await getSettings(env) });
      if (method === "PUT") return json({ settings: await setSettings(env, await bodyJson<Record<string, string>>(request)), message: "保存成功" });
    }
  }

  return json({ message: "接口不存在" }, 404);
}

async function handleSubscription(request: Request, env: Env, path: string) {
  await seed(env);
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

  const upstream = await pickUpstream(env, client);
  try {
    if (upstream?.enabled && upstream.url) {
      const settings = await getSettings(env);
      if (settings.subscriptionMode === "redirect") {
        await writeAccessLog(env, { user_id: user.id, username: user.username, client, ip, ip_location, user_agent: ua, status: "success", response_time_ms: Date.now() - started });
        return Response.redirect(upstream.url, 302);
      }

      const headers = new Headers();
      if (ua) headers.set("user-agent", ua);
      const accept = request.headers.get("accept");
      if (accept) headers.set("accept", accept);
      const remote = await fetch(upstream.url, { headers, signal: AbortSignal.timeout(8000) });
      if (!remote.ok) throw new Error("bad upstream");
      const responseHeaders = new Headers();
      const contentType = remote.headers.get("content-type");
      if (contentType) responseHeaders.set("content-type", contentType);
      for (const header of passthroughHeaders) {
        const value = remote.headers.get(header);
        if (value) responseHeaders.set(header, value);
      }
      await writeAccessLog(env, { user_id: user.id, username: user.username, client, ip, ip_location, user_agent: ua, status: "success", response_time_ms: Date.now() - started });
      return new Response(await remote.text(), { headers: responseHeaders });
    }

    await writeAccessLog(env, { user_id: user.id, username: user.username, client, ip, ip_location, user_agent: ua, status: "success", response_time_ms: Date.now() - started });
    return text(sampleSubscription(user.username, client));
  } catch {
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
