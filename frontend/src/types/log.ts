export interface AccessLog {
  id: number;
  user_id: number | null;
  username: string;
  client: string;
  ip: string;
  user_agent: string;
  ipLocation: string;
  status: "success" | "failed";
  response_time_ms: number;
  accessed_at: string;
}

export interface AccessLogQuery {
  page?: number;
  pageSize?: number;
  username?: string;
  client?: string;
  status?: "success" | "failed" | "";
  keyword?: string;
  from?: string;
  to?: string;
}

export interface PaginatedAccessLogs {
  items: AccessLog[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminAuditLog {
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
