import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { formatBytes, formatDateTime } from "@/lib/utils";
import type { Upstream } from "@/types/upstream";

function usage(value: string) {
  const fields = Object.fromEntries(value.split(";").map((part) => part.trim().split("=")).filter((item) => item.length === 2));
  const used = Number(fields.upload || 0) + Number(fields.download || 0);
  const total = Number(fields.total || 0);
  return total ? `${formatBytes(used)} / ${formatBytes(total)}` : "暂无流量信息";
}

export function UserUpstreamsPage() {
  const [items, setItems] = useState<Upstream[]>([]);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => setItems((await api.upstreams()).items);
  useEffect(() => { void load().catch((e) => toast.error(e.message)); }, []);

  async function add() {
    setBusy(true);
    try { await api.createUpstream({ name, url, enabled: true }); setName(""); setUrl(""); await load(); toast.success("上游已添加，系统会自动识别订阅内容"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "添加失败"); } finally { setBusy(false); }
  }
  async function test(item: Upstream) { try { await api.testUpstream(item.client); await load(); toast.success("检测成功，流量信息已更新"); } catch (e) { toast.error(e instanceof Error ? e.message : "检测失败"); } }
  async function remove(item: Upstream) { if (!confirm(`确定删除“${item.name}”吗？已分配用户将改用默认上游。`)) return; await api.deleteUpstream(item.id); await load(); }

  return <div className="space-y-6">
    <Card><CardHeader><CardTitle>添加上游订阅源</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-[220px_1fr_auto] md:items-end"><div className="space-y-2"><Label>上游名称</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：机场 A" /></div><div className="space-y-2"><Label>Clash 或其他订阅链接</Label><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." /></div><Button disabled={busy || !name || !url} onClick={add}>添加上游</Button><p className="text-sm text-muted-foreground md:col-span-3">每个上游只需添加一次。用户访问 Clash、SingBox、Surge 等专用链接时，系统会按客户端自动转换。</p></CardContent></Card>
    <Card><CardHeader><CardTitle>上游与流量使用情况</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>名称</TableHead><TableHead>健康状态</TableHead><TableHead>流量</TableHead><TableHead>延迟</TableHead><TableHead>最后刷新</TableHead><TableHead>操作</TableHead></TableRow></TableHeader><TableBody>{items.map((item) => <TableRow key={item.id}><TableCell><div className="font-medium">{item.name}</div><div className="max-w-md truncate text-xs text-muted-foreground" title={item.url}>{item.url}</div></TableCell><TableCell><Badge variant={item.healthStatus === "healthy" ? "secondary" : item.healthStatus === "unhealthy" ? "destructive" : "outline"}>{item.healthStatus === "healthy" ? "正常" : item.healthStatus === "unhealthy" ? "异常" : "未检测"}</Badge></TableCell><TableCell>{usage(item.subscriptionUserinfo)}</TableCell><TableCell>{item.lastLatencyMs == null ? "—" : `${item.lastLatencyMs} ms`}</TableCell><TableCell>{formatDateTime(item.lastCheckedAt)}</TableCell><TableCell className="space-x-2"><Button size="sm" variant="outline" onClick={() => test(item)}>检测并刷新</Button><Button size="sm" variant="destructive" onClick={() => remove(item)}>删除</Button></TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
  </div>;
}
