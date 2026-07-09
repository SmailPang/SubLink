import bcrypt from "bcryptjs";
import type { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import type { Store } from "./db.js";
import type { AuthedRequest, AuthPayload, UserRecord } from "./types.js";

export function verifyPassword(password: string, user: UserRecord) {
  return bcrypt.compareSync(password, user.password_hash);
}

export function signToken(user: UserRecord, secret: string) {
  const payload: AuthPayload = { id: user.id, username: user.username, role: user.role };
  return jwt.sign(payload, secret, { expiresIn: "7d" });
}

export async function verifyTurnstileToken(token: string, secret?: string, remoteIp?: string) {
  if (!secret) return true;
  if (!token) return false;

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);

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

export function requireAuth(store: Store, secret: string) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    const raw = header?.startsWith("Bearer ") ? header.slice(7) : "";
    if (!raw) return res.status(401).json({ message: "请先登录" });

    try {
      const payload = jwt.verify(raw, secret) as AuthPayload;
      const user = store.findUserById(payload.id);
      if (!user) return res.status(401).json({ message: "请先登录" });
      if (user.status === "disabled") return res.status(403).json({ message: "账号已被停用" });
      req.user = payload;
      return next();
    } catch {
      return res.status(401).json({ message: "请先登录" });
    }
  };
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== "admin") return res.status(403).json({ message: "没有权限" });
  return next();
}
