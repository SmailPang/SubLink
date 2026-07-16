import bcrypt from "bcryptjs";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { Store } from "./db.js";
import type { AuthedRequest, AuthPayload, UserRecord } from "./types.js";

export function verifyPassword(password: string, user: UserRecord) {
  return bcrypt.compareSync(password, user.password_hash);
}

export function signToken(user: UserRecord, secret: string) {
  const payload: AuthPayload = { id: user.id, username: user.username, role: user.role, authVersion: user.auth_version };
  return jwt.sign(payload, secret, { expiresIn: "7d" });
}

export async function verifyTurnstileToken(token: string, secret?: string, remoteIp?: string) {
  if (!secret) return false;
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

export const SESSION_COOKIE = "sublink_session";

function parseCookies(header?: string) {
  return Object.fromEntries((header ?? "").split(";").map((item) => item.trim()).filter(Boolean).map((item) => {
    const separator = item.indexOf("=");
    return separator < 0 ? [item, ""] : [item.slice(0, separator), decodeURIComponent(item.slice(separator + 1))];
  }));
}

function isSecureRequest(req: Request) {
  return req.secure || req.headers["x-forwarded-proto"] === "https";
}

export function setSessionCookie(req: Request, res: Response, value: string) {
  res.cookie(SESSION_COOKIE, value, {
    httpOnly: true,
    secure: isSecureRequest(req),
    sameSite: "strict",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

export function clearSessionCookie(req: Request, res: Response) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: isSecureRequest(req), sameSite: "strict", path: "/" });
}

function sameOrigin(req: Request) {
  const origin = req.headers.origin;
  if (!origin) return true;
  return origin === `${req.protocol}://${req.get("host")}`;
}

export function requireAuth(store: Store, secret: string) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    const bearer = header?.startsWith("Bearer ") ? header.slice(7) : "";
    const cookie = parseCookies(req.headers.cookie)[SESSION_COOKIE] ?? "";
    const raw = bearer || cookie;
    if (!raw) return res.status(401).json({ message: "请先登录" });

    try {
      const payload = jwt.verify(raw, secret) as AuthPayload;
      const user = store.findUserById(payload.id);
      if (!user) return res.status(401).json({ message: "请先登录" });
      if (payload.authVersion !== user.auth_version) return res.status(401).json({ message: "登录状态已失效，请重新登录" });
      if (user.status === "disabled") return res.status(403).json({ message: "账号已被停用" });
      if (!bearer && !["GET", "HEAD", "OPTIONS"].includes(req.method) && !sameOrigin(req)) {
        return res.status(403).json({ message: "请求来源校验失败" });
      }
      req.authSource = bearer ? "bearer" : "cookie";
      req.user = { id: user.id, username: user.username, role: user.role, authVersion: user.auth_version };
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
