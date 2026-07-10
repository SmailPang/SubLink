import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Download, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { formatDateTime, formatClientName } from "@/lib/utils";
import type { AccessLog, AccessLogQuery } from "@/types/log";

const emptyFilters: AccessLogQuery = { username: "", client: "", status: "", keyword: "", from: "", to: "" };

export function LogsPage() {
  const location = useLocation();
  const ownOnly = location.pathname.startsWith("/user/");
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<AccessLogQuery>(emptyFilters);
  const [applied, setApplied] = useState<AccessLogQuery>(emptyFilters);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  useEffect(() => {
    setLoading(true);
    const query = { ...applied, page, pageSize, from: applied.from ? `${applied.from}T00:00:00.000Z` : undefined, to: applied.to ? `${applied.to}T23:59:59.999Z` : undefined };
    const request = ownOnly ? api.ownLogs(query) : api.logs(query);
    request.then((result) => {
      setLogs(result.items);
      setTotal(result.total);
    }).catch((error) => toast.error(error instanceof Error ? error.message : "加载失败")).finally(() => setLoading(false));
  }, [ownOnly, page, applied]);

  function search() {
    setPage(1);
    setApplied({ ...filters });
  }

  function exportCsv() {
    const header = ["用户名", "客户端", "IP", "地域", "User-Agent", "状态", "响应时间(ms)", "访问时间"];
    const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows = logs.map((log) => [log.username, formatClientName(log.client), log.ip, log.ipLocation, log.user_agent, log.status, log.response_time_ms, log.accessed_at]);
    const blob = new Blob(["\ufeff", [header, ...rows].map((row) => row.map(escape).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `访问日志-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function cleanup() {
    if (!window.confirm("确认清理 30 天以前的访问日志吗？此操作不可恢复。")) return;
    try {
      const before = new Date(Date.now() - 30 * 86400000).toISOString();
      const result = await api.cleanupLogs(before);
      toast.success(result.message);
      search();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "清理失败");
    }
  }

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>访问日志</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!logs.length}><Download />导出当前页</Button>
            {!ownOnly && <Button variant="outline" size="sm" onClick={cleanup}><Trash2 />清理30天前日志</Button>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-7">
          {!ownOnly && <Input placeholder="用户名" value={filters.username ?? ""} onChange={(event) => setFilters({ ...filters, username: event.target.value })} />}
          <Input placeholder="客户端" value={filters.client ?? ""} onChange={(event) => setFilters({ ...filters, client: event.target.value })} />
          <select className="h-9 rounded-2xl border bg-background px-3 text-sm" value={filters.status ?? ""} onChange={(event) => setFilters({ ...filters, status: event.target.value as AccessLogQuery["status"] })}>
            <option value="">全部状态</option><option value="success">成功</option><option value="failed">失败</option>
          </select>
          <Input placeholder="IP 或请求头关键词" value={filters.keyword ?? ""} onChange={(event) => setFilters({ ...filters, keyword: event.target.value })} />
          <Input type="date" value={filters.from ?? ""} onChange={(event) => setFilters({ ...filters, from: event.target.value })} />
          <Input type="date" value={filters.to ?? ""} onChange={(event) => setFilters({ ...filters, to: event.target.value })} />
          <Button onClick={search}><Search />查询</Button>
        </div>
        {loading ? <Skeleton className="h-80" /> : logs.length === 0 ? <div className="p-8 text-center text-muted-foreground">暂无访问日志</div> : (
          <Table>
            <TableHeader><TableRow>{!ownOnly && <TableHead>用户名</TableHead>}<TableHead>客户端</TableHead><TableHead>IP</TableHead><TableHead>地域</TableHead><TableHead>User-Agent</TableHead><TableHead>状态</TableHead><TableHead>响应时间</TableHead><TableHead>访问时间</TableHead></TableRow></TableHeader>
            <TableBody>
              {logs.map((log) => <TableRow key={log.id}>{!ownOnly && <TableCell>{log.username}</TableCell>}<TableCell>{formatClientName(log.client)}</TableCell><TableCell>{log.ip}</TableCell><TableCell>{log.ipLocation || "未知"}</TableCell><TableCell className="max-w-xs cursor-help truncate" title={log.user_agent}>{log.user_agent}</TableCell><TableCell><Badge variant={log.status === "success" ? "secondary" : "destructive"}>{log.status === "success" ? "成功" : "失败"}</Badge></TableCell><TableCell>{log.response_time_ms} 毫秒</TableCell><TableCell>{formatDateTime(log.accessed_at)}</TableCell></TableRow>)}
            </TableBody>
          </Table>
        )}
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>共 {total} 条，第 {page}/{pages} 页</span>
          <div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>上一页</Button><Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>下一页</Button></div>
        </div>
      </CardContent>
    </Card>
  );
}
