import { Link, useLocation } from "react-router-dom";
import type { ComponentType } from "react";
import { Activity, Bell, Gauge, Link2, ListChecks, Megaphone, Settings, ShieldCheck, User, Users, Workflow } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types/user";
import { buildInfo } from "@/generated/build-info";

type NavItem = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

const items: NavItem[] = [
  { to: "/user/subscription", label: "我的订阅", icon: Link2 },
  { to: "/user/announcements", label: "公告中心", icon: Bell },
  { to: "/user/profile", label: "个人资料", icon: User },
  { to: "/user/logs", label: "访问日志", icon: Activity }
];

const adminItems: NavItem[] = [
  { to: "/admin/dashboard", label: "仪表盘", icon: Gauge },
  { to: "/admin/users", label: "用户管理", icon: Users },
  { to: "/admin/announcements", label: "公告管理", icon: Megaphone },
  { to: "/admin/upstreams", label: "上游配置", icon: Workflow },
  { to: "/admin/logs", label: "访问日志", icon: Activity },
  { to: "/admin/audit-logs", label: "操作审计", icon: ShieldCheck },
  { to: "/admin/settings", label: "系统设置", icon: Settings }
];

export function Sidebar({ role, onNavigate }: { role?: UserRole | null; onNavigate?: () => void }) {
  const location = useLocation();
  const renderItems = (navItems: NavItem[]) => navItems.map((item) => {
    const Icon = item.icon;
    const active = location.pathname.startsWith(item.to);
    return (
      <Link
        key={item.to}
        to={item.to}
        onClick={onNavigate}
        className={cn(
          "flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          active && "bg-muted text-foreground"
        )}
      >
        <Icon className="h-4 w-4" />
        {item.label}
      </Link>
    );
  });

  return (
    <nav className="flex h-full flex-col">
      <div className="mb-4 flex h-10 items-center justify-between px-2 text-sm font-semibold text-foreground">
        <span>菜单</span>
        <span className="text-xl leading-none text-muted-foreground">≡</span>
      </div>
      <div className="space-y-1">{renderItems(items)}</div>
      {role === "admin" ? (
        <div className="mt-6">
          <div className="mb-2 px-3 text-xs font-semibold text-muted-foreground">管理员功能</div>
          <div className="space-y-1">{renderItems(adminItems)}</div>
        </div>
      ) : null}
      <div className="mt-auto flex h-10 items-center gap-3 rounded-xl bg-muted/70 px-3 text-xs font-medium text-muted-foreground">
        <ListChecks className="h-4 w-4" />
        <span className="truncate">{buildInfo.version}-{buildInfo.commit}</span>
      </div>
    </nav>
  );
}
