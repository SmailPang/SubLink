import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import { nanoid } from "nanoid";
import { clients } from "./clients.js";
import type { AccessLogQuery, AccessLogRecord, AdminAuditLogRecord, Announcement, AnnouncementRecord, PaginatedAccessLogs, PublicUser, Upstream, UpstreamHealthStatus, UpstreamRecord, UserAnnouncement, UserRecord, UserStatus } from "./types.js";

export interface Store {
  db: Database.Database;
  publicUser: (user: UserRecord) => PublicUser;
  findUserByUsername: (username: string) => UserRecord | undefined;
  findUserById: (id: number) => UserRecord | undefined;
  findUserByToken: (token: string) => UserRecord | undefined;
  listUsers: () => PublicUser[];
  updateUserStatus: (id: number, status: UserStatus) => PublicUser;
  updateUser: (id: number, input: Partial<Pick<UserRecord, "username" | "expires_at" | "remark" | "status" | "upstream_id" | "custom_upstream_url">>) => PublicUser;
  updateOwnProfile: (id: number, input: Pick<UserRecord, "username" | "remark">) => PublicUser;
  changePassword: (id: number, currentPassword: string, nextPassword: string) => void;
  forceChangePassword: (id: number, nextPassword: string) => void;
  setUserPassword: (id: number, nextPassword: string) => void;
  createUser: (input: { username: string; password: string; role?: "admin" | "user"; expiresAt?: string; remark?: string }) => PublicUser;
  deleteUser: (id: number) => void;
  resetToken: (id: number) => string;
  batchUsers: (ids: number[], action: "enable" | "disable" | "delete" | "extend", days?: number) => number;
  listUpstreams: () => Upstream[];
  saveUpstream: (client: string, url: string, enabled: boolean) => Upstream;
  createUpstream: (input: { name: string; url: string; enabled: boolean }) => Upstream;
  deleteUpstream: (id: number) => void;
  findUpstreamById: (id: number) => Upstream | undefined;
  findUpstream: (client: string) => Upstream | undefined;
  updateUpstreamHealth: (client: string, input: { status: UpstreamHealthStatus; latencyMs?: number | null; error?: string; subscriptionUserinfo?: string }) => Upstream;
  listAnnouncements: () => Announcement[];
  createAnnouncement: (input: { title: string; content: string }) => Announcement;
  deleteAnnouncement: (id: number) => void;
  listUserAnnouncements: (userId: number) => UserAnnouncement[];
  markAnnouncementRead: (userId: number, announcementId: number) => UserAnnouncement | undefined;
  writeAccessLog: (input: Omit<AccessLogRecord, "id" | "accessed_at">) => void;
  listLogs: (query?: AccessLogQuery) => PaginatedAccessLogs;
  listLogsByUser: (userId: number, query?: AccessLogQuery) => PaginatedAccessLogs;
  deleteLogsBefore: (before: string) => number;
  writeAuditLog: (input: Omit<AdminAuditLogRecord, "id" | "created_at">) => void;
  listAuditLogs: () => AdminAuditLogRecord[];
  dashboard: () => Record<string, unknown>;
  getSettings: () => Record<string, string>;
  setSettings: (settings: Record<string, string>) => Record<string, string>;
}

function now() {
  return new Date().toISOString();
}

function futureDate() {
  const date = new Date();
  date.setMonth(date.getMonth() + 1);
  return date.toISOString();
}

function token() {
  return nanoid(24);
}

