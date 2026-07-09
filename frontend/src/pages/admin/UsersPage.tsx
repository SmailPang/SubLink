import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Edit, KeyRound, Link2, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateTimeInput } from "@/components/ui/date-time-input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { defaultExpiresAt } from "@/lib/datetime";
import { formatDateTime, statusText } from "@/lib/utils";
import type { PublicUser } from "@/types/user";

export function UsersPage() {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<{ action: "disable" | "reset" | "delete"; user: PublicUser } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ username: "", password: "", expiresAt: defaultExpiresAt(), remark: "" });
  const [editingUser, setEditingUser] = useState<PublicUser | null>(null);
  const [passwordUser, setPasswordUser] = useState<PublicUser | null>(null);
  const [passwordForm, setPasswordForm] = useState({ password: "", confirmPassword: "" });

  async function load() {
    setLoading(true);
    try {
      setUsers((await api.users()).items);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function runConfirm() {
    if (!confirm) return;
    try {
      if (confirm.action === "disable") await api.disableUser(confirm.user.id);
      if (confirm.action === "reset") await api.resetUserToken(confirm.user.id);
      if (confirm.action === "delete") await api.deleteUser(confirm.user.id);
      toast.success(confirm.action === "delete" ? "删除成功" : "操作成功");
      setConfirm(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失败");
    }
  }

  async function createUser() {
    try {
      await api.createUser(form);
      toast.success("创建成功");
      setCreateOpen(false);
      setForm({ username: "", password: "", expiresAt: defaultExpiresAt(), remark: "" });
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失败");
    }
  }

  async function enableUser(user: PublicUser) {
    try {
      await api.enableUser(user.id);
      toast.success("操作成功");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失败");
    }
  }

  function openEdit(user: PublicUser) {
    setEditingUser({ ...user });
  }

  async function saveEdit() {
    if (!editingUser) return;
    try {
      await api.updateUser(editingUser.id, {
        username: editingUser.username,
        expiresAt: editingUser.expiresAt,
        remark: editingUser.remark,
        status: editingUser.status
      });
      toast.success("保存成功");
      setEditingUser(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    }
  }

  function openPassword(user: PublicUser) {
    setPasswordUser(user);
    setPasswordForm({ password: "", confirmPassword: "" });
  }

  async function savePassword() {
    if (!passwordUser) return;
    if (passwordForm.password !== passwordForm.confirmPassword) {
      toast.error("两次输入的新密码不一致");
      return;
    }
    try {
      await api.setUserPassword(passwordUser.id, passwordForm.password);
      toast.success("保存成功");
      setPasswordUser(null);
      setPasswordForm({ password: "", confirmPassword: "" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">用户管理</h1>
        <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />创建用户</Button>
      </div>
      <Card>
        <CardHeader><CardTitle>用户列表</CardTitle></CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-72" /> : users.length === 0 ? <div className="p-8 text-center text-muted-foreground">暂无用户数据</div> : (
            <Table>
              <TableHeader><TableRow><TableHead>用户名</TableHead><TableHead>状态</TableHead><TableHead>到期时间</TableHead><TableHead>备注</TableHead><TableHead>最近访问时间</TableHead><TableHead>操作</TableHead></TableRow></TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>{user.username}</TableCell>
                    <TableCell><Badge variant={user.status === "active" ? "secondary" : "destructive"}>{statusText(user.status, user.expiresAt)}</Badge></TableCell>
                    <TableCell>{formatDateTime(user.expiresAt)}</TableCell>
                    <TableCell>{user.remark || "暂无备注"}</TableCell>
                    <TableCell>{formatDateTime(user.lastAccessAt)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(user)}><Edit className="h-4 w-4" />编辑</Button>
                        <Button variant="outline" size="sm" onClick={() => openPassword(user)}><KeyRound className="h-4 w-4" />改密码</Button>
                        {user.status === "active" ? <Button variant="outline" size="sm" onClick={() => setConfirm({ action: "disable", user })}>停用</Button> : <Button variant="outline" size="sm" onClick={() => enableUser(user)}>启用</Button>}
                        <Button variant="outline" size="sm" onClick={() => setConfirm({ action: "reset", user })}><RotateCcw className="h-4 w-4" />重置 Token</Button>
                        <Button asChild variant="outline" size="sm"><Link to="/admin/upstreams"><Link2 className="h-4 w-4" />配置上游</Link></Button>
                        <Button variant="destructive" size="sm" onClick={() => setConfirm({ action: "delete", user })}><Trash2 className="h-4 w-4" />删除</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Dialog open={Boolean(confirm)} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>确认操作</DialogTitle><DialogDescription>{confirm?.action === "reset" ? "确认重置该用户的 Token 吗？重置后旧订阅链接将立即失效。" : confirm?.action === "delete" ? "确认删除该用户吗？删除后相关上游配置也会被移除。" : "确认停用该用户吗？停用后订阅链接将无法访问。"}</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setConfirm(null)}>取消</Button><Button variant="destructive" onClick={runConfirm}>确认</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>创建用户</DialogTitle><DialogDescription>填写本地测试用户信息。</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2"><Label>用户名</Label><Input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} /></div>
            <div className="space-y-2"><Label>密码</Label><Input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></div>
            <div className="space-y-2"><Label>到期时间</Label><DateTimeInput value={form.expiresAt} onChange={(expiresAt) => setForm({ ...form, expiresAt })} /></div>
            <div className="space-y-2"><Label>备注</Label><Input value={form.remark} onChange={(event) => setForm({ ...form, remark: event.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button><Button onClick={createUser}>保存</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(editingUser)} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>编辑用户</DialogTitle><DialogDescription>修改用户基础信息和到期时间。</DialogDescription></DialogHeader>
          {editingUser && (
            <div className="space-y-3">
              <div className="space-y-2"><Label>用户名</Label><Input value={editingUser.username} onChange={(event) => setEditingUser({ ...editingUser, username: event.target.value })} /></div>
              <div className="space-y-2"><Label>到期时间</Label><DateTimeInput value={editingUser.expiresAt} onChange={(expiresAt) => setEditingUser({ ...editingUser, expiresAt })} /></div>
              <div className="space-y-2"><Label>备注</Label><Input value={editingUser.remark} onChange={(event) => setEditingUser({ ...editingUser, remark: event.target.value })} /></div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setEditingUser(null)}>取消</Button><Button onClick={saveEdit}>保存</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(passwordUser)} onOpenChange={(open) => !open && setPasswordUser(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>修改用户密码</DialogTitle><DialogDescription>为用户 {passwordUser?.username} 设置新密码，保存后旧密码将立即失效。</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2"><Label>新密码</Label><Input type="password" value={passwordForm.password} onChange={(event) => setPasswordForm({ ...passwordForm, password: event.target.value })} /></div>
            <div className="space-y-2"><Label>确认新密码</Label><Input type="password" value={passwordForm.confirmPassword} onChange={(event) => setPasswordForm({ ...passwordForm, confirmPassword: event.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setPasswordUser(null)}>取消</Button><Button onClick={savePassword}>保存</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
