import { Router } from "express";
import { z } from "zod";
import { clients } from "../clients.js";
import type { Store } from "../db.js";
import { withIpLocation } from "../ipGeo.js";
import { accessLogQuery } from "../logQuery.js";
import type { AuthedRequest, Upstream } from "../types.js";
import { refreshUsage, usageRefreshInterval, usageRefreshUserAgent } from "../usageRefresh.js";

export function adminRoutes(store: Store) {
  const router = Router();

  function audit(req: AuthedRequest, action: string, targetType: string, targetId = "", details: unknown = {}) {
    const admin = store.findUserById(req.user?.id ?? 0);
    store.writeAuditLog({
      admin_user_id: admin?.id ?? null,
      admin_username: admin?.username ?? req.user?.username ?? "未知管理员",
      action,
      target_type: targetType,
      target_id: targetId,
      details: JSON.stringify(details),
      ip: req.ip || req.socket.remoteAddress || "",
      user_agent: req.get("user-agent") || ""
    });
  }

  async function checkUpstream(item: Upstream) {
    if (!item.url) return store.updateUpstreamHealth(item.client, { status: "unhealthy", error: "未配置上游链接" });
    const started = Date.now();
    try {
      const response = await fetch(item.url, { headers: { "user-agent": usageRefreshUserAgent(store.getSettings()) }, signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = store.updateUpstreamHealth(item.client, {
        status: "healthy",
        latencyMs: Date.now() - started,
        subscriptionUserinfo: response.headers.get("subscription-userinfo") ?? ""
      });
      await response.body?.cancel();
      return result;
    } catch (error) {
      return store.updateUpstreamHealth(item.client, {
        status: "unhealthy",
        latencyMs: Date.now() - started,
        error: error instanceof Error ? error.message : "上游链接不可用"
      });
    }
  }

  router.get("/dashboard", (_req, res) => res.json(store.dashboard()));
  router.get("/users", (_req, res) => res.json({ items: store.listUsers() }));

  router.get("/announcements", (_req, res) => res.json({ items: store.listAnnouncements() }));

  router.post("/announcements", (req, res) => {
    const parsed = z.object({
      title: z.string().min(1).max(100),
      content: z.string().min(1).max(5000)
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "表单内容不完整" });
    const announcement = store.createAnnouncement(parsed.data);
    audit(req as AuthedRequest, "announcement.create", "announcement", String(announcement.id), { title: announcement.title });
    return res.status(201).json({ announcement, message: "创建成功" });
  });

  router.delete("/announcements/:id", (req, res) => {
    store.deleteAnnouncement(Number(req.params.id));
    audit(req as AuthedRequest, "announcement.delete", "announcement", req.params.id);
    return res.json({ message: "删除成功" });
  });

  router.post("/users", (req, res) => {
    const parsed = z.object({
      username: z.string().min(1),
      password: z.string().min(6),
      role: z.enum(["admin", "user"]).optional(),
      expiresAt: z.string().optional(),
      remark: z.string().optional()
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "表单内容不完整" });
    const user = store.createUser(parsed.data);
    audit(req as AuthedRequest, "user.create", "user", String(user.id), { username: user.username, role: user.role });
    return res.status(201).json({ user });
  });

  router.post("/users/batch", (req, res) => {
    const parsed = z.object({
      ids: z.array(z.number().int().positive()).min(1).max(500),
      action: z.enum(["enable", "disable", "delete", "extend"]),
      days: z.number().int().positive().max(3650).optional()
    }).safeParse(req.body);
    if (!parsed.success || (parsed.data.action === "extend" && !parsed.data.days)) return res.status(400).json({ message: "批量操作参数不完整" });
    const affected = store.batchUsers(parsed.data.ids, parsed.data.action, parsed.data.days);
    audit(req as AuthedRequest, `user.batch.${parsed.data.action}`, "user", parsed.data.ids.join(","), { affected, days: parsed.data.days });
    return res.json({ affected, message: `已处理 ${affected} 个用户` });
  });

  router.get("/users/:id", (req, res) => {
    const user = store.findUserById(Number(req.params.id));
    if (!user) return res.status(404).json({ message: "用户不存在" });
    return res.json({ user: store.publicUser(user) });
  });

  router.patch("/users/:id", (req, res) => {
    const parsed = z.object({
      username: z.string().min(1).optional(),
      expiresAt: z.string().optional(),
      remark: z.string().optional(),
      status: z.enum(["active", "disabled"]).optional()
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "表单内容不完整" });
    const user = store.updateUser(Number(req.params.id), {
        username: parsed.data.username,
        expires_at: parsed.data.expiresAt,
        remark: parsed.data.remark,
        status: parsed.data.status
      });
    audit(req as AuthedRequest, "user.update", "user", req.params.id, parsed.data);
    return res.json({ user });
  });

  router.post("/users/:id/enable", (req, res) => { const user = store.updateUserStatus(Number(req.params.id), "active"); audit(req as AuthedRequest, "user.enable", "user", req.params.id); return res.json({ user }); });
  router.post("/users/:id/disable", (req, res) => { const user = store.updateUserStatus(Number(req.params.id), "disabled"); audit(req as AuthedRequest, "user.disable", "user", req.params.id); return res.json({ user }); });
  router.post("/users/:id/reset-token", (req, res) => { const token = store.resetToken(Number(req.params.id)); audit(req as AuthedRequest, "user.reset_token", "user", req.params.id); return res.json({ token, message: "操作成功" }); });
  router.post("/users/:id/password", (req, res) => {
    const parsed = z.object({ password: z.string().min(6) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "密码不能少于 6 位" });
    try {
      store.setUserPassword(Number(req.params.id), parsed.data.password);
      audit(req as AuthedRequest, "user.password", "user", req.params.id);
      return res.json({ message: "保存成功" });
    } catch {
      return res.status(404).json({ message: "用户不存在" });
    }
  });
  router.delete("/users/:id", (req, res) => {
    store.deleteUser(Number(req.params.id));
    audit(req as AuthedRequest, "user.delete", "user", req.params.id);
    return res.json({ message: "删除成功" });
  });

  router.get("/upstreams", (_req, res) => {
    const rows = store.listUpstreams();
    return res.json({
      items: clients.map((item) => rows.find((row) => row.client === item.client) ?? store.saveUpstream(item.client, "", true))
    });
  });

  router.post("/upstreams/health-check", async (req, res) => {
    const configured = store.listUpstreams().filter((item) => item.enabled && item.url);
    const items = await Promise.all(configured.map(checkUpstream));
    audit(req as AuthedRequest, "upstream.health_check_all", "upstream", "", { count: items.length });
    return res.json({ items, message: `已检测 ${items.length} 个上游` });
  });

  router.post("/upstreams/refresh-usage", async (req, res) => {
    const result = await refreshUsage(store, true);
    audit(req as AuthedRequest, "upstream.refresh_usage", "upstream", "", result);
    return res.json({ ...result, message: `已刷新 ${result.refreshed} 个上游，失败 ${result.failed} 个` });
  });

  router.put("/upstreams", (req, res) => {
    const parsed = z.object({
      items: z.array(z.object({
        client: z.string().min(1),
        url: z.string().optional().default(""),
        enabled: z.boolean().optional().default(true)
      })).min(1)
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "表单内容不完整" });

    for (const item of parsed.data.items) {
      store.saveUpstream(item.client, item.url, item.enabled);
    }
    audit(req as AuthedRequest, "upstream.save_all", "upstream", "", { count: parsed.data.items.length });
    return res.json({ items: store.listUpstreams(), message: "保存成功" });
  });

  router.put("/upstreams/:client", (req, res) => {
    const parsed = z.object({ url: z.string().optional().default(""), enabled: z.boolean().optional().default(true) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "表单内容不完整" });
    const upstream = store.saveUpstream(req.params.client, parsed.data.url, parsed.data.enabled);
    audit(req as AuthedRequest, "upstream.update", "upstream", req.params.client, { enabled: parsed.data.enabled, hasUrl: Boolean(parsed.data.url) });
    return res.json({ upstream, message: "保存成功" });
  });

  router.post("/upstreams/:client/test", async (req, res) => {
    const upstream = store.findUpstream(req.params.client);
    if (!upstream?.url) return res.status(400).json({ message: "上游链接不可用" });
    const result = await checkUpstream(upstream);
    audit(req as AuthedRequest, "upstream.health_check", "upstream", upstream.client, { status: result.healthStatus, latencyMs: result.lastLatencyMs });
    return result.healthStatus === "healthy" ? res.json({ upstream: result, message: "测试成功" }) : res.status(400).json({ upstream: result, message: result.lastError || "上游链接不可用" });
  });

  router.get("/logs", async (req, res) => {
    const result = store.listLogs(accessLogQuery(req));
    return res.json({ ...result, items: await withIpLocation(result.items) });
  });
  router.delete("/logs", (req, res) => {
    const before = typeof req.query.before === "string" ? req.query.before : "";
    if (!before || Number.isNaN(new Date(before).getTime())) return res.status(400).json({ message: "清理日期无效" });
    const deleted = store.deleteLogsBefore(before);
    audit(req as AuthedRequest, "access_log.cleanup", "access_log", "", { before, deleted });
    return res.json({ deleted, message: `已清理 ${deleted} 条日志` });
  });
  router.get("/audit-logs", (_req, res) => res.json({ items: store.listAuditLogs() }));
  router.get("/settings", (_req, res) => res.json({ settings: store.getSettings() }));
  router.put("/settings", (req, res) => {
    const input = { ...(req.body ?? {}) } as Record<string, string>;
    if (input.usageRefreshIntervalMinutes !== undefined) input.usageRefreshIntervalMinutes = String(usageRefreshInterval(input));
    if (input.usageRefreshUserAgent !== undefined) input.usageRefreshUserAgent = input.usageRefreshUserAgent.trim().slice(0, 512);
    delete input.usageRefreshLastAt;
    const settings = store.setSettings(input);
    audit(req as AuthedRequest, "settings.update", "settings", "", { keys: Object.keys(input) });
    return res.json({ settings, message: "保存成功" });
  });

  return router;
}
