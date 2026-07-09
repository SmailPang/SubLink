import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";

export function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    api.settings().then((result) => setSettings({ siteName: "SubLink", subscriptionMode: "proxy", ...result.settings })).catch((error) => toast.error(error instanceof Error ? error.message : "加载失败"));
  }, []);
  async function save() {
    if (!settings) return;
    try {
      const result = await api.saveSettings(settings);
      setSettings(result.settings);
      toast.success("保存成功");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    }
  }
  if (!settings) return <Skeleton className="h-64" />;
  return (
    <Card>
      <CardHeader><CardTitle>系统设置</CardTitle></CardHeader>
      <CardContent className="max-w-xl space-y-4">
        <div className="space-y-2">
          <Label>左上角标题</Label>
          <Input value={settings.siteName || ""} onChange={(event) => setSettings({ ...settings, siteName: event.target.value })} />
          <p className="text-sm text-muted-foreground">这里会显示在系统左上角标题位置。</p>
        </div>
        <div className="space-y-2">
          <Label>订阅访问地址</Label>
          <Input
            value={settings.publicBaseUrl || ""}
            onChange={(event) => setSettings({ ...settings, publicBaseUrl: event.target.value })}
            placeholder="例如：https://sub.example.com"
          />
          <p className="text-sm text-muted-foreground">这里会作为“我的订阅”页面中订阅链接的域名部分，末尾不需要填写 /sub。</p>
        </div>
        <div className="space-y-2">
          <Label>订阅响应模式</Label>
          <Select
            value={settings.subscriptionMode || "proxy"}
            onValueChange={(value) => setSettings({ ...settings, subscriptionMode: value || "proxy" })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="proxy">代理上游</SelectItem>
              <SelectItem value="redirect">直跳上游</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">代理上游会隐藏上游地址但依赖 Cloudflare 到上游的连通性；直跳上游可减少手机客户端 timeout，但客户端可能看到最终上游地址。</p>
        </div>
        <Button onClick={save}>保存</Button>
      </CardContent>
    </Card>
  );
}
