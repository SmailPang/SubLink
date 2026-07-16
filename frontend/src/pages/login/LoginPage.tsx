import { FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

type TurnstileApi = {
  render: (container: string | HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId?: string) => void;
  remove?: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [loading, setLoading] = useState(false);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string>();
  const navigate = useNavigate();

  useEffect(() => {
    let timer: number | undefined;

    function renderTurnstile() {
      if (!turnstileRef.current || !window.turnstile || widgetIdRef.current) return;
      widgetIdRef.current = window.turnstile.render(turnstileRef.current, {
        sitekey: "0x4AAAAAADyYMxmzw51VyN3z",
        action: "turnstile-spin-v1",
        callback: (token: string) => setTurnstileToken(token),
        "expired-callback": () => setTurnstileToken(""),
        "error-callback": () => setTurnstileToken("")
      });
      if (timer) {
        window.clearInterval(timer);
        timer = undefined;
      }
    }

    if (window.turnstile) {
      renderTurnstile();
    } else {
      timer = window.setInterval(renderTurnstile, 100);
    }

    return () => {
      if (timer) window.clearInterval(timer);
      if (widgetIdRef.current) {
        window.turnstile?.remove?.(widgetIdRef.current);
        widgetIdRef.current = undefined;
      }
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!turnstileToken) {
      toast.error("请先完成人机验证");
      return;
    }
    setLoading(true);
    try {
      const result = await api.login(username, password, turnstileToken);
      toast.success("登录成功");
      navigate(result.user.mustChangePassword ? "/user/force-password" : result.user.role === "admin" ? "/admin/dashboard" : "/user/subscription", { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "账号或密码错误");
      setTurnstileToken("");
      window.turnstile?.reset?.(widgetIdRef.current);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>登录</CardTitle>
          <CardDescription>进入 SubLink 订阅管理系统</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="username">账号</Label>
              <Input id="username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
            </div>
            <div className="flex min-h-[65px] justify-center">
              <div ref={turnstileRef} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              <LogIn className="h-4 w-4" />
              {loading ? "登录中" : "登录"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
