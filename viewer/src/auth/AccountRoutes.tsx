/**
 * AccountRoutes
 * =============
 * Nested router mounted at `/account/*`. Shared between students and staff
 * — the layout (sidebar with Settings + admin sub-nav) lives here, and
 * staff-only routes (`admin/stats`, `admin/users`, `admin/invites`) are
 * gated on `profile.role`. A student who deep-links to an admin URL is
 * redirected back to `/account/settings`.
 *
 * Layout: a header + a two-column body. The sidebar shows Settings always,
 * plus a collapsible Admin section (Stats / Users / Invite codes) when the
 * signed-in user is staff. The right pane is the matched child route.
 *
 * The actual edit-profile form lives in `AccountSettings` (unchanged); the
 * admin sub-pages live in `admin/Admin{Stats,Users,Invites}Page.tsx`
 * (thin wrappers around the existing data views).
 */
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { ROUTES } from "../lib/routes";
import type { Profile, ProfileRole } from "../lib/profile";
import type { AuthResult } from "./session";
import { AccountSettings } from "./AccountSettings";
import { NotificationPreferencesPage } from "./NotificationPreferencesPage";
import {
  AdminAuditPage,
  AdminInvitesPage,
  AdminStatsPage,
  AdminUsersPage,
} from "../admin";

export interface AccountRoutesProps {
  profile: Profile;
  email: string;
  updateDisplayName: (name: string) => Promise<AuthResult>;
  updatePassword: (newPassword: string) => Promise<AuthResult>;
  onSignOut: () => Promise<void> | void;
}

function isStaff(role: ProfileRole): boolean {
  return role === "teacher" || role === "admin";
}

function roleBadgeLabel(role: ProfileRole): string {
  switch (role) {
    case "admin":
      return "Admin";
    case "teacher":
      return "Teacher";
    case "student":
      return "Student";
    default:
      return role;
  }
}

function roleBadgeClass(role: ProfileRole): string {
  switch (role) {
    case "admin":
      return "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300";
    case "teacher":
      return "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300";
    case "student":
    default:
      return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  }
}

interface SidebarLinkProps {
  to: string;
  label: string;
  end?: boolean;
}

function SidebarLink({ to, label, end = false }: SidebarLinkProps) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }: { isActive: boolean }) =>
        [
          "block rounded-lg px-3 py-2 text-sm font-medium transition",
          isActive
            ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-200"
            : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
        ].join(" ")
      }
    >
      {label}
    </NavLink>
  );
}

export function AccountRoutes({
  profile,
  email,
  updateDisplayName,
  updatePassword,
  onSignOut,
}: AccountRoutesProps) {
  const staff = isStaff(profile.role);
  const displayName = profile.display_name?.trim() || email;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Page header */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Account
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Signed in as{" "}
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {displayName}
              </span>
            </p>
          </div>
          <span
            className={[
              "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
              roleBadgeClass(profile.role),
            ].join(" ")}
          >
            {roleBadgeLabel(profile.role)}
          </span>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-[12rem_1fr] gap-6">
          {/* Sidebar */}
          <nav
            aria-label="Account sections"
            className="md:sticky md:top-6 md:self-start space-y-3"
          >
            <div className="space-y-1">
              <SidebarLink to={ROUTES.ACCOUNT_SETTINGS} label="Settings" />
              <SidebarLink
                to={ROUTES.NOTIFICATION_PREFS}
                label="Notifications"
              />
            </div>
            {staff && (
              <div className="space-y-1 pt-2 border-t border-slate-200 dark:border-slate-800">
                <p className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Admin
                </p>
                <SidebarLink to={ROUTES.ACCOUNT_ADMIN_STATS} label="Stats" />
                <SidebarLink to={ROUTES.ACCOUNT_ADMIN_USERS} label="Users" />
                <SidebarLink
                  to={ROUTES.ACCOUNT_ADMIN_INVITES}
                  label="Invite codes"
                />
                <SidebarLink
                  to={ROUTES.ACCOUNT_ADMIN_AUDIT}
                  label="Audit log"
                />
              </div>
            )}
          </nav>

          {/* Right pane */}
          <main className="min-w-0">
            <Routes>
              <Route
                index
                element={
                  <Navigate to={ROUTES.ACCOUNT_SETTINGS} replace />
                }
              />
              <Route
                path="settings"
                element={
                  <div className="space-y-4">
                    <header className="space-y-1">
                      <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                        Settings
                      </h2>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Update your display name, email, and password, or sign
                        out of this device.
                      </p>
                    </header>
                    <AccountSettings
                      profile={profile}
                      email={email}
                      updateDisplayName={updateDisplayName}
                      updatePassword={updatePassword}
                      onSignOut={onSignOut}
                    />
                  </div>
                }
              />
              <Route
                path="notification-preferences"
                element={<NotificationPreferencesPage />}
              />
              {staff ? (
                <>
                  <Route path="admin/stats" element={<AdminStatsPage />} />
                  <Route
                    path="admin/users"
                    element={<AdminUsersPage currentUserId={profile.id} />}
                  />
                  <Route path="admin/invites" element={<AdminInvitesPage />} />
                  <Route path="admin/audit" element={<AdminAuditPage />} />
                </>
              ) : (
                // Students who deep-link to admin URLs get bounced.
                <Route
                  path="admin/*"
                  element={<Navigate to={ROUTES.ACCOUNT_SETTINGS} replace />}
                />
              )}
              {/* Unknown subpath → settings. */}
              <Route
                path="*"
                element={<Navigate to={ROUTES.ACCOUNT_SETTINGS} replace />}
              />
            </Routes>
          </main>
        </div>
      </div>
    </div>
  );
}