function toBoolUpstream(row: UpstreamRecord): Upstream {
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

function toAnnouncement(row: AnnouncementRecord): Announcement {
  return { id: row.id, title: row.title, content: row.content, createdAt: row.created_at };
}

export function createStore(dbPath = path.join(process.cwd(), "data", "sublink.db")): Store {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const existingUpstreams = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'upstreams'").get();
  if (existingUpstreams) {
    const columns = db.prepare("PRAGMA table_info(upstreams)").all() as Array<{ name: string }>;
    if (columns.some((column) => column.name === "user_id")) {
      db.exec("DROP TABLE upstreams");
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'user')),
      status TEXT NOT NULL CHECK(status IN ('active', 'disabled')),
      expires_at TEXT NOT NULL,
      remark TEXT NOT NULL DEFAULT '',
      token TEXT NOT NULL UNIQUE,
      last_client TEXT,
      last_access_at TEXT,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      upstream_id INTEGER,
      custom_upstream_url TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS upstreams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      health_status TEXT NOT NULL DEFAULT 'unknown',
      last_checked_at TEXT,
      last_latency_ms INTEGER,
      last_error TEXT NOT NULL DEFAULT '',
      subscription_userinfo TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS access_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      username TEXT NOT NULL,
      client TEXT NOT NULL,
      ip TEXT NOT NULL,
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

    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS announcement_reads (
      announcement_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      read_at TEXT NOT NULL,
      PRIMARY KEY (announcement_id, user_id),
      FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

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

    CREATE INDEX IF NOT EXISTS idx_access_logs_user_id ON access_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_access_logs_accessed_at ON access_logs(accessed_at);
    CREATE INDEX IF NOT EXISTS idx_access_logs_status ON access_logs(status);
    CREATE INDEX IF NOT EXISTS idx_access_logs_client ON access_logs(client);
    CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs(created_at);
  `);

  const userColumns = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
  if (!userColumns.some((column) => column.name === "must_change_password")) {
    db.exec("ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0");
  }
  if (!userColumns.some((column) => column.name === "upstream_id")) db.exec("ALTER TABLE users ADD COLUMN upstream_id INTEGER");
  if (!userColumns.some((column) => column.name === "custom_upstream_url")) db.exec("ALTER TABLE users ADD COLUMN custom_upstream_url TEXT NOT NULL DEFAULT ''");

  const upstreamColumns = db.prepare("PRAGMA table_info(upstreams)").all() as Array<{ name: string }>;
  const addUpstreamColumn = (name: string, definition: string) => {
    if (!upstreamColumns.some((column) => column.name === name)) db.exec(`ALTER TABLE upstreams ADD COLUMN ${name} ${definition}`);
  };
  addUpstreamColumn("health_status", "TEXT NOT NULL DEFAULT 'unknown'");
  addUpstreamColumn("last_checked_at", "TEXT");
  addUpstreamColumn("last_latency_ms", "INTEGER");
  addUpstreamColumn("last_error", "TEXT NOT NULL DEFAULT ''");
  addUpstreamColumn("subscription_userinfo", "TEXT NOT NULL DEFAULT ''");
  addUpstreamColumn("name", "TEXT NOT NULL DEFAULT ''");

  const createdAt = now();
  const userCount = db.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number };
  if (userCount.count === 0) {
    const seedUser = db.prepare(`
      INSERT INTO users (username, password_hash, role, status, expires_at, remark, token, must_change_password, created_at, updated_at)
      VALUES (@username, @password_hash, @role, 'active', @expires_at, @remark, @token, 0, @created_at, @updated_at)
    `);
    seedUser.run({
      username: "admin",
      password_hash: bcrypt.hashSync("admin123", 10),
      role: "admin",
      expires_at: "2099-12-31T23:59:59.000Z",
      remark: "本地测试管理员",
      token: token(),
      created_at: createdAt,
      updated_at: createdAt
    });
    seedUser.run({
      username: "user",
      password_hash: bcrypt.hashSync("user123", 10),
      role: "user",
      expires_at: futureDate(),
      remark: "本地测试用户",
      token: token(),
      created_at: createdAt,
      updated_at: createdAt
    });
  } else {
    db.prepare(`
      DELETE FROM users
      WHERE username = 'admin'
        AND remark = '本地测试管理员'
        AND (SELECT COUNT(*) FROM users WHERE role = 'admin') > 1
    `).run();
    db.prepare(`
      DELETE FROM users
      WHERE username = 'user'
        AND remark = '本地测试用户'
        AND (SELECT COUNT(*) FROM users WHERE role = 'user') > 1
    `).run();
  }

  const seedUpstream = db.prepare(`
    INSERT OR IGNORE INTO upstreams (client, url, enabled, created_at, updated_at)
    VALUES (@client, '', 1, @created_at, @updated_at)
  `);
  for (const item of clients) {
    seedUpstream.run({ client: item.client, created_at: createdAt, updated_at: createdAt });
  }

  const publicUser = (user: UserRecord): PublicUser => ({
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
    upstreamName: user.upstream_id ? ((db.prepare("SELECT name FROM upstreams WHERE id = ?").get(user.upstream_id) as { name?: string } | undefined)?.name || null) : null,
    createdAt: user.created_at,
    updatedAt: user.updated_at
  });

  const getUser = db.prepare("SELECT * FROM users WHERE id = ?");

  function queryLogs(query: AccessLogQuery = {}, userId?: number): PaginatedAccessLogs {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(10, Number(query.pageSize) || 20));
    const where: string[] = [];
    const params: Array<string | number> = [];
    if (userId) { where.push("access_logs.user_id = ?"); params.push(userId); }
    if (query.username) { where.push("COALESCE(users.username, access_logs.username) LIKE ?"); params.push(`%${query.username}%`); }
    if (query.client) { where.push("access_logs.client = ?"); params.push(query.client); }
    if (query.status) { where.push("access_logs.status = ?"); params.push(query.status); }
    if (query.keyword) {
      where.push("(access_logs.ip LIKE ? OR access_logs.user_agent LIKE ?)");
      params.push(`%${query.keyword}%`, `%${query.keyword}%`);
    }
    if (query.from) { where.push("access_logs.accessed_at >= ?"); params.push(query.from); }
    if (query.to) { where.push("access_logs.accessed_at <= ?"); params.push(query.to); }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const baseFrom = "FROM access_logs LEFT JOIN users ON users.id = access_logs.user_id";
    const total = Number((db.prepare(`SELECT COUNT(*) AS count ${baseFrom} ${whereSql}`).get(...params) as { count: number }).count);
    const items = db.prepare(`
      SELECT access_logs.*, COALESCE(users.username, access_logs.username) AS username
      ${baseFrom} ${whereSql}
      ORDER BY access_logs.id DESC LIMIT ? OFFSET ?
    `).all(...params, pageSize, (page - 1) * pageSize) as AccessLogRecord[];
    return { items, total, page, pageSize };
  }

  return {
    db,
    publicUser,
    findUserByUsername(username) {
      return db.prepare("SELECT * FROM users WHERE username = ?").get(username) as UserRecord | undefined;
    },
    findUserById(id) {
      return getUser.get(id) as UserRecord | undefined;
    },
    findUserByToken(userToken) {
      return db.prepare("SELECT * FROM users WHERE token = ?").get(userToken) as UserRecord | undefined;
    },
    listUsers() {
      return (db.prepare("SELECT * FROM users ORDER BY id DESC").all() as UserRecord[]).map(publicUser);
    },
    updateUserStatus(id, status) {
      db.prepare("UPDATE users SET status = ?, updated_at = ? WHERE id = ?").run(status, now(), id);
      const user = getUser.get(id) as UserRecord | undefined;
      if (!user) throw new Error("用户不存在");
      return publicUser(user);
    },
    updateUser(id, input) {
      const old = getUser.get(id) as UserRecord | undefined;
      if (!old) throw new Error("用户不存在");
      db.prepare(`
        UPDATE users SET username = ?, expires_at = ?, remark = ?, status = ?, upstream_id = ?, custom_upstream_url = ?, updated_at = ?
        WHERE id = ?
      `).run(input.username ?? old.username, input.expires_at ?? old.expires_at, input.remark ?? old.remark, input.status ?? old.status, input.upstream_id === undefined ? old.upstream_id : input.upstream_id, input.custom_upstream_url ?? old.custom_upstream_url, now(), id);
      return publicUser(getUser.get(id) as UserRecord);
    },
    updateOwnProfile(id, input) {
      const old = getUser.get(id) as UserRecord | undefined;
      if (!old) throw new Error("用户不存在");
      db.prepare("UPDATE users SET username = ?, remark = ?, updated_at = ? WHERE id = ?")
        .run(input.username, input.remark, now(), id);
      return publicUser(getUser.get(id) as UserRecord);
    },
    changePassword(id, currentPassword, nextPassword) {
      const user = getUser.get(id) as UserRecord | undefined;
      if (!user) throw new Error("用户不存在");
      if (!bcrypt.compareSync(currentPassword, user.password_hash)) throw new Error("当前密码错误");
      db.prepare("UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?")
        .run(bcrypt.hashSync(nextPassword, 10), now(), id);
    },
    forceChangePassword(id, nextPassword) {
      const user = getUser.get(id) as UserRecord | undefined;
      if (!user) throw new Error("用户不存在");
      db.prepare("UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?")
        .run(bcrypt.hashSync(nextPassword, 10), now(), id);
    },
    setUserPassword(id, nextPassword) {
      const user = getUser.get(id) as UserRecord | undefined;
      if (!user) throw new Error("用户不存在");
      db.prepare("UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?")
        .run(bcrypt.hashSync(nextPassword, 10), now(), id);
    },
    createUser(input) {
      const time = now();
      const result = db.prepare(`
        INSERT INTO users (username, password_hash, role, status, expires_at, remark, token, must_change_password, created_at, updated_at)
        VALUES (?, ?, ?, 'active', ?, ?, ?, 1, ?, ?)
      `).run(input.username, bcrypt.hashSync(input.password, 10), input.role ?? "user", input.expiresAt ?? futureDate(), input.remark ?? "", token(), time, time);
      const user = getUser.get(Number(result.lastInsertRowid)) as UserRecord;
      return publicUser(user);
    },
    deleteUser(id) {
      db.prepare("DELETE FROM users WHERE id = ?").run(id);
    },
    resetToken(id) {
      const next = token();
      db.prepare("UPDATE users SET token = ?, updated_at = ? WHERE id = ?").run(next, now(), id);
      return next;
    },
    batchUsers(ids, action, days = 0) {
      const uniqueIds = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
      if (!uniqueIds.length) return 0;
      const placeholders = uniqueIds.map(() => "?").join(",");
      const time = now();
      const run = db.transaction(() => {
        if (action === "delete") return db.prepare(`DELETE FROM users WHERE id IN (${placeholders}) AND role != 'admin'`).run(...uniqueIds).changes;
        if (action === "extend") {
          return db.prepare(`UPDATE users SET expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', expires_at, ?), updated_at = ? WHERE id IN (${placeholders}) AND role != 'admin'`)
            .run(`+${Math.max(1, days)} days`, time, ...uniqueIds).changes;
        }
        const status = action === "enable" ? "active" : "disabled";
        return db.prepare(`UPDATE users SET status = ?, updated_at = ? WHERE id IN (${placeholders}) AND role != 'admin'`)
          .run(status, time, ...uniqueIds).changes;
      });
      return Number(run());
    },
    listUpstreams() {
      return (db.prepare("SELECT * FROM upstreams ORDER BY id").all() as UpstreamRecord[]).map(toBoolUpstream);
    },
    saveUpstream(client, url, enabled) {
      const time = now();
      db.prepare(`
        INSERT INTO upstreams (client, url, enabled, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(client) DO UPDATE SET
          health_status = CASE WHEN upstreams.url != excluded.url THEN 'unknown' ELSE upstreams.health_status END,
          last_checked_at = CASE WHEN upstreams.url != excluded.url THEN NULL ELSE upstreams.last_checked_at END,
          last_latency_ms = CASE WHEN upstreams.url != excluded.url THEN NULL ELSE upstreams.last_latency_ms END,
          last_error = CASE WHEN upstreams.url != excluded.url THEN '' ELSE upstreams.last_error END,
          subscription_userinfo = CASE WHEN upstreams.url != excluded.url THEN '' ELSE upstreams.subscription_userinfo END,
          url = excluded.url, enabled = excluded.enabled, updated_at = excluded.updated_at
      `).run(client, url, enabled ? 1 : 0, time, time);
      return toBoolUpstream(db.prepare("SELECT * FROM upstreams WHERE client = ?").get(client) as UpstreamRecord);
    },
    createUpstream(input) {
      const time = now();
      const key = `source-${nanoid(10)}`;
      const result = db.prepare("INSERT INTO upstreams (client, name, url, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(key, input.name, input.url, input.enabled ? 1 : 0, time, time);
      return toBoolUpstream(db.prepare("SELECT * FROM upstreams WHERE id = ?").get(Number(result.lastInsertRowid)) as UpstreamRecord);
    },
    deleteUpstream(id) {
      db.prepare("UPDATE users SET upstream_id = NULL WHERE upstream_id = ?").run(id);
      db.prepare("DELETE FROM upstreams WHERE id = ?").run(id);
    },
    findUpstreamById(id) {
      const row = db.prepare("SELECT * FROM upstreams WHERE id = ?").get(id) as UpstreamRecord | undefined;
      return row ? toBoolUpstream(row) : undefined;
    },
    findUpstream(client) {
      const row = db.prepare("SELECT * FROM upstreams WHERE client = ?").get(client) as UpstreamRecord | undefined;
      return row ? toBoolUpstream(row) : undefined;
    },
    updateUpstreamHealth(client, input) {
      const time = now();
      db.prepare(`
        UPDATE upstreams
        SET health_status = ?, last_checked_at = ?, last_latency_ms = ?, last_error = ?,
            subscription_userinfo = CASE WHEN ? != '' THEN ? ELSE subscription_userinfo END
        WHERE client = ?
      `).run(input.status, time, input.latencyMs ?? null, input.error ?? "", input.subscriptionUserinfo ?? "", input.subscriptionUserinfo ?? "", client);
      const row = db.prepare("SELECT * FROM upstreams WHERE client = ?").get(client) as UpstreamRecord | undefined;
      if (!row) throw new Error("上游不存在");
      return toBoolUpstream(row);
    },
    listAnnouncements() {
      return (db.prepare("SELECT * FROM announcements ORDER BY id DESC").all() as AnnouncementRecord[]).map(toAnnouncement);
    },
    createAnnouncement(input) {
      const time = now();
      const result = db.prepare("INSERT INTO announcements (title, content, created_at) VALUES (?, ?, ?)")
        .run(input.title, input.content, time);
      return toAnnouncement(db.prepare("SELECT * FROM announcements WHERE id = ?").get(Number(result.lastInsertRowid)) as AnnouncementRecord);
    },
    deleteAnnouncement(id) {
      db.prepare("DELETE FROM announcement_reads WHERE announcement_id = ?").run(id);
      db.prepare("DELETE FROM announcements WHERE id = ?").run(id);
    },
    listUserAnnouncements(userId) {
      return db.prepare(`
        SELECT announcements.*, announcement_reads.read_at
        FROM announcements
        LEFT JOIN announcement_reads
          ON announcement_reads.announcement_id = announcements.id
         AND announcement_reads.user_id = ?
        ORDER BY announcements.id DESC
      `).all(userId).map((row) => {
        const item = row as AnnouncementRecord & { read_at: string | null };
        return { ...toAnnouncement(item), isRead: Boolean(item.read_at), readAt: item.read_at };
      });
    },
    markAnnouncementRead(userId, announcementId) {
      const announcement = db.prepare("SELECT * FROM announcements WHERE id = ?").get(announcementId) as AnnouncementRecord | undefined;
      if (!announcement) return undefined;
      const time = now();
      db.prepare(`
        INSERT INTO announcement_reads (announcement_id, user_id, read_at) VALUES (?, ?, ?)
        ON CONFLICT(announcement_id, user_id) DO UPDATE SET read_at = excluded.read_at
      `).run(announcementId, userId, time);
      const row = db.prepare(`
        SELECT announcements.*, announcement_reads.read_at
        FROM announcements
        LEFT JOIN announcement_reads
          ON announcement_reads.announcement_id = announcements.id
         AND announcement_reads.user_id = ?
        WHERE announcements.id = ?
      `).get(userId, announcementId) as AnnouncementRecord & { read_at: string | null };
      return { ...toAnnouncement(row), isRead: Boolean(row.read_at), readAt: row.read_at };
    },
    writeAccessLog(input) {
      db.prepare(`
        INSERT INTO access_logs (user_id, username, client, ip, user_agent, status, response_time_ms, accessed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(input.user_id, input.username, input.client, input.ip, input.user_agent, input.status, input.response_time_ms, now());
      if (input.user_id) {
        db.prepare("UPDATE users SET last_client = ?, last_access_at = ?, updated_at = ? WHERE id = ?")
          .run(input.client, now(), now(), input.user_id);
      }
    },
    listLogs(query) {
      return queryLogs(query);
    },
    listLogsByUser(userId, query) {
      return queryLogs(query, userId);
    },
    deleteLogsBefore(before) {
      return db.prepare("DELETE FROM access_logs WHERE accessed_at < ?").run(before).changes;
    },
    writeAuditLog(input) {
      db.prepare(`
        INSERT INTO admin_audit_logs (admin_user_id, admin_username, action, target_type, target_id, details, ip, user_agent, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(input.admin_user_id, input.admin_username, input.action, input.target_type, input.target_id, input.details, input.ip, input.user_agent, now());
    },
    listAuditLogs() {
      return db.prepare("SELECT * FROM admin_audit_logs ORDER BY id DESC LIMIT 200").all() as AdminAuditLogRecord[];
    },
    dashboard() {
      const totalUsers = Number((db.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number }).count);
      const activeUsers = Number((db.prepare("SELECT COUNT(*) AS count FROM users WHERE status = 'active'").get() as { count: number }).count);
      const disabledUsers = Number((db.prepare("SELECT COUNT(*) AS count FROM users WHERE status = 'disabled'").get() as { count: number }).count);
      const today = new Date().toISOString().slice(0, 10);
      const todayRequests = Number((db.prepare("SELECT COUNT(*) AS count FROM access_logs WHERE accessed_at LIKE ?").get(`${today}%`) as { count: number }).count);
      const todaySuccess = Number((db.prepare("SELECT COUNT(*) AS count FROM access_logs WHERE accessed_at LIKE ? AND status = 'success'").get(`${today}%`) as { count: number }).count);
      const todayFailed = todayRequests - todaySuccess;
      const averageResponseMs = Math.round(Number((db.prepare("SELECT COALESCE(AVG(response_time_ms), 0) AS value FROM access_logs WHERE accessed_at LIKE ?").get(`${today}%`) as { value: number }).value));
      const activeToday = Number((db.prepare("SELECT COUNT(DISTINCT user_id) AS count FROM access_logs WHERE accessed_at LIKE ? AND user_id IS NOT NULL").get(`${today}%`) as { count: number }).count);
      const expiringSoon = Number((db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'user' AND status = 'active' AND expires_at BETWEEN ? AND ?").get(now(), new Date(Date.now() + 7 * 86400000).toISOString()) as { count: number }).count);
      const upstreamSummary = db.prepare("SELECT health_status AS status, COUNT(*) AS count FROM upstreams WHERE enabled = 1 GROUP BY health_status").all() as Array<{ status: string; count: number }>;
      const dailyTrend = db.prepare(`
        SELECT substr(accessed_at, 1, 10) AS date, COUNT(*) AS requests,
               SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success
        FROM access_logs WHERE accessed_at >= ? GROUP BY substr(accessed_at, 1, 10) ORDER BY date
      `).all(new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)) as Array<{ date: string; requests: number; success: number }>;
      const clientStats = db.prepare("SELECT client, COUNT(*) AS count FROM access_logs GROUP BY client ORDER BY count DESC LIMIT 6").all() as Array<{ client: string; count: number }>;
      const recentLogs = db.prepare(`
        SELECT access_logs.*, COALESCE(users.username, access_logs.username) AS username
        FROM access_logs
        LEFT JOIN users ON users.id = access_logs.user_id
        ORDER BY access_logs.id DESC
        LIMIT 8
      `).all() as AccessLogRecord[];
      const upstreams = (db.prepare("SELECT * FROM upstreams WHERE url != '' ORDER BY id").all() as UpstreamRecord[]).map(toBoolUpstream);
      return { totalUsers, activeUsers, disabledUsers, todayRequests, todaySuccess, todayFailed, averageResponseMs, activeToday, expiringSoon, upstreamSummary, upstreams, dailyTrend, clientStats, recentLogs };
    },
    getSettings() {
      const rows = db.prepare("SELECT key, value FROM settings").all() as Array<{ key: string; value: string }>;
      return Object.fromEntries(rows.map((row) => [row.key, row.value]));
    },
    setSettings(settings) {
      const stmt = db.prepare(`
        INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `);
      for (const [key, value] of Object.entries(settings)) stmt.run(key, value, now());
      return this.getSettings();
    }
  };
}
