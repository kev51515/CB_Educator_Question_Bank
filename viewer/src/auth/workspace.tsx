/**
 * workspace — an admin's two real "hats" (Educator / Admin)
 * =========================================================
 * An admin legitimately holds BOTH educator and admin access — admin is the
 * superset. Rather than a single merged surface, or a "view as" preview that
 * implies impersonating a role you don't hold, an admin switches between two
 * real WORKSPACES, both genuinely theirs:
 *
 *   - Educator workspace: Dashboard, Courses, teaching surfaces.
 *   - Admin workspace:    system tools (Stats, Users, Colleges, Invites, Audit).
 *
 * This is NOT a preview/impersonation: there is no banner and no "this is what
 * they see" framing. It's a navigation preference over surfaces the admin owns.
 * The chosen workspace lives in a tiny external store mirrored to localStorage.
 * Non-admins never see the switcher and are always in the educator workspace.
 *
 * Security is unaffected: admin routes stay gated on the REAL role (see
 * AccountRoutes); the workspace only drives which nav the StaffShell shows and
 * where switching lands you.
 */
import { useSyncExternalStore, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useProfile } from "@/lib/profile";
import { ROUTES } from "@/lib/routes";

export type Workspace = "educator" | "admin";

const KEY = "omnilms:workspace";
const LABEL: Record<Workspace, string> = { educator: "Educator", admin: "Admin" };

function readStored(): Workspace {
  try {
    return window.localStorage.getItem(KEY) === "admin" ? "admin" : "educator";
  } catch {
    return "educator";
  }
}

let current: Workspace =
  typeof window === "undefined" ? "educator" : readStored();
const listeners = new Set<() => void>();

/** Switch the admin's active workspace (no-op effect for non-admins, since the
 *  switcher never renders for them). */
export function setWorkspace(ws: Workspace): void {
  current = ws === "admin" ? "admin" : "educator";
  try {
    window.localStorage.setItem(KEY, current);
  } catch {
    /* ignore (private mode / quota) */
  }
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useWorkspace(): Workspace {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => "educator",
  );
}

/** Landing route for a workspace. */
export function workspaceHome(ws: Workspace): string {
  return ws === "admin" ? ROUTES.ACCOUNT_ADMIN_STATS : ROUTES.DASHBOARD;
}

function CheckIcon(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/**
 * Segmented Educator | Admin control for the staff rail header. Renders nothing
 * unless the signed-in user is really an admin. Switching navigates to the
 * target workspace's home so the rail + the visible surface stay in sync.
 */
export function WorkspaceSwitcher(): ReactNode {
  const { profile } = useProfile();
  const ws = useWorkspace();
  const navigate = useNavigate();
  if (profile?.role !== "admin") return null;

  const pick = (next: Workspace): void => {
    if (next === ws) return;
    setWorkspace(next);
    navigate(workspaceHome(next));
  };

  return (
    <div
      role="tablist"
      aria-label="Workspace"
      className="flex gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800"
    >
      {(["educator", "admin"] as Workspace[]).map((r) => (
        <button
          key={r}
          type="button"
          role="tab"
          aria-selected={ws === r}
          onClick={() => pick(r)}
          className={[
            "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition",
            ws === r
              ? "bg-white text-indigo-700 shadow-sm dark:bg-slate-950 dark:text-indigo-300"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100",
          ].join(" ")}
        >
          {LABEL[r]}
        </button>
      ))}
    </div>
  );
}

/**
 * Workspace radio group for the account badge menu — the always-reachable
 * fallback for when the rail is collapsed (the rail-header switcher hides with
 * the labels). Admins only.
 */
export function WorkspaceMenuItems(): ReactNode {
  const { profile } = useProfile();
  const ws = useWorkspace();
  const navigate = useNavigate();
  if (profile?.role !== "admin") return null;

  const pick = (next: Workspace): void => {
    setWorkspace(next);
    navigate(workspaceHome(next));
  };

  return (
    <div className="border-b border-slate-100 py-1 dark:border-slate-800">
      <p className="px-4 pb-0.5 pt-1 text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
        Workspace
      </p>
      {(["educator", "admin"] as Workspace[]).map((r) => (
        <button
          key={r}
          type="button"
          role="menuitemradio"
          aria-checked={ws === r}
          onClick={() => pick(r)}
          className="flex w-full items-center justify-between px-4 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <span>{LABEL[r]} workspace</span>
          {ws === r && (
            <span className="text-indigo-600 dark:text-indigo-400">
              <CheckIcon />
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
