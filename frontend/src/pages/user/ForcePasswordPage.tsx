import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

export function ForcePasswordPage() {
  const [form, setForm] = useState({ password: "", confirmPassword: "" });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (form.password.length < 6) {
      toast.error("密码不能少于 6 位");
      return;
    }
    if (form.password !== form.confirmPassword) {
      toast.error("两次输入的密码不一致");
      return;
    }

    setLoading(true);
    try {
      await api.forceChangePassword({ newPassword: form.password });
      toast.success("保存成功");
      navigate("/user/subscription", { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>设置新密码</CardTitle>
          <CardDescription>这是首次登录，请先设置一个新的登录密码。</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="force-password">新密码</Label>
              <Input
                id="force-password"
                type="password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="force-confirm-password">确认新密码</Label>
              <Input
                id="force-confirm-password"
                type="password"
                value={form.confirmPassword}
                onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })}
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              <KeyRound className="h-4 w-4" />
              {loading ? "保存中" : "保存"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
