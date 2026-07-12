import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDateTime(value?: string | null) {
  if (!value) return "暂无记录"
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

export function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

export function formatExpiresAt(value: string, role?: string) {
  if (role === "admin") return "-"
  return formatDateTime(value)
}

export function statusText(status: string, expiresAt?: string, role?: string) {
  if (role !== "admin" && expiresAt && new Date(expiresAt).getTime() < Date.now()) return "已过期"
  if (status === "disabled") return "停用"
  return "正常"
}

const clientNames: Record<string, string> = {
  default: "默认",
  clash: "Clash",
  clashverge: "Clash Verge",
  clashmetaforandroid: "Clash Meta for Android",
  mihomo: "Mihomo",
  shadowrocket: "Shadowrocket",
  singbox: "SingBox",
  surge: "Surge",
  loon: "Loon",
  stash: "Stash",
  quantumultx: "Quantumult X",
  egern: "Egern",
  v2ray: "V2Ray"
}

export function formatClientName(client?: string | null) {
  if (!client) return "暂无记录"
  return clientNames[client] ?? client
}
