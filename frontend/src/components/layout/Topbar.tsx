import { LogOut, Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Sidebar } from "./Sidebar";
import { api } from "@/lib/api";
import type { UserRole } from "@/types/user";

export function Topbar({ role }: { role?: UserRole | null }) {
  const [open, setOpen] = useState(false);
  const [siteName, setSiteName] = useState("SubLink");
  const navigate = useNavigate();

  useEffect(() => {
    api.publicSettings().then((result) => setSiteName(result.settings.siteName || "SubLink")).catch(() => setSiteName("SubLink"));
  }, []);

  async function logout() {
    await api.logout().catch(() => undefined);
    navigate("/login", { replace: true });
  }

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-background/90 px-5 backdrop-blur">
      <div className="flex items-center gap-3">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={<Button variant="ghost" size="icon" className="md:hidden" title="打开菜单" />}
          >
            <Menu className="h-5 w-5" />
          </SheetTrigger>
          <SheetContent
            side="left"
            showCloseButton={false}
            className="w-[min(300px,85vw)] bg-background p-4"
            style={{ background: "var(--background)" }}
          >
            <SheetHeader className="p-0 pb-4">
              <SheetTitle>{siteName}</SheetTitle>
            </SheetHeader>
            <Sidebar role={role} onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
        <div>
          <div className="text-sm font-semibold">{siteName}</div>
          <div className="text-xs text-muted-foreground">订阅管理平台</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={logout}>
          <LogOut className="h-4 w-4" />
          退出登录
        </Button>
      </div>
    </header>
  );
}
