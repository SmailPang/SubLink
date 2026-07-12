import type { Request } from "express";

export type UserRole = "admin" | "user";
export type UserStatus = "active" | "disabled";
export type AccessStatus = "success" | "failed";
export type UpstreamHealthStatus = "unknown" | "healthy" | "unhealthy";

export interface UserRecord {
  id: number;
  username: string;
  password_hash: string;
  role: UserRole;
  status: UserStatus;
  expires_at: string;
  remark: string;
  token: string;
  last_client: string | null;
  last_access_at: string | null;
  must_change_password: 0 | 1;
  created_at: string;
  updated_at: string;
}

export interface PublicUser {
  id: number;
  username: string;
  role: UserRole;
  status: UserStatus;
  expiresAt: string;
  remark: string;
  token: string;
  lastClient: string | null;
  lastAccessAt: string | null;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpstreamRecord {
  id: number;
  client: string;
  url: string;
  enabled: 0 | 1;
  health_status: UpstreamHealthStatus;
  last_checked_at: string | null;
  last_latency_ms: number | null;
  last_error: string;
  subscription_userinfo: string;
  created_at: string;
  updated_at: string;
}

export interface Upstream {
  id: number;
  client: string;
  url: string;
  enabled: boolean;
  healthStatus: UpstreamHealthStatus;
  lastCheckedAt: string | null;
  lastLatencyMs: number | null;
  lastError: string;
  subscriptionUserinfo: string;
  created_at: string;
  updated_at: string;
}

export interface AnnouncementRecord {
  id: number;
  title: string;
  content: string;
  created_at: string;
}

export interface Announcement {
  id: number;
  title: string;
  content: string;
  createdAt: string;
}

export interface UserAnnouncement extends Announcement {
  isRead: boolean;
  readAt: string | null;
}

export interface AccessLogRecord {
  id: number;
  user_id: number | null;
  username: string;
  client: string;
  ip: string;
  user_agent: string;
  status: AccessStatus;
  response_time_ms: number;
  accessed_at: string;
}

export interface AccessLogWithLocation extends AccessLogRecord {
  ipLocation: string;
}

export interface AccessLogQuery {
  page?: number;
  pageSize?: number;
  username?: string;
  client?: string;
  status?: AccessStatus;
  keyword?: string;
  from?: string;
  to?: string;
}

export interface PaginatedAccessLogs {
  items: AccessLogRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminAuditLogRecord {
  id: number;
  admin_user_id: number | null;
  admin_username: string;
  action: string;
  target_type: string;
  target_id: string;
  details: string;
  ip: string;
  user_agent: string;
  created_at: string;
}

export interface AppConfig {
  dbPath?: string;
  jwtSecret?: string;
  turnstileSecret?: string;
}

export interface AuthPayload {
  id: number;
  username: string;
  role: UserRole;
}

export interface AuthedRequest extends Request {
  user?: AuthPayload;
}
