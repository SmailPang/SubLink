import { Router } from "express";
import { z } from "zod";
import { signToken, verifyPassword, verifyTurnstileToken } from "../auth.js";
import type { Store } from "../db.js";

export function authRoutes(store: Store, jwtSecret: string, turnstileSecret?: string) {
  const router = Router();
  const schema = z.object({ username: z.string().min(1), password: z.string().min(1), turnstileToken: z.string().optional() });

  router.post("/login", async (req, res) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "账号或密码错误" });
    const passedTurnstile = await verifyTurnstileToken(parsed.data.turnstileToken ?? "", turnstileSecret, req.ip);
    if (!passedTurnstile) return res.status(403).json({ message: "人机验证失败，请重试" });

    const user = store.findUserByUsername(parsed.data.username);
    if (!user || !verifyPassword(parsed.data.password, user)) {
      return res.status(401).json({ message: "账号或密码错误" });
    }
    if (user.status === "disabled") return res.status(403).json({ message: "账号已被停用" });

    return res.json({ token: signToken(user, jwtSecret), user: store.publicUser(user) });
  });

  return router;
}
