import { Router } from "express";
import { z } from "zod";
import { clientName, userVisibleClients } from "../clients.js";
import type { Store } from "../db.js";
import { withIpLocation } from "../ipGeo.js";
import { accessLogQuery } from "../logQuery.js";
import { parseSubscriptionUserinfo } from "../subscriptionInfo.js";
import type { AuthedRequest } from "../types.js";

function baseUrl(req: AuthedRequest) {
  const configured = req.app.locals.store?.getSettings?.().publicBaseUrl as string | undefined;
  const fallback = `${req.protocol}://${req.get("host")}`;
  return (configured || fallback).replace(/\/+$/, "");
}

export function userRoutes(store: Store) {
  const router = Router();

  router.get("/subscription", async (req: AuthedRequest, res) => {
    const user = store.findUserById(req.user?.id ?? 0);
    if (!user) return res.status(401).json({ message: "请先登录" });
    const publicUser = store.publicUser(user);
    const origin = baseUrl(req);
    const upstreams = store.listUpstreams();
    const assigned = user.custom_upstream_url ? undefined : (user.upstream_id ? store.findUpstreamById(user.upstream_id) : undefined);
    const usageUpstream = assigned ?? upstreams.find((row) => row.enabled && row.url);
    const clientLinks = userVisibleClients.flatMap((item) => {
      const legacyClientConfig = upstreams.find((row) => row.client === item.client && !row.client.startsWith("source-"));
      if (legacyClientConfig && !legacyClientConfig.enabled) return [];
      return [{
        client: item.client,
        name: clientName(item.client),
        link: `${origin}/sub/${user.token}/${item.client}`,
        enabled: true
      }];
    });

    let customUsage = null;
    if (user.custom_upstream_url) {
      try {
        const response = await fetch(user.custom_upstream_url, { headers: { "user-agent": store.getSettings().usageRefreshUserAgent || "clash-verge/v2.5.1" }, signal: AbortSignal.timeout(8000) });
        customUsage = parseSubscriptionUserinfo(response.headers.get("subscription-userinfo") || undefined, new Date().toISOString());
        await response.body?.cancel();
      } catch { /* 专属上游不可用时仍允许用户查看订阅链接 */ }
    }
    return res.json({
      user: publicUser,
      genericLink: `${origin}/sub/${user.token}`,
      clientLinks,
      usage: customUsage ?? parseSubscriptionUserinfo(usageUpstream?.subscriptionUserinfo, usageUpstream?.lastCheckedAt),
      upstreamName: user.custom_upstream_url ? "专属上游" : usageUpstream?.name || null,
      instructions: [
        "推荐优先使用通用订阅链接。",
        "如果客户端无法自动识别，请使用对应客户端专用链接。",
        "Token 重置后旧链接会立即失效。"
      ]
    });
  });

  router.post("/reset-token", (req: AuthedRequest, res) => {
    const id = req.user?.id ?? 0;
    const next = store.resetToken(id);
    return res.json({ token: next, message: "操作成功" });
  });

  router.get("/logs", async (req: AuthedRequest, res) => {
    const id = req.user?.id ?? 0;
    const result = store.listLogsByUser(id, accessLogQuery(req));
    return res.json({ ...result, items: await withIpLocation(result.items) });
  });

  router.get("/announcements", (req: AuthedRequest, res) => {
    return res.json({ items: store.listUserAnnouncements(req.user?.id ?? 0) });
  });

  router.post("/announcements/:id/read", (req: AuthedRequest, res) => {
    const announcement = store.markAnnouncementRead(req.user?.id ?? 0, Number(req.params.id));
    if (!announcement) return res.status(404).json({ message: "公告不存在" });
    return res.json({ announcement, message: "操作成功" });
  });

  router.patch("/profile", (req: AuthedRequest, res) => {
    const parsed = z.object({
      username: z.string().min(1).max(64),
      remark: z.string().max(200).optional().default("")
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "表单内容不完整" });

    try {
      return res.json({ user: store.updateOwnProfile(req.user?.id ?? 0, parsed.data), message: "保存成功" });
    } catch (error) {
      const message = error instanceof Error && error.message.includes("UNIQUE") ? "用户名已存在" : "保存失败";
      return res.status(400).json({ message });
    }
  });

  router.post("/password", (req: AuthedRequest, res) => {
    const parsed = z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(6)
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "表单内容不完整" });

    try {
      store.changePassword(req.user?.id ?? 0, parsed.data.currentPassword, parsed.data.newPassword);
      return res.json({ message: "保存成功" });
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : "保存失败" });
    }
  });

  router.post("/force-password", (req: AuthedRequest, res) => {
    const parsed = z.object({
      newPassword: z.string().min(6)
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "密码不能少于 6 位" });

    try {
      store.forceChangePassword(req.user?.id ?? 0, parsed.data.newPassword);
      return res.json({ message: "保存成功" });
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : "保存失败" });
    }
  });

  return router;
}
