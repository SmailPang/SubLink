import type { AccessLog } from "./log";

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
  dailyTrend: Array<{ date: string; requests: number; success: number }>;
  clientStats: Array<{ client: string; count: number }>;
  recentLogs: AccessLog[];
}
