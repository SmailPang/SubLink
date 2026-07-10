import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import type { Upstream } from "@/types/upstream";

const names: Record<string, string> = { default: "默认", clash: "Clash", mihomo: "Mihomo", shadowrocket: "Shadowrocket", singbox: "SingBox", surge: "Surge", loon: "Loon", stash: "Stash", quantumultx: "Quantumult X", egern: "Egern", v2ray: "V2Ray" };

export function UserUpstreamsPage() {
  const [items, setItems] = useState<Upstream[]>([]);
  const [savedItems, setSavedItems] = useState<Upstream[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const result = await api.upstreams();
      setItems(result.items);
      setSavedItems(result.items);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const changed = JSON.stringify(items.map(({ client, url, enabled }) => ({ client, url, enabled }))) !== JSON.stringify(savedItems.map(({ client, url, enabled }) => ({ client, url, enabled })));

  async function saveAll() {
    setSaving(true);
    try {
      const result = await api.saveUpstreams(items.map((item) => ({ client: item.client, url: item.url, enabled: item.enabled })));
      setItems(result.items);
      setSavedItems(result.items);
      toast.success("保存成功");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function test(item: Upstream) {
    try {
      const result = await api.testUpstream(item.client);
      setItems((old) => old.map((row) => row.client === item.client ? result.upstream : row));
      setSavedItems((old) => old.map((row) => row.client === item.client ? result.upstream : row));
      toast.success("测试成功");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "上游链接不可用");
    }
  }

  async function checkAll() {
    setChecking(true);
    try {
      const result = await api.checkAllUpstreams();
      const checked = new Map(result.items.map((item) => [item.client, item]));
      setItems((old) => old.map((item) => checked.get(item.client) ?? item));
      setSavedItems((old) => old.map((item) => checked.get(item.client) ?? item));
      toast.success(result.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "检测失败");
    } finally {
      setChecking(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>全局上游配置</CardTitle>
        <CardAction>
          <div className="flex gap-2"><Button variant="outline" onClick={checkAll} disabled={loading || checking}>{checking ? "检测中" : "检测全部"}</Button><Button onClick={saveAll} disabled={loading || saving || !changed}>{saving ? "保存中" : changed ? "保存配置" : "已保存"}</Button></div>
        </CardAction>
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-80" /> : items.length === 0 ? <div className="p-8 text-center text-muted-foreground">暂无上游配置</div> : (
          <Table>
            <TableHeader><TableRow><TableHead>客户端</TableHead><TableHead>上游订阅链接</TableHead><TableHead>启用状态</TableHead><TableHead>健康状态</TableHead><TableHead>延迟</TableHead><TableHead>最后检测</TableHead><TableHead>操作</TableHead></TableRow></TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.client}>
                  <TableCell>{names[item.client] || item.client}</TableCell>
                  <TableCell><Input value={item.url} onChange={(event) => setItems((old) => old.map((row) => row.client === item.client ? { ...row, url: event.target.value } : row))} placeholder="请输入上游订阅链接" /></TableCell>
                  <TableCell><Switch checked={item.enabled} onCheckedChange={(checked) => setItems((old) => old.map((row) => row.client === item.client ? { ...row, enabled: checked } : row))} /></TableCell>
                  <TableCell><Badge variant={item.healthStatus === "healthy" ? "secondary" : item.healthStatus === "unhealthy" ? "destructive" : "outline"} title={item.lastError}>{item.healthStatus === "healthy" ? "正常" : item.healthStatus === "unhealthy" ? "异常" : "未检测"}</Badge></TableCell>
                  <TableCell>{item.lastLatencyMs == null ? "—" : `${item.lastLatencyMs} ms`}</TableCell>
                  <TableCell>{formatDateTime(item.lastCheckedAt)}</TableCell>
                  <TableCell><Button size="sm" variant="outline" onClick={() => test(item)}>测试上游</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
