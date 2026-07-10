export interface SubscriptionUsage {
  upload: number;
  download: number;
  used: number;
  total: number;
  remaining: number;
  expire: number | null;
  updatedAt: string | null;
}

export function parseSubscriptionUserinfo(value?: string | null, updatedAt?: string | null): SubscriptionUsage | null {
  if (!value) return null;
  const fields = Object.fromEntries(value.split(";").map((part) => part.trim().split("=")).filter((item) => item.length === 2));
  const upload = Number(fields.upload ?? 0);
  const download = Number(fields.download ?? 0);
  const total = Number(fields.total ?? 0);
  const expire = fields.expire ? Number(fields.expire) : null;
  if (![upload, download, total].every(Number.isFinite) || total <= 0) return null;
  const used = upload + download;
  return { upload, download, used, total, remaining: Math.max(0, total - used), expire: expire && Number.isFinite(expire) ? expire : null, updatedAt: updatedAt ?? null };
}
