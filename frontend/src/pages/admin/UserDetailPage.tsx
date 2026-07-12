import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateTimeInput } from "@/components/ui/date-time-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { PublicUser } from "@/types/user";

export function UserDetailPage() {
  const { id } = useParams();
  const userId = Number(id);
  const [user, setUser] = useState<PublicUser | null>(null);

  useEffect(() => {
    api.user(userId).then((result) => setUser(result.user)).catch((error) => toast.error(error instanceof Error ? error.message : "加载失败"));
  }, [userId]);

  async function save() {
    if (!user) return;
    try {
      const result = await api.updateUser(user.id, { username: user.username, expiresAt: user.expiresAt, remark: user.remark, status: user.status });
      setUser(result.user);
      toast.success("保存成功");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    }
  }

  if (!user) return <Skeleton className="h-72" />;
  return (
    <Card>
      <CardHeader><CardTitle>编辑用户</CardTitle></CardHeader>
      <CardContent className="max-w-xl space-y-4">
        <div className="space-y-2"><Label>用户名</Label><Input value={user.username} onChange={(event) => setUser({ ...user, username: event.target.value })} /></div>
        <div className="space-y-2"><Label>到期时间</Label><DateTimeInput value={user.expiresAt} onChange={(expiresAt) => setUser({ ...user, expiresAt })} /></div>
        <div className="space-y-2"><Label>备注</Label><Input value={user.remark} onChange={(event) => setUser({ ...user, remark: event.target.value })} /></div>
        <Button onClick={save}>保存</Button>
      </CardContent>
    </Card>
  );
}
