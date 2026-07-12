import type { AccessLog } from "./log";
import type { Upstream } from "./upstream";

export interface DashboardData {
  totalUsers: number;
  activeUsers: number;
  disabledUsers: number;
  todayRequests: number;
  todaySuccess: number;
  todayFailed: number;
  averageResponseMs: number;
  activeToday: number;
  expiringSoon: number;
  upstreamSummary: Array<{ status: string; count: number }>;
  upstreams: Upstream[];
  dailyTrend: Array<{ date: string; requests: number; success: number }>;
  clientStats: Array<{ client: string; count: number }>;
  recentLogs: AccessLog[];
}
