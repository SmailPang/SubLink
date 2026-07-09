import { Copy, QrCode, RotateCcw } from "lucide-react";
import { useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { copyText } from "@/lib/copy";
import { formatDateTime, formatExpiresAt, statusText } from "@/lib/utils";
import type { SubscriptionData } from "@/types/user";

export function SubscriptionCards({ data, onReset }: { data: SubscriptionData; onReset: () => void }) {
  const [qrOpen, setQrOpen] = useState(false);
  const [qrCode, setQrCode] = useState("");

  async function copy(link: string) {
    await copyText(link);
    toast.success("复制成功");
  }

  async function showQrCode() {
    try {
      const url = await QRCode.toDataURL(data.genericLink, {
        width: 260,
        margin: 2,
        errorCorrectionLevel: "M",
        color: {
          dark: "#242424",
          light: "#ffffff"
        }
      });
      setQrCode(url);
      setQrOpen(true);
    } catch {
      toast.error("二维码生成失败");
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>账号状态</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">用户名</span><span>{data.user.username}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">账号状态</span><Badge variant={data.user.status === "active" ? "secondary" : "destructive"}>{statusText(data.user.status, data.user.expiresAt, data.user.role)}</Badge></div>
            <div className="flex justify-between"><span className="text-muted-foreground">到期时间</span><span>{formatExpiresAt(data.user.expiresAt, data.user.role)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">最近使用客户端</span><span>{data.user.lastClient || "暂无记录"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">最近访问时间</span><span>{formatDateTime(data.user.lastAccessAt)}</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>通用订阅链接</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="break-all rounded-md bg-secondary p-3 text-sm">{data.genericLink}</div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={() => copy(data.genericLink)}><Copy className="h-4 w-4" />复制链接</Button>
              <Button variant="outline" onClick={showQrCode}><QrCode className="h-4 w-4" />二维码</Button>
              <Button variant="outline" onClick={onReset}><RotateCcw className="h-4 w-4" />重置 Token</Button>
            </div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>专用客户端订阅链接</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {data.clientLinks.map((item) => (
            <div key={item.client} className="rounded-lg border p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="font-medium">{item.name}</div>
                <Badge variant={item.enabled ? "secondary" : "outline"}>{item.enabled ? "启用" : "停用"}</Badge>
              </div>
              <div className="mb-3 break-all rounded-md bg-secondary p-2 text-xs">{item.link}</div>
              <Button variant="outline" size="sm" onClick={() => copy(item.link)}><Copy className="h-4 w-4" />复制</Button>
            </div>
          ))}
        </CardContent>
      </Card>
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>订阅链接二维码</DialogTitle>
            <DialogDescription>使用客户端扫码导入通用订阅链接。</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4">
            {qrCode ? <img src={qrCode} alt="订阅链接二维码" className="size-64 rounded-2xl border bg-white p-3" /> : null}
            <div className="max-w-full break-all rounded-2xl bg-muted px-4 py-3 text-xs">{data.genericLink}</div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQrOpen(false)}>关闭</Button>
            <Button onClick={() => copy(data.genericLink)}>复制链接</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
