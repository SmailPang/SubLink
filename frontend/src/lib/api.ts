import type { AccessLogQuery, AdminAuditLog, PaginatedAccessLogs } from "@/types/log";
import type { Announcement, UserAnnouncement } from "@/types/announcement";
import type { SubscriptionData, PublicUser } from "@/types/user";
import type { Upstream } from "@/types/upstream";
import type { DashboardData } from "@/types/dashboard";

const TOKEN_KEY = "sublink_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(url, { ...options, headers });
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    const message = typeof data === "object" && data && "message" in data ? String(data.message) : "操作失败";
    throw new Error(message);
  }
  return data as T;
}

function queryString(input: object) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  const result = params.toString();
  return result ? `?${result}` : "";
}

export const api = {
  async login(username: string, password: string, turnstileToken: string) {
    return request<{ token: string; user: PublicUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password, turnstileToken })
    });
  },
  me() {
    return request<{ user: PublicUser }>("/api/auth/me");
  },
  publicSettings() {
    return request<{ settings: { siteName: string } }>("/api/public/settings");
  },
  subscription() {
    return request<SubscriptionData>("/api/user/subscription");
  },
  resetOwnToken() {
    return request<{ token: string; message: string }>("/api/user/reset-token", { method: "POST" });
  },
  dashboard() {
    return request<DashboardData>("/api/admin/dashboard");
  },
  users() {
    return request<{ items: PublicUser[] }>("/api/admin/users");
  },
  batchUsers(input: { ids: number[]; action: "enable" | "disable" | "delete" | "extend"; days?: number }) {
    return request<{ affected: number; message: string }>("/api/admin/users/batch", { method: "POST", body: JSON.stringify(input) });
  },
  createUser(input: { username: string; password: string; expiresAt?: string; remark?: string }) {
    return request<{ user: PublicUser }>("/api/admin/users", { method: "POST", body: JSON.stringify(input) });
  },
  user(id: number) {
    return request<{ user: PublicUser }>(`/api/admin/users/${id}`);
  },
  updateUser(id: number, input: Partial<{ username: string; expiresAt: string; remark: string; status: "active" | "disabled" }>) {
    return request<{ user: PublicUser }>(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(input) });
  },
  enableUser(id: number) {
    return request<{ user: PublicUser }>(`/api/admin/users/${id}/enable`, { method: "POST" });
  },
  disableUser(id: number) {
    return request<{ user: PublicUser }>(`/api/admin/users/${id}/disable`, { method: "POST" });
  },
  resetUserToken(id: number) {
    return request<{ token: string; message: string }>(`/api/admin/users/${id}/reset-token`, { method: "POST" });
  },
  setUserPassword(id: number, password: string) {
    return request<{ message: string }>(`/api/admin/users/${id}/password`, { method: "POST", body: JSON.stringify({ password }) });
  },
  deleteUser(id: number) {
    return request<{ message: string }>(`/api/admin/users/${id}`, { method: "DELETE" });
  },
  upstreams() {
    return request<{ items: Upstream[] }>("/api/admin/upstreams");
  },
  saveUpstream(client: string, input: { url: string; enabled: boolean }) {
    return request<{ upstream: Upstream; message: string }>(`/api/admin/upstreams/${client}`, { method: "PUT", body: JSON.stringify(input) });
  },
  saveUpstreams(items: Array<{ client: string; url: string; enabled: boolean }>) {
    return request<{ items: Upstream[]; message: string }>("/api/admin/upstreams", { method: "PUT", body: JSON.stringify({ items }) });
  },
  testUpstream(client: string) {
    return request<{ upstream: Upstream; message: string }>(`/api/admin/upstreams/${client}/test`, { method: "POST" });
  },
  checkAllUpstreams() {
    return request<{ items: Upstream[]; message: string }>("/api/admin/upstreams/health-check", { method: "POST" });
  },
  logs(query: AccessLogQuery = {}) {
    return request<PaginatedAccessLogs>(`/api/admin/logs${queryString(query)}`);
  },
  ownLogs(query: AccessLogQuery = {}) {
    return request<PaginatedAccessLogs>(`/api/user/logs${queryString(query)}`);
  },
  cleanupLogs(before: string) {
    return request<{ deleted: number; message: string }>(`/api/admin/logs${queryString({ before })}`, { method: "DELETE" });
  },
  auditLogs() {
    return request<{ items: AdminAuditLog[] }>("/api/admin/audit-logs");
  },
  userAnnouncements() {
    return request<{ items: UserAnnouncement[] }>("/api/user/announcements");
  },
  markAnnouncementRead(id: number) {
    return request<{ announcement: UserAnnouncement; message: string }>(`/api/user/announcements/${id}/read`, { method: "POST" });
  },
  updateOwnProfile(input: { username: string; remark: string }) {
    return request<{ user: PublicUser; message: string }>("/api/user/profile", { method: "PATCH", body: JSON.stringify(input) });
  },
  changeOwnPassword(input: { currentPassword: string; newPassword: string }) {
    return request<{ message: string }>("/api/user/password", { method: "POST", body: JSON.stringify(input) });
  },
  forceChangePassword(input: { newPassword: string }) {
    return request<{ message: string }>("/api/user/force-password", { method: "POST", body: JSON.stringify(input) });
  },
  settings() {
    return request<{ settings: Record<string, string> }>("/api/admin/settings");
  },
  saveSettings(settings: Record<string, string>) {
    return request<{ settings: Record<string, string>; message: string }>("/api/admin/settings", { method: "PUT", body: JSON.stringify(settings) });
  },
  adminAnnouncements() {
    return request<{ items: Announcement[] }>("/api/admin/announcements");
  },
  createAnnouncement(input: { title: string; content: string }) {
    return request<{ announcement: Announcement; message: string }>("/api/admin/announcements", { method: "POST", body: JSON.stringify(input) });
  },
  deleteAnnouncement(id: number) {
    return request<{ message: string }>(`/api/admin/announcements/${id}`, { method: "DELETE" });
  }
};
