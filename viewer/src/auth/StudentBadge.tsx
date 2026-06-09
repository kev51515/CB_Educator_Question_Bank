/**
 * StudentBadge
 * ============
 * Tiny corner widget that overlays the active area (bank or mock) so the
 * student can switch areas or sign out without us touching the viewer's
 * existing header. Fixed-positioned, collapses to an icon on small screens.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "@/lib/routes";

interface StudentBadgeProps {
  studentName: string;
  onSwitchArea: () => void;
  onSignOut: () => void;
  /**
   * Role label shown as a sub-line on the badge and in the menu header so the
   * surface is unmistakably a student's — clear even from a screenshot.
   * Optional for source-compat with non-student callers.
   */
  roleLabel?: string;
  /**
   * Teacher-assigned personal code (managed students, e.g. "KQAZNP-01"),
   * appended after the role label for at-a-glance identification. Null/absent
   * for self-registered students, who show only the role label.
   */
  personalCode?: string | null;
  /** When false, hides the "Switch area" menu item (e.g. for teachers). */
  showSwitchArea?: boolean;
  /**
   * Deprecated. The "Account settings" item now navigates to
   * `ROUTES.ACCOUNT` via react-router. Kept in the props for source
   * compatibility with callers that still pass a handler; the value is
   * ignored.
   */
  onOpenSettings?: () => void;
  /** Role-prefixed inbox / account targets. Default to the educator paths;
   *  StudentShell overrides with the `/student/*` equivalents. */
  inboxPath?: string;
  accountPath?: string;
  /** Optional extra menu content rendered just under the header (e.g. the
   *  admin "View as" switcher). Self-hides when not applicable. */
  menuExtra?: ReactNode;
}

export function StudentBadge({
  studentName,
  onSwitchArea,
  onSignOut,
  roleLabel,
  personalCode = null,
  showSwitchArea = true,
  inboxPath = ROUTES.INBOX,
  accountPath = ROUTES.ACCOUNT,
  menuExtra,
}: StudentBadgeProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const firstName = studentName.split(" ")[0] || studentName;
  const initial = (firstName[0] || "?").toUpperCase();
  // Just the role label, e.g. "Student". The teacher-assigned join code is
  // intentionally NOT shown here — it's a one-time course-join code, not an
  // identity the student needs surfaced in their account menu. The
  // `personalCode` prop is retained for source-compat but no longer rendered.
  void personalCode;
  const roleLine = roleLabel ?? null;

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="fixed bottom-3 right-3 z-50 print:hidden">
      {open && (
        <div
          role="menu"
          className="mb-2 w-56 rounded-xl bg-white dark:bg-slate-900 shadow-xl ring-1 ring-slate-200 dark:ring-slate-700 overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Signed in as</p>
            <p className="font-medium text-slate-900 dark:text-slate-100 truncate">
              {studentName}
            </p>
            {roleLine && (
              <p className="mt-0.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 truncate">
                {roleLine}
              </p>
            )}
          </div>
          {menuExtra}
          {showSwitchArea && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onSwitchArea();
              }}
              className="block w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Switch area
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              navigate(inboxPath);
            }}
            className="block w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Inbox
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              navigate(accountPath);
            }}
            className="block w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Account settings
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            className="block w-full text-left px-4 py-2 text-sm text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
          >
            Sign out
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={
          roleLine
            ? `Account menu for ${studentName} (${roleLine})`
            : `Account menu for ${studentName}`
        }
        className="flex items-center gap-2 rounded-full bg-white/95 dark:bg-slate-900/95 backdrop-blur shadow-lg ring-1 ring-slate-200 dark:ring-slate-700 pl-1 pr-3 py-1 hover:ring-indigo-400 dark:hover:ring-indigo-500 transition"
      >
        <span className="h-7 w-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white grid place-items-center text-sm font-semibold">
          {initial}
        </span>
        <span className="flex flex-col items-start leading-tight max-w-[10rem]">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate max-w-full">
            {firstName}
          </span>
          {roleLine && (
            <span className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 truncate max-w-full">
              {roleLine}
            </span>
          )}
        </span>
      </button>
    </div>
  );
}
