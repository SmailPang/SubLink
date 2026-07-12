import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatBytes, formatDateTime, formatClientName } from "@/lib/utils";
import type { DashboardData } from "@/types/dashboard";

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  useEffect(() => {
    api.dashboard().then(setData).catch((error) => toast.error(error instanceof Error ? error.message : "加载失败"));
  }, []);
  if (!data) return <Skeleton className="h-80" />;

  const successRate = data.todayRequests ? Math.round(data.todaySuccess / data.todayRequests * 100) : 0;
  const healthy = data.upstreamSummary.find((item) => item.status === "healthy")?.count ?? 0;
  const unhealthy = data.upstreamSummary.find((item) => item.status === "unhealthy")?.count ?? 0;
  const maxTrend = Math.max(1, ...data.dailyTrend.map((item) => item.requests));
  const maxClient = Math.max(1, ...data.clientStats.map((item) => item.count));
  const metrics = [
    ["用户总数", data.totalUsers], ["启用用户", data.activeUsers], ["今日活跃用户", data.activeToday], ["7天内到期", data.expiringSoon],
    ["今日请求", data.todayRequests], ["今日成功率", `${successRate}%`], ["平均响应", `${data.averageResponseMs} ms`], ["异常上游", unhealthy]
  ];

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-semibold tracking-tight">仪表盘</h1><p className="text-sm text-muted-foreground">查看用户、请求和上游的运行状态。</p></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([label, value]) => <Card key={label}><CardHeader><CardTitle className="text-sm text-muted-foreground">{label}</CardTitle></CardHeader><CardContent className="text-3xl font-semibold tracking-tight">{value}</CardContent></Card>)}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card><CardHeader><CardTitle>最近 7 天请求趋势</CardTitle></CardHeader><CardContent className="space-y-3">{data.dailyTrend.length === 0 ? <div className="text-sm text-muted-foreground">暂无趋势数据</div> : data.dailyTrend.map((item) => <div key={item.date} className="grid grid-cols-[90px_1fr_56px] items-center gap-3 text-sm"><span>{item.date.slice(5)}</span><div className="h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-foreground" style={{ width: `${item.requests / maxTrend * 100}%` }} /></div><span className="text-right">{item.requests}</span></div>)}</CardContent></Card>
        <Card><CardHeader><CardTitle>客户端分布</CardTitle></CardHeader><CardContent className="space-y-3">{data.clientStats.length === 0 ? <div className="text-sm text-muted-foreground">暂无客户端数据</div> : data.clientStats.map((item) => <div key={item.client} className="grid grid-cols-[120px_1fr_56px] items-center gap-3 text-sm"><span>{formatClientName(item.client)}</span><div className="h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-foreground/70" style={{ width: `${item.count / maxClient * 100}%` }} /></div><span className="text-right">{item.count}</span></div>)}</CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>上游健康概览</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-3"><Badge variant="secondary">正常 {healthy}</Badge><Badge variant={unhealthy ? "destructive" : "outline"}>异常 {unhealthy}</Badge><Badge variant="outline">未检测 {data.upstreamSummary.find((item) => item.status === "unknown")?.count ?? 0}</Badge></CardContent></Card>
      <Card><CardHeader><CardTitle>各上游流量使用情况</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">{data.upstreams?.map((item) => { const values = Object.fromEntries(item.subscriptionUserinfo.split(";").map((value) => value.trim().split("="))); const used = Number(values.upload || 0) + Number(values.download || 0); const total = Number(values.total || 0); return <div key={item.id} className="rounded-lg border p-4"><div className="flex items-center justify-between"><span className="font-medium">{item.name}</span><Badge variant={item.healthStatus === "healthy" ? "secondary" : "outline"}>{item.healthStatus === "healthy" ? "正常" : "未就绪"}</Badge></div><div className="mt-2 text-sm text-muted-foreground">{total ? `已用 ${formatBytes(used)} / 总计 ${formatBytes(total)}` : "上游暂未返回流量信息"}</div></div>; })}</CardContent></Card>
      <Card>
        <CardHeader><CardTitle>最近访问记录</CardTitle></CardHeader>
        <CardContent>{data.recentLogs.length === 0 ? <div className="p-8 text-center text-muted-foreground">暂无访问记录</div> : <Table><TableHeader><TableRow><TableHead>用户名</TableHead><TableHead>客户端</TableHead><TableHead>状态</TableHead><TableHead>响应时间</TableHead><TableHead>访问时间</TableHead></TableRow></TableHeader><TableBody>{data.recentLogs.map((log) => <TableRow key={log.id}><TableCell>{log.username}</TableCell><TableCell>{formatClientName(log.client)}</TableCell><TableCell><Badge variant={log.status === "success" ? "secondary" : "destructive"}>{log.status === "success" ? "成功" : "失败"}</Badge></TableCell><TableCell>{log.response_time_ms} ms</TableCell><TableCell>{formatDateTime(log.accessed_at)}</TableCell></TableRow>)}</TableBody></Table>}</CardContent>
      </Card>
    </div>
  );
}
