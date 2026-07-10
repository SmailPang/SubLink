import type { Request } from "express";
import type { AccessLogQuery } from "./types.js";

function one(value: unknown) {
  return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
}

export function accessLogQuery(req: Request): AccessLogQuery {
  const status = one(req.query.status);
  return {
    page: Number(one(req.query.page)) || 1,
    pageSize: Number(one(req.query.pageSize)) || 20,
    username: one(req.query.username) || undefined,
    client: one(req.query.client) || undefined,
    status: status === "success" || status === "failed" ? status : undefined,
    keyword: one(req.query.keyword) || undefined,
    from: one(req.query.from) || undefined,
    to: one(req.query.to) || undefined
  };
}
