/**
 * viewAs — admin "View as" (role preview)
 * =======================================
 * Roles are single-valued (student | teacher | admin), but an admin is the
 * superset and often needs to SEE what an educator or a student sees (support,
 * QA, "why is this student stuck?"). This module lets an admin switch the
 * app's *rendered* role without changing their actual role.
 *
 * - A tiny external store (useSyncExternalStore) holds the chosen view, mirrored
 *   to localStorage so a refresh keeps the preview. Only 'student' | 'teacher'
 *   are valid targets; null = the admin's own (admin) view.
 * - `useEffectiveRole(realRole)` returns the role the app should render as
 *   (the admin's choice, or the real role for everyone else). AuthGate branches
 *   on it; non-admins are completely unaffected.
 * - `ViewAsMenuItems` drops into the account badge menu (admins only).
 * - `ViewAsBanner` is a persistent "you're previewing — return to admin" strip,
 *   so the admin can always get back (even from the student shell, which has no
 *   admin switcher).
 *
 * This is a *view* preview of the admin's OWN surfaces in another role, not
 * impersonation of a specific other user (that stays out of scope — admins
 * inspect specific students via the existing student-profile pages).
 */
import { useSyncExternalStore, type ReactNode } from "react";
import { useProfile } from "@/lib/profile";

export type ViewRole = "student" | "teacher" | "admin";

const KEY = "isportify:viewAs";
const LABEL: Record<ViewRole, string> = { student: "Student", teacher: "Educator", admin: "Admin" };

function readStored(): ViewRole | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "student" || v === "teacher" ? v : null;
  } catch {
    return null;
  }
}

let current: ViewRole | null = typeof window === "undefined" ? null : readStored();
const listeners = new Set<() => void>();

/** Set the admin's preview role; null returns to the admin's own view. */
export function setViewAs(role: ViewRole | null): void {
  const next = role === "student" || role === "teacher" ? role : null;
  current = next;
  try {
    if (next) window.localStorage.setItem(KEY, next);
    else window.localStorage.removeItem(KEY);
  } catch {
    /* ignore (private mode / quota) */
  }
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useViewAs(): ViewRole | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

/** The role the app should render as. Only admins can preview a different role. */
export function useEffectiveRole(realRole: ViewRole): ViewRole {
  const va = useViewAs();
  return realRole === "admin" && va ? va : realRole;
}

function CheckIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/**
 * "View as" radio group for the account badge menu. Renders nothing unless the
 * signed-in user is really an admin.
 */
export function ViewAsMenuItems(): ReactNode {
  const { profile } = useProfile();
  const va = useViewAs();
  if (profile?.role !== "admin") return null;
  const active: ViewRole = va ?? "admin";
  const options: ViewRole[] = ["admin", "teacher", "student"];
  return (
    <div className="border-b border-slate-100 py-1 dark:border-slate-800">
      <p className="px-4 pb-0.5 pt-1 text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
        View as
      </p>
      {options.map((r) => (
        <button
          key={r}
          type="button"
          role="menuitemradio"
          aria-checked={active === r}
          onClick={() => setViewAs(r === "admin" ? null : r)}
          className="flex w-full items-center justify-between px-4 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <span>
            {LABEL[r]}
            {r === "admin" && <span className="ml-1 text-xs text-slate-400">(you)</span>}
          </span>
          {active === r && <span className="text-indigo-600 dark:text-indigo-400"><CheckIcon /></span>}
        </button>
      ))}
    </div>
  );
}

/**
 * Persistent preview banner shown while an admin is viewing as another role.
 * Lives at the app root so it's reachable from the student shell too.
 */
export function ViewAsBanner(): ReactNode {
  const { profile } = useProfile();
  const va = useViewAs();
  if (profile?.role !== "admin" || !va) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[60] flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-400 px-4 py-1.5 text-xs font-medium text-slate-900 shadow-sm print:hidden dark:bg-amber-500">
      <span>
        Previewing as <strong>{LABEL[va]}</strong> — you're an admin, so this is what they see.
      </span>
      <button
        type="button"
        onClick={() => setViewAs(null)}
        className="rounded bg-slate-900/15 px-2 py-0.5 font-semibold hover:bg-slate-900/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/40"
      >
        Return to admin view
      </button>
    </div>
  );
}
