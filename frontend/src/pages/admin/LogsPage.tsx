import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { formatDateTime, formatClientName } from "@/lib/utils";
import type { AccessLog } from "@/types/log";

export function LogsPage() {
  const location = useLocation();
  const ownOnly = location.pathname.startsWith("/user/");
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    const request = ownOnly ? api.ownLogs() : api.logs();
    request.then((result) => setLogs(result.items)).catch((error) => toast.error(error instanceof Error ? error.message : "加载失败")).finally(() => setLoading(false));
  }, [ownOnly]);
  return (
    <Card>
      <CardHeader><CardTitle>访问日志</CardTitle></CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-80" /> : logs.length === 0 ? <div className="p-8 text-center text-muted-foreground">暂无访问日志</div> : (
          <Table>
            <TableHeader><TableRow>{!ownOnly && <TableHead>用户名</TableHead>}<TableHead>客户端</TableHead><TableHead>IP</TableHead><TableHead>地域</TableHead><TableHead>User-Agent</TableHead><TableHead>状态</TableHead><TableHead>响应时间</TableHead><TableHead>访问时间</TableHead></TableRow></TableHeader>
            <TableBody>
              {logs.map((log) => <TableRow key={log.id}>{!ownOnly && <TableCell>{log.username}</TableCell>}<TableCell>{formatClientName(log.client)}</TableCell><TableCell>{log.ip}</TableCell><TableCell>{log.ipLocation || "未知"}</TableCell><TableCell className="max-w-xs truncate">{log.user_agent}</TableCell><TableCell><Badge variant={log.status === "success" ? "secondary" : "destructive"}>{log.status === "success" ? "成功" : "失败"}</Badge></TableCell><TableCell>{log.response_time_ms} 毫秒</TableCell><TableCell>{formatDateTime(log.accessed_at)}</TableCell></TableRow>)}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
