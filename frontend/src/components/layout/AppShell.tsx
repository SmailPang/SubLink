import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { api } from "@/lib/api";
import type { PublicUser, UserRole } from "@/types/user";

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [role, setRole] = useState<UserRole | null>(null);
  const [user, setUser] = useState<PublicUser | null>(null);

  useEffect(() => {
    api.me().then((result) => {
      setUser(result.user);
      setRole(result.user.role);
      if (result.user.mustChangePassword && location.pathname !== "/user/force-password") {
        navigate("/user/force-password", { replace: true });
      }
    }).catch(() => {
      setUser(null);
      setRole(null);
      if (location.pathname !== "/login") navigate("/login", { replace: true });
    });
  }, [location.pathname, navigate]);

  const lockNavigation = Boolean(user?.mustChangePassword && location.pathname === "/user/force-password");

  return (
    <div className="min-h-screen bg-background">
      <Topbar role={role} />
      <div className="flex min-h-[calc(100vh-4rem)]">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-64 shrink-0 overflow-y-auto border-r bg-background p-4 md:block">
          {lockNavigation ? null : (
          <Sidebar role={role} />
          )}
        </aside>
        <main className="min-w-0 flex-1 p-4 md:p-6">
          <div key={location.pathname} className="route-page">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
