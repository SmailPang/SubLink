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
