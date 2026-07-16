import { Router } from "express";
import { createHash } from "node:crypto";
import { z } from "zod";
import { clearSessionCookie, setSessionCookie, signToken, verifyPassword, verifyTurnstileToken } from "../auth.js";
import type { Store } from "../db.js";

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;

function rateKey(kind: "ip" | "account", value: string) {
  return createHash("sha256").update(`${kind}:${value.trim().toLowerCase()}`).digest("hex");
}

function rateKeys(ip: string, username: string) {
  return [rateKey("ip", ip || "unknown"), rateKey("account", username)];
}

function retryAfterSeconds(store: Store, keys: string[]) {
  const now = Date.now();
  let retryAfter = 0;
  for (const key of keys) {
    const row = store.db.prepare("SELECT blocked_until FROM login_rate_limits WHERE rate_key = ?").get(key) as { blocked_until?: string } | undefined;
    const blockedUntil = row?.blocked_until ? new Date(row.blocked_until).getTime() : 0;
    if (blockedUntil > now) retryAfter = Math.max(retryAfter, Math.ceil((blockedUntil - now) / 1000));
  }
  return retryAfter;
}

function recordFailure(store: Store, keys: string[]) {
  const now = Date.now();
  const time = new Date(now).toISOString();
  const cutoff = now - LOGIN_WINDOW_MS;
  const transaction = store.db.transaction(() => {
    for (const key of keys) {
      const row = store.db.prepare("SELECT attempts, window_started_at FROM login_rate_limits WHERE rate_key = ?").get(key) as { attempts: number; window_started_at: string } | undefined;
      const attempts = !row || new Date(row.window_started_at).getTime() <= cutoff ? 1 : row.attempts + 1;
      const windowStartedAt = !row || new Date(row.window_started_at).getTime() <= cutoff ? time : row.window_started_at;
      const blockedUntil = attempts >= LOGIN_MAX_ATTEMPTS ? new Date(now + LOGIN_WINDOW_MS).toISOString() : null;
      store.db.prepare(`
        INSERT INTO login_rate_limits (rate_key, attempts, window_started_at, blocked_until, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(rate_key) DO UPDATE SET attempts = excluded.attempts, window_started_at = excluded.window_started_at,
          blocked_until = excluded.blocked_until, updated_at = excluded.updated_at
      `).run(key, attempts, windowStartedAt, blockedUntil, time);
    }
  });
  transaction();
}

export function authRoutes(store: Store, jwtSecret: string, turnstileSecret?: string, turnstileVerifier?: (token: string, remoteIp?: string) => Promise<boolean>) {
  const router = Router();
  const schema = z.object({ username: z.string().min(1), password: z.string().min(1), turnstileToken: z.string().optional() });

  router.post("/login", async (req, res) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "账号或密码错误" });
    if (!turnstileSecret && !turnstileVerifier) return res.status(503).json({ message: "登录安全配置不完整，请联系管理员" });
    const passedTurnstile = turnstileVerifier
      ? await turnstileVerifier(parsed.data.turnstileToken ?? "", req.ip)
      : await verifyTurnstileToken(parsed.data.turnstileToken ?? "", turnstileSecret, req.ip);
    if (!passedTurnstile) return res.status(403).json({ message: "人机验证失败，请重试" });

    const keys = rateKeys(req.ip ?? "unknown", parsed.data.username);
    const retryAfter = retryAfterSeconds(store, keys);
    if (retryAfter > 0) {
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({ message: "登录尝试过于频繁，请稍后再试" });
    }

    const user = store.findUserByUsername(parsed.data.username);
    if (!user || !verifyPassword(parsed.data.password, user)) {
      recordFailure(store, keys);
      return res.status(401).json({ message: "账号或密码错误" });
    }
    if (user.status === "disabled") {
      recordFailure(store, keys);
      return res.status(403).json({ message: "账号已被停用" });
    }

    store.db.prepare(`DELETE FROM login_rate_limits WHERE rate_key IN (${keys.map(() => "?").join(",")})`).run(...keys);
    const token = signToken(user, jwtSecret);
    setSessionCookie(req, res, token);
    return res.json({ token, user: store.publicUser(user) });
  });

  router.post("/logout", (req, res) => {
    clearSessionCookie(req, res);
    return res.json({ message: "已退出登录" });
  });

  return router;
}
