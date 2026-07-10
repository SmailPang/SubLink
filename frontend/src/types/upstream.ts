export interface Upstream {
  id: number;
  client: string;
  url: string;
  enabled: boolean;
  healthStatus: "unknown" | "healthy" | "unhealthy";
  lastCheckedAt: string | null;
  lastLatencyMs: number | null;
  lastError: string;
  subscriptionUserinfo: string;
  created_at: string;
  updated_at: string;
}
