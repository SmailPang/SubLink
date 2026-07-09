import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import type { UserAnnouncement } from "@/types/announcement";

export function AnnouncementsPage() {
  const [items, setItems] = useState<UserAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [readingId, setReadingId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      setItems((await api.userAnnouncements()).items);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function markRead(id: number) {
    setReadingId(id);
    try {
      const result = await api.markAnnouncementRead(id);
      setItems((old) => old.map((item) => item.id === id ? result.announcement : item));
      toast.success("已标记为已读");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失败");
    } finally {
      setReadingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">公告中心</h1>
        <p className="mt-1 text-sm text-muted-foreground">查看全部公告和自己的已读状态。</p>
      </div>
      {loading ? <Skeleton className="h-80" /> : items.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">暂无公告</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id} className={item.isRead ? "" : "border-[#242424]/30"}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle>{item.title}</CardTitle>
                  <Badge variant={item.isRead ? "secondary" : "default"}>{item.isRead ? "已读" : "未读"}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="whitespace-pre-wrap text-sm leading-6">{item.content}</p>
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>发布于 {formatDateTime(item.createdAt)}</span>
                  {item.isRead ? <span>已读于 {formatDateTime(item.readAt)}</span> : <Button size="sm" onClick={() => markRead(item.id)} disabled={readingId === item.id}>{readingId === item.id ? "处理中" : "标记已读"}</Button>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
