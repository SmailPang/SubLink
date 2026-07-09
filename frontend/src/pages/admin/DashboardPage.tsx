import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import type { AccessLog } from "@/types/log";

interface DashboardData { totalUsers: number; activeUsers: number; disabledUsers: number; todayRequests: number; recentLogs: AccessLog[] }

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  useEffect(() => {
    api.dashboard().then(setData).catch((error) => toast.error(error instanceof Error ? error.message : "加载失败"));
  }, []);
  if (!data) return <Skeleton className="h-80" />;
  const metrics = [
    ["用户总数", data.totalUsers],
    ["启用用户数", data.activeUsers],
    ["停用用户数", data.disabledUsers],
    ["今日订阅请求数", data.todayRequests]
  ];
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">仪表盘</h1>
          <p className="text-sm text-muted-foreground">查看用户和订阅访问的最新状态。</p>
        </div>
      </div>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([label, value]) => (
          <Card key={label}>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent className="text-4xl font-semibold tracking-tight">{value}</CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle>最近访问记录</CardTitle></CardHeader>
        <CardContent>
          {data.recentLogs.length === 0 ? <div className="p-8 text-center text-muted-foreground">暂无访问记录</div> : (
            <Table><TableHeader><TableRow><TableHead>用户名</TableHead><TableHead>客户端</TableHead><TableHead>状态</TableHead><TableHead>访问时间</TableHead></TableRow></TableHeader><TableBody>
              {data.recentLogs.map((log) => <TableRow key={log.id}><TableCell>{log.username}</TableCell><TableCell>{log.client}</TableCell><TableCell>{log.status === "success" ? "成功" : "失败"}</TableCell><TableCell>{formatDateTime(log.accessed_at)}</TableCell></TableRow>)}
            </TableBody></Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
