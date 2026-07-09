import cors from "cors";
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
  const jwtSecret = config.jwtSecret ?? process.env.JWT_SECRET ?? "sublink-local-secret";
  const turnstileSecret = config.turnstileSecret ?? process.env.TURNSTILE_SECRET_KEY;
  const app = express();

  app.set("trust proxy", true);
  app.use(cors());
  app.use(express.json());
  app.locals.store = store;

  app.get("/api/health", (_req, res) => res.json({ status: "ok", message: "服务正常" }));
  app.get("/api/public/settings", (_req, res) => {
    const settings = store.getSettings();
    return res.json({ settings: { siteName: settings.siteName || "SubLink" } });
  });
  app.use("/api/auth", authRoutes(store, jwtSecret, turnstileSecret));
  app.get("/api/auth/me", requireAuth(store, jwtSecret), (req, res) => {
    const user = store.findUserById((req as { user?: { id: number } }).user?.id ?? 0);
    if (!user) return res.status(401).json({ message: "请先登录" });
    return res.json({ user: store.publicUser(user) });
  });
  app.use("/api/user", requireAuth(store, jwtSecret), userRoutes(store));
  app.use("/api/admin", requireAuth(store, jwtSecret), requireAdmin, adminRoutes(store));
  app.use("/sub", subscriptionRoutes(store));

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    return res.status(500).json({ message: "服务器内部错误" });
  });

  return app;
}
