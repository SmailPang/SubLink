import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";

const subscriptionModeLabels: Record<string, string> = {
  proxy: "代理上游",
  redirect: "直跳上游"
};

const remoteConfigLabels: Record<string, string> = {
  none: "不使用",
  "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/config/ACL4SSR_Online.ini": "ACL4SSR_默认版",
  "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/config/ACL4SSR_Online_NoAuto.ini": "ACL4SSR_无测速",
  "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/config/ACL4SSR_Online_AdblockPlus.ini": "ACL4SSR_去广告",
  "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/config/ACL4SSR_Online_MultiCountry.ini": "ACL4SSR_多国家",
  "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/config/ACL4SSR_Online_FullGFW.ini": "ACL4SSR_全分组",
  "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/config/ACL4SSR_Online_Mini.ini": "ACL4SSR_精简版",
  "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/config/ACL4SSR_Online_Mini_AdblockPlus.ini": "ACL4SSR_精简版_去广告"
};

export function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    api.settings().then((result) => setSettings({ 
      siteName: "SubLink", 
      subscriptionMode: "proxy", 
      remoteConfig: "none",
      converterUrl: "https://api.v1.mk/sub",
      ...result.settings 
    })).catch((error) => toast.error(error instanceof Error ? error.message : "加载失败"));
  }, []);
  async function save() {
    if (!settings) return;
    try {
      const result = await api.saveSettings(settings);
      setSettings({ ...settings, ...result.settings });
      toast.success("保存成功");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    }
  }
  if (!settings) return <Skeleton className="h-64" />;

  const currentSubscriptionMode = settings.subscriptionMode || "proxy";
  const currentRemoteConfig = settings.remoteConfig || "none";

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
          <p className="text-sm text-muted-foreground">这里会作为"我的订阅"页面中订阅链接的域名部分，末尾不需要填写 /sub。</p>
        </div>
        <div className="space-y-2">
          <Label>订阅响应模式</Label>
          <Select
            value={currentSubscriptionMode}
            onValueChange={(value) => setSettings({ ...settings, subscriptionMode: value || "proxy" })}
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {subscriptionModeLabels[currentSubscriptionMode] || "代理上游"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="proxy">代理上游</SelectItem>
              <SelectItem value="redirect">直跳上游</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">代理上游会隐藏上游地址但依赖 Cloudflare 到上游的连通性；直跳上游可减少手机客户端 timeout，但客户端可能看到最终上游地址。</p>
        </div>
        <div className="space-y-2">
          <Label>订阅转换服务地址</Label>
          <Input
            value={settings.converterUrl || ""}
            onChange={(event) => setSettings({ ...settings, converterUrl: event.target.value })}
            placeholder="https://api.v1.mk/sub"
          />
          <p className="text-sm text-muted-foreground">订阅转换服务用于应用 ACL 规则。留空则不使用转换服务。常用：https://api.v1.mk/sub 或 https://sub.xeton.dev/sub</p>
        </div>
        <div className="space-y-2">
          <Label>远程配置（ACL 规则）</Label>
          <Select
            value={currentRemoteConfig}
            onValueChange={(value) => setSettings({ ...settings, remoteConfig: value || "none" })}
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {remoteConfigLabels[currentRemoteConfig] || "不使用"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">不使用</SelectItem>
              <SelectItem value="https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/config/ACL4SSR_Online.ini">ACL4SSR_默认版</SelectItem>
              <SelectItem value="https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/config/ACL4SSR_Online_NoAuto.ini">ACL4SSR_无测速</SelectItem>
              <SelectItem value="https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/config/ACL4SSR_Online_AdblockPlus.ini">ACL4SSR_去广告</SelectItem>
              <SelectItem value="https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/config/ACL4SSR_Online_MultiCountry.ini">ACL4SSR_多国家</SelectItem>
              <SelectItem value="https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/config/ACL4SSR_Online_FullGFW.ini">ACL4SSR_全分组</SelectItem>
              <SelectItem value="https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/config/ACL4SSR_Online_Mini.ini">ACL4SSR_精简版</SelectItem>
              <SelectItem value="https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/config/ACL4SSR_Online_Mini_AdblockPlus.ini">ACL4SSR_精简版_去广告</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">远程配置规则集，需要配合订阅转换服务使用。选择后订阅将应用对应的分流规则。</p>
        </div>
        <Button onClick={save}>保存</Button>
      </CardContent>
    </Card>
  );
}
