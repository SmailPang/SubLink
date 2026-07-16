import express from "express";
import { requireAdmin, requireAuth } from "./auth.js";
import { createStore } from "./db.js";
import { adminRoutes } from "./routes/admin.js";
import { authRoutes } from "./routes/auth.js";
import { subscriptionRoutes } from "./routes/subscription.js";
import { userRoutes } from "./routes/user.js";
import type { AppConfig } from "./types.js";

export async function createApp(config: AppConfig = {}) {
  const store = createStore(config.dbPath);
  const jwtSecret = config.jwtSecret ?? process.env.JWT_SECRET;
  const turnstileSecret = config.turnstileSecret ?? process.env.TURNSTILE_SECRET_KEY;
  if (!jwtSecret) throw new Error("JWT_SECRET 未配置，服务拒绝启动");
  const app = express();

  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests");
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
    if (_req.path.startsWith("/api/") || _req.path.startsWith("/sub/")) res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(express.json());
  app.locals.store = store;

  app.get("/api/health", (_req, res) => res.json({ status: "ok", message: "服务正常" }));
  app.get("/api/public/settings", (_req, res) => {
    const settings = store.getSettings();
    return res.json({ settings: { siteName: settings.siteName || "SubLink" } });
  });
  app.use("/api/auth", authRoutes(store, jwtSecret, turnstileSecret, config.turnstileVerifier));
  app.get("/api/auth/me", requireAuth(store, jwtSecret), (req, res) => {
    const user = store.findUserById((req as { user?: { id: number } }).user?.id ?? 0);
    if (!user) return res.status(401).json({ message: "请先登录" });
    return res.json({ user: store.publicUser(user) });
  });
  app.use("/api/user", requireAuth(store, jwtSecret), userRoutes(store, jwtSecret));
  app.use("/api/admin", requireAuth(store, jwtSecret), requireAdmin, adminRoutes(store));
  app.use("/sub", subscriptionRoutes(store));

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    return res.status(500).json({ message: "服务器内部错误" });
  });

  return app;
}
