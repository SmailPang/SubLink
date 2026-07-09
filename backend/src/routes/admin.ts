import { Router } from "express";
import { z } from "zod";
import { clients } from "../clients.js";
import type { Store } from "../db.js";
import { withIpLocation } from "../ipGeo.js";

export function adminRoutes(store: Store) {
  const router = Router();

  router.get("/dashboard", (_req, res) => res.json(store.dashboard()));
  router.get("/users", (_req, res) => res.json({ items: store.listUsers() }));

  router.get("/announcements", (_req, res) => res.json({ items: store.listAnnouncements() }));

  router.post("/announcements", (req, res) => {
    const parsed = z.object({
      title: z.string().min(1).max(100),
      content: z.string().min(1).max(5000)
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "表单内容不完整" });
    return res.status(201).json({ announcement: store.createAnnouncement(parsed.data), message: "创建成功" });
  });

  router.delete("/announcements/:id", (req, res) => {
    store.deleteAnnouncement(Number(req.params.id));
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
    return res.status(201).json({ user: store.createUser(parsed.data) });
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
    return res.json({
      user: store.updateUser(Number(req.params.id), {
        username: parsed.data.username,
        expires_at: parsed.data.expiresAt,
        remark: parsed.data.remark,
        status: parsed.data.status
      })
    });
  });

  router.post("/users/:id/enable", (req, res) => res.json({ user: store.updateUserStatus(Number(req.params.id), "active") }));
  router.post("/users/:id/disable", (req, res) => res.json({ user: store.updateUserStatus(Number(req.params.id), "disabled") }));
  router.post("/users/:id/reset-token", (req, res) => res.json({ token: store.resetToken(Number(req.params.id)), message: "操作成功" }));
  router.post("/users/:id/password", (req, res) => {
    const parsed = z.object({ password: z.string().min(6) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "密码不能少于 6 位" });
    try {
      store.setUserPassword(Number(req.params.id), parsed.data.password);
      return res.json({ message: "保存成功" });
    } catch {
      return res.status(404).json({ message: "用户不存在" });
    }
  });
  router.delete("/users/:id", (req, res) => {
    store.deleteUser(Number(req.params.id));
    return res.json({ message: "删除成功" });
  });

  router.get("/upstreams", (_req, res) => {
    const rows = store.listUpstreams();
    return res.json({
      items: clients.map((item) => rows.find((row) => row.client === item.client) ?? store.saveUpstream(item.client, "", true))
    });
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
    return res.json({ items: store.listUpstreams(), message: "保存成功" });
  });

  router.put("/upstreams/:client", (req, res) => {
    const parsed = z.object({ url: z.string().optional().default(""), enabled: z.boolean().optional().default(true) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "表单内容不完整" });
    const upstream = store.saveUpstream(req.params.client, parsed.data.url, parsed.data.enabled);
    return res.json({ upstream, message: "保存成功" });
  });

  router.post("/upstreams/:client/test", async (req, res) => {
    const upstream = store.findUpstream(req.params.client);
    if (!upstream?.url) return res.status(400).json({ message: "上游链接不可用" });
    try {
      const result = await fetch(upstream.url, { signal: AbortSignal.timeout(5000) });
      if (!result.ok) return res.status(400).json({ message: "上游链接不可用" });
      return res.json({ message: "测试成功" });
    } catch {
      return res.status(400).json({ message: "上游链接不可用" });
    }
  });

  router.get("/logs", async (_req, res) => res.json({ items: await withIpLocation(store.listLogs()) }));
  router.get("/settings", (_req, res) => res.json({ settings: store.getSettings() }));
  router.put("/settings", (req, res) => res.json({ settings: store.setSettings(req.body ?? {}), message: "保存成功" }));

  return router;
}
