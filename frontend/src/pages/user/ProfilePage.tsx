import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatDateTime, formatExpiresAt, statusText } from "@/lib/utils";
import type { PublicUser } from "@/types/user";

export function ProfilePage() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [usernameOpen, setUsernameOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [tokenOpen, setTokenOpen] = useState(false);
  const [usernameForm, setUsernameForm] = useState("");
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [savingUsername, setSavingUsername] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [resettingToken, setResettingToken] = useState(false);

  useEffect(() => {
    api.me().then((result) => {
      setUser(result.user);
      setUsernameForm(result.user.username);
    }).catch((error) => toast.error(error instanceof Error ? error.message : "加载失败"));
  }, []);

  async function refreshUser() {
    const result = await api.me();
    setUser(result.user);
    setUsernameForm(result.user.username);
  }

  async function saveUsername() {
    if (!user) return;
    setSavingUsername(true);
    try {
      const result = await api.updateOwnProfile({ username: usernameForm, remark: user.remark });
      setUser(result.user);
      setUsernameForm(result.user.username);
      setUsernameOpen(false);
      toast.success("保存成功");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSavingUsername(false);
    }
  }

  async function savePassword() {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error("两次输入的新密码不一致");
      return;
    }
    setSavingPassword(true);
    try {
      await api.changeOwnPassword({ currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword });
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setPasswordOpen(false);
      toast.success("保存成功");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSavingPassword(false);
    }
  }

  async function resetToken() {
    setResettingToken(true);
    try {
      await api.resetOwnToken();
      await refreshUser();
      setTokenOpen(false);
      toast.success("操作成功");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失败");
    } finally {
      setResettingToken(false);
    }
  }

  if (!user) return <Skeleton className="h-64" />;
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>个人资料</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            ["用户名", user.username],
            ["账号状态", statusText(user.status, user.expiresAt, user.role)],
            ["到期时间", formatExpiresAt(user.expiresAt, user.role)],
            ["账号角色", user.role === "admin" ? "管理员" : "普通用户"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-muted px-4 py-3">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="mt-1 text-sm font-semibold">{value}</div>
            </div>
          ))}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button onClick={() => { setUsernameForm(user.username); setUsernameOpen(true); }}>修改用户名</Button>
            <Button onClick={() => setPasswordOpen(true)}>修改密码</Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>账号访问</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-2xl bg-muted px-4 py-3">
            <div className="text-xs text-muted-foreground">最近使用客户端</div>
            <div className="mt-1 text-sm font-semibold">{user.lastClient || "暂无记录"}</div>
          </div>
          <div className="rounded-2xl bg-muted px-4 py-3">
            <div className="text-xs text-muted-foreground">最近访问时间</div>
            <div className="mt-1 text-sm font-semibold">{formatDateTime(user.lastAccessAt)}</div>
          </div>
        </CardContent>
      </Card>
      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle>订阅 Token</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="break-all rounded-2xl bg-muted px-4 py-3 text-sm font-semibold">{user.token}</div>
          <Button onClick={() => setTokenOpen(true)}>重置 Token</Button>
        </CardContent>
      </Card>

      <Dialog open={usernameOpen} onOpenChange={setUsernameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>修改用户名</DialogTitle>
            <DialogDescription>修改后下次登录请使用新的用户名。</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="profile-username">用户名</Label>
            <Input id="profile-username" value={usernameForm} onChange={(event) => setUsernameForm(event.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUsernameOpen(false)}>取消</Button>
            <Button onClick={saveUsername} disabled={savingUsername}>{savingUsername ? "保存中" : "保存"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>修改密码</DialogTitle>
            <DialogDescription>请输入当前密码，并设置不少于 6 位的新密码。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="current-password">当前密码</Label>
              <Input id="current-password" type="password" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm({ ...passwordForm, currentPassword: event.target.value })} autoComplete="current-password" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">新密码</Label>
              <Input id="new-password" type="password" value={passwordForm.newPassword} onChange={(event) => setPasswordForm({ ...passwordForm, newPassword: event.target.value })} autoComplete="new-password" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">确认新密码</Label>
              <Input id="confirm-password" type="password" value={passwordForm.confirmPassword} onChange={(event) => setPasswordForm({ ...passwordForm, confirmPassword: event.target.value })} autoComplete="new-password" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordOpen(false)}>取消</Button>
            <Button onClick={savePassword} disabled={savingPassword}>{savingPassword ? "保存中" : "保存"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={tokenOpen} onOpenChange={setTokenOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认重置 Token</DialogTitle>
            <DialogDescription>重置后旧订阅链接将立即失效，请重新复制新的订阅链接。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTokenOpen(false)}>取消</Button>
            <Button onClick={resetToken} disabled={resettingToken}>{resettingToken ? "处理中" : "重置 Token"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
