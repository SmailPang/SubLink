import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { cn, formatDateTime } from "@/lib/utils";
import type { Announcement } from "@/types/announcement";

export function AnnouncementsManagePage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [removing, setRemoving] = useState<Announcement | null>(null);
  const [form, setForm] = useState({ title: "", content: "" });

  async function load() {
    setLoading(true);
    try {
      setItems((await api.adminAnnouncements()).items);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function create() {
    if (!form.title.trim() || !form.content.trim()) {
      toast.error("请填写公告标题和内容");
      return;
    }
    try {
      await api.createAnnouncement({ title: form.title.trim(), content: form.content.trim() });
      toast.success("创建成功");
      setCreateOpen(false);
      setForm({ title: "", content: "" });
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建失败");
    }
  }

  async function remove() {
    if (!removing) return;
    try {
      await api.deleteAnnouncement(removing.id);
      toast.success("删除成功");
      setRemoving(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">公告管理</h1>
        <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />新增公告</Button>
      </div>
      <Card>
        <CardHeader><CardTitle>公告列表</CardTitle></CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-72" /> : items.length === 0 ? <div className="p-8 text-center text-muted-foreground">暂无公告</div> : (
            <Table>
              <TableHeader><TableRow><TableHead>标题</TableHead><TableHead>内容</TableHead><TableHead>发布时间</TableHead><TableHead>操作</TableHead></TableRow></TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.title}</TableCell>
                    <TableCell className="max-w-xl truncate">{item.content}</TableCell>
                    <TableCell>{formatDateTime(item.createdAt)}</TableCell>
                    <TableCell><Button variant="destructive" size="sm" onClick={() => setRemoving(item)}><Trash2 className="h-4 w-4" />删除</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>新增公告</DialogTitle><DialogDescription>发布后所有用户都可以在公告中心查看。</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2"><Label>标题</Label><Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></div>
            <div className="space-y-2">
              <Label>内容</Label>
              <textarea
                className={cn("min-h-32 w-full rounded-2xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30")}
                value={form.content}
                onChange={(event) => setForm({ ...form, content: event.target.value })}
              />
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button><Button onClick={create}>发布</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(removing)} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>删除公告</DialogTitle><DialogDescription>确认删除公告“{removing?.title}”吗？删除后用户侧将不再显示。</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setRemoving(null)}>取消</Button><Button variant="destructive" onClick={remove}>删除</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
