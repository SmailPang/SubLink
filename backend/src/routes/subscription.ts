import { Router } from "express";
import { detectClientFromUserAgent, normalizeClient } from "../clients.js";
import type { Store } from "../db.js";

const passthroughHeaders = [
  "subscription-userinfo",
  "profile-update-interval",
  "profile-web-page-url",
  "support-url",
  "profile-title",
  "content-disposition"
];

function applyUpstreamHeaders(remote: Response, res: import("express").Response, overrideTitle?: string) {
  const contentType = remote.headers.get("content-type");
  if (contentType) res.setHeader("content-type", contentType);

  for (const header of passthroughHeaders) {
    // 如果设置了自定义标题，跳过上游的 profile-title
    if (header === "profile-title" && overrideTitle) {
      continue;
    }
    const value = remote.headers.get(header);
    if (value) res.setHeader(header, value);
  }

  // 最后设置自定义标题（会覆盖上游的值）
  if (overrideTitle) {
    res.setHeader("profile-title", overrideTitle);
    res.setHeader("content-disposition", `attachment; filename="${overrideTitle}"`);
  }
}

function upstreamRequestHeaders(req: import("express").Request) {
  const headers = new Headers();
  const userAgent = req.get("user-agent");
  const accept = req.get("accept");
  const acceptLanguage = req.get("accept-language");

  if (userAgent) headers.set("user-agent", userAgent);
  if (accept) headers.set("accept", accept);
  if (acceptLanguage) headers.set("accept-language", acceptLanguage);

  return headers;
}

function pickUpstream(store: Store, client: string) {
  const requested = store.findUpstream(client);
  if (requested?.enabled && requested.url) return requested;

  const fallbackOrder = client === "default" ? ["clash", "mihomo", "default"] : ["default", "clash", "mihomo"];
  for (const fallback of fallbackOrder) {
    const upstream = store.findUpstream(fallback);
    if (upstream?.enabled && upstream.url) return upstream;
  }

  return requested;
}

function sampleSubscription(username: string, client: string) {
  const label = encodeURIComponent(`SubLink 本地测试节点-${client}-${username}`);
  return `proxies:
  - name: SubLink 本地测试节点
    type: ss
    server: 127.0.0.1
    port: 8388
    cipher: aes-128-gcm
    password: sublink-local
proxy-groups:
  - name: 自动选择
    type: select
    proxies:
      - SubLink 本地测试节点
rules:
  - MATCH,自动选择

ss://YWVzLTEyOC1nY206c3VibGluay1sb2NhbEAxMjcuMC4wLjE6ODM4OA#${label}
`;
}

function shouldRedirectToUpstream(store: Store) {
  return store.getSettings().subscriptionMode === "redirect";
}

export function subscriptionRoutes(store: Store) {
  const router = Router();

  const handler = async (req: import("express").Request, res: import("express").Response) => {
    const started = Date.now();
    const clientParam = Array.isArray(req.params.client) ? req.params.client[0] : req.params.client;
    const tokenParam = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
    const user = store.findUserByToken(tokenParam);
    const ip = req.ip || req.socket.remoteAddress || "";
    const ua = req.get("user-agent") || "";
    const client = clientParam ? normalizeClient(clientParam) : detectClientFromUserAgent(ua) ?? "default";

    if (!user || user.status !== "active" || (user.role !== "admin" && new Date(user.expires_at).getTime() < Date.now())) {
      store.writeAccessLog({
        user_id: user?.id ?? null,
        username: user?.username ?? "未知用户",
        client,
        ip,
        user_agent: ua,
        status: "failed",
        response_time_ms: Date.now() - started
      });
      return res.status(403).type("text/plain").send("订阅链接已失效");
    }

    const upstream = pickUpstream(store, client);
    const settings = store.getSettings();
    const converterUrl = settings.converterUrl;
    const remoteConfig = settings.remoteConfig;
    const siteName = settings.siteName || "SubLink";
    const useConverter = converterUrl && remoteConfig && remoteConfig !== "none";

    try {
      if (upstream?.enabled && upstream.url) {
        // 如果配置了订阅转换，不能直跳（需要转换）
        if (shouldRedirectToUpstream(store) && !useConverter) {
          store.writeAccessLog({ user_id: user.id, username: user.username, client, ip, user_agent: ua, status: "success", response_time_ms: Date.now() - started });
          return res.redirect(302, upstream.url);
        }

        // 如果配置了订阅转换服务和远程配置
        if (useConverter) {
          const convertUrl = new URL(converterUrl);
          convertUrl.searchParams.set("target", "clash");
          convertUrl.searchParams.set("url", upstream.url);
          convertUrl.searchParams.set("config", remoteConfig);

          const remote = await fetch(convertUrl.toString(), {
            headers: upstreamRequestHeaders(req),
            signal: AbortSignal.timeout(15000)
          });

          if (!remote.ok) throw new Error("converter failed");
          const text = await remote.text();
          applyUpstreamHeaders(remote, res, siteName);
          store.writeAccessLog({ user_id: user.id, username: user.username, client, ip, user_agent: ua, status: "success", response_time_ms: Date.now() - started });
          return res.send(text);
        }

        // 否则直接代理上游
        const remote = await fetch(upstream.url, {
          headers: upstreamRequestHeaders(req),
          signal: AbortSignal.timeout(8000)
        });
        if (!remote.ok) throw new Error("bad upstream");
        const text = await remote.text();
        applyUpstreamHeaders(remote, res, siteName);
        store.writeAccessLog({ user_id: user.id, username: user.username, client, ip, user_agent: ua, status: "success", response_time_ms: Date.now() - started });
        return res.send(text);
      }

      store.writeAccessLog({ user_id: user.id, username: user.username, client, ip, user_agent: ua, status: "success", response_time_ms: Date.now() - started });
      return res.type("text/plain").send(sampleSubscription(user.username, client));
    } catch {
      store.writeAccessLog({ user_id: user.id, username: user.username, client, ip, user_agent: ua, status: "failed", response_time_ms: Date.now() - started });
      return res.status(502).type("text/plain").send("上游链接不可用");
    }
  };

  router.get("/:token", handler);
  router.get("/:token/:client", handler);

  return router;
}
