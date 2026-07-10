import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import type { AdminAuditLog } from "@/types/log";

const actionNames: Record<string, string> = {
  "user.create": "创建用户", "user.update": "修改用户", "user.enable": "启用用户", "user.disable": "停用用户",
  "user.delete": "删除用户", "user.reset_token": "重置 Token", "user.password": "修改密码",
  "user.batch.enable": "批量启用", "user.batch.disable": "批量停用", "user.batch.delete": "批量删除", "user.batch.extend": "批量续期",
  "upstream.update": "修改上游", "upstream.save_all": "保存全部上游", "upstream.health_check": "检测上游", "upstream.health_check_all": "检测全部上游", "upstream.refresh_usage": "刷新流量",
  "announcement.create": "创建公告", "announcement.delete": "删除公告", "settings.update": "修改系统设置", "access_log.cleanup": "清理访问日志"
};

export function AuditLogsPage() {
  const [items, setItems] = useState<AdminAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.auditLogs().then((result) => setItems(result.items)).catch((error) => toast.error(error instanceof Error ? error.message : "加载失败")).finally(() => setLoading(false));
  }, []);

  return (
    <Card>
      <CardHeader><CardTitle>管理员操作日志</CardTitle></CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-80" /> : items.length === 0 ? <div className="p-8 text-center text-muted-foreground">暂无管理员操作记录</div> : (
          <Table>
            <TableHeader><TableRow><TableHead>管理员</TableHead><TableHead>操作</TableHead><TableHead>目标</TableHead><TableHead>详情</TableHead><TableHead>IP</TableHead><TableHead>请求头</TableHead><TableHead>时间</TableHead></TableRow></TableHeader>
            <TableBody>{items.map((item) => <TableRow key={item.id}><TableCell>{item.admin_username}</TableCell><TableCell>{actionNames[item.action] ?? item.action}</TableCell><TableCell>{item.target_type}{item.target_id ? ` #${item.target_id}` : ""}</TableCell><TableCell className="max-w-xs truncate" title={item.details}>{item.details || "—"}</TableCell><TableCell>{item.ip || "—"}</TableCell><TableCell className="max-w-xs cursor-help truncate" title={item.user_agent}>{item.user_agent || "—"}</TableCell><TableCell>{formatDateTime(item.created_at)}</TableCell></TableRow>)}</TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
