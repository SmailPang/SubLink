import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { SubscriptionCards } from "@/components/subscription/SubscriptionCards";
import { api } from "@/lib/api";
import type { SubscriptionData } from "@/types/user";

export function SubscriptionPage() {
  const [data, setData] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setData(await api.subscription());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function resetToken() {
    try {
      await api.resetOwnToken();
      toast.success("操作成功");
      setConfirmOpen(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失败");
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">我的订阅</h1>
        <p className="text-sm text-muted-foreground">查看账号状态并复制适合客户端的订阅链接。</p>
      </div>
      {loading ? <Skeleton className="h-80" /> : data ? <SubscriptionCards data={data} onReset={() => setConfirmOpen(true)} /> : <div className="rounded-lg border p-8 text-center text-muted-foreground">暂无订阅数据</div>}
      {data && (
        <Alert>
          <AlertTitle>使用说明</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-1 pl-5">
              {data.instructions.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认重置 Token</DialogTitle>
            <DialogDescription>确认重置该用户的 Token 吗？重置后旧订阅链接将立即失效。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>取消</Button>
            <Button variant="destructive" onClick={resetToken}>重置 Token</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
