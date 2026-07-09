import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { getToken } from "@/lib/api";
import { AppShell } from "@/components/layout/AppShell";
import { LoginPage } from "@/pages/login/LoginPage";
import { SubscriptionPage } from "@/pages/user/SubscriptionPage";
import { ProfilePage } from "@/pages/user/ProfilePage";
import { ForcePasswordPage } from "@/pages/user/ForcePasswordPage";
import { AnnouncementsPage } from "@/pages/user/AnnouncementsPage";
import { DashboardPage } from "@/pages/admin/DashboardPage";
import { UsersPage } from "@/pages/admin/UsersPage";
import { UserDetailPage } from "@/pages/admin/UserDetailPage";
import { UserUpstreamsPage } from "@/pages/admin/UserUpstreamsPage";
import { LogsPage } from "@/pages/admin/LogsPage";
import { SettingsPage } from "@/pages/admin/SettingsPage";
import { AnnouncementsManagePage } from "@/pages/admin/AnnouncementsManagePage";

function ProtectedLayout() {
  if (!getToken()) return <Navigate to="/login" replace />;
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route element={<ProtectedLayout />}>
          <Route path="/user/subscription" element={<SubscriptionPage />} />
          <Route path="/user/announcements" element={<AnnouncementsPage />} />
          <Route path="/user/force-password" element={<ForcePasswordPage />} />
          <Route path="/user/profile" element={<ProfilePage />} />
          <Route path="/user/logs" element={<LogsPage />} />
          <Route path="/admin/dashboard" element={<DashboardPage />} />
          <Route path="/admin/users" element={<UsersPage />} />
          <Route path="/admin/announcements" element={<AnnouncementsManagePage />} />
          <Route path="/admin/users/:id" element={<UserDetailPage />} />
          <Route path="/admin/upstreams" element={<UserUpstreamsPage />} />
          <Route path="/admin/logs" element={<LogsPage />} />
          <Route path="/admin/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      <Toaster />
    </>
  );
}
