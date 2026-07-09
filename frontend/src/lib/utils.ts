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

export function formatExpiresAt(value: string, role?: string) {
  if (role === "admin") return "-"
  return formatDateTime(value)
}

export function statusText(status: string, expiresAt?: string, role?: string) {
  if (role !== "admin" && expiresAt && new Date(expiresAt).getTime() < Date.now()) return "已过期"
  if (status === "disabled") return "停用"
  return "正常"
}
