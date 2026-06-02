/**
 * StudentShell
 * ============
 * Thin wrapper around the authenticated student surface. Owns the floating
 * overlays (StudentBadge + AccountUpgradeBanner) so the student/staff
 * shells stay DRY; the actual content is rendered via `<Outlet />`.
 *
 * Also mounts the global ⌘/Ctrl+K CommandPalette so it works on every
 * authenticated route — not just `/practice`. The palette's
 * `useLmsCommands()` hook supplies the LMS-flavored navigation and
 * per-course quick actions; the bank-specific question/recent props are
 * empty here because the shell has no question-bank context.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { ROUTES } from "../lib/routes";
import { StudentBadge } from "./StudentBadge";
import { AccountUpgradeBanner } from "./AccountUpgradeBanner";
import { useStudentSession } from "./session";
import { useProfile } from "../lib/profile";
import { CommandPalette, type Command } from "../components/CommandPalette";
import {
  STUDENT_RECENT_COMMANDS_CAP,
  readStudentRecentCommandIds,
  useStudentCommands,
  writeStudentRecentCommandIds,
} from "../lib/studentCommands";

export function StudentShell() {
  const navigate = useNavigate();
  const { session, signOut, setArea, upgradeAnonymousAccount } =
    useStudentSession();
  const { profile } = useProfile();
  const displayName = profile?.display_name ?? session?.name ?? "";

  const [paletteOpen, setPaletteOpen] = useState(false);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  // Build the student command list (resume test, weak skills, mock, nav…).
  // Wrap each command's `run` so we can bookkeep a "recents" stack persisted
  // to localStorage. Mirrors the staff shell pattern.
  const studentCommands = useStudentCommands();
  const [recentIds, setRecentIds] = useState<string[]>(() =>
    readStudentRecentCommandIds(),
  );
  const recordRecent = useCallback((id: string): void => {
    setRecentIds((prev) => {
      const next = [id, ...prev.filter((existing) => existing !== id)].slice(
        0,
        STUDENT_RECENT_COMMANDS_CAP,
      );
      writeStudentRecentCommandIds(next);
      return next;
    });
  }, []);
  const wrappedCommands = useMemo<Command[]>(
    () =>
      studentCommands.map((cmd) => ({
        ...cmd,
        run: () => {
          recordRecent(cmd.id);
          cmd.run();
        },
      })),
    [studentCommands, recordRecent],
  );

  // Global ⌘/Ctrl+K listener for opening the palette on every student route.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <AccountUpgradeBanner upgradeAnonymousAccount={upgradeAnonymousAccount} />
      {/* Bottom safe-area padding (env(safe-area-inset-bottom)) plus the
          tab bar's ~64px height — phone-only so desktop stays unchanged. */}
      <div className="md:pb-0 pb-[calc(64px+env(safe-area-inset-bottom))]">
        <Outlet />
      </div>
      <StudentBadge
        studentName={displayName}
        onSwitchArea={() => {
          setArea(null);
          navigate(ROUTES.HOME);
        }}
        onSignOut={signOut}
        showSwitchArea
      />
      <CommandPalette
        open={paletteOpen}
        onClose={closePalette}
        index={[]}
        recentIds={recentIds}
        commands={wrappedCommands}
        onPickQuestion={closePalette}
      />
      <StudentMobileTabBar />
    </>
  );
}

/**
 * M17: phone-only bottom tab bar with the 5 highest-frequency student
 * destinations. Mounts only on `md:hidden` viewports so desktop is
 * unaffected. Lives in this file (not `components/MobileTabBar.tsx`)
 * because that component has a different filters/list/detail contract
 * for the question-bank surface.
 */
interface TabSpec {
  to: string;
  label: string;
  match: (pathname: string) => boolean;
  icon: ReactNode;
}

const STUDENT_TABS: TabSpec[] = [
  {
    to: ROUTES.HOME,
    label: "Home",
    match: (p) => p === "/" || p === "",
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M3 12 12 3l9 9" />
        <path d="M5 10v10h14V10" />
      </svg>
    ),
  },
  {
    to: ROUTES.PRACTICE,
    label: "Practice",
    match: (p) => p.startsWith("/practice"),
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M4 19V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14" />
        <path d="M4 19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2" />
        <path d="M8 7h8M8 11h8M8 15h5" />
      </svg>
    ),
  },
  {
    to: ROUTES.MOCK_TEST,
    label: "Mock",
    match: (p) => p.startsWith("/mock-test") || p.startsWith("/test/"),
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx={12} cy={13} r={8} />
        <path d="M12 9v4l2.5 2.5" />
      </svg>
    ),
  },
  {
    to: ROUTES.INBOX,
    label: "Inbox",
    match: (p) => p.startsWith("/inbox"),
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M22 12h-6l-2 3h-4l-2-3H2" />
        <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
      </svg>
    ),
  },
  {
    to: ROUTES.ACCOUNT,
    label: "Account",
    match: (p) => p.startsWith("/account"),
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx={12} cy={7} r={4} />
      </svg>
    ),
  },
];

function StudentMobileTabBar() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <nav
      aria-label="Student sections"
      className="md:hidden fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)] print:hidden"
    >
      {STUDENT_TABS.map((tab) => {
        const active = tab.match(location.pathname);
        return (
          <button
            key={tab.to}
            type="button"
            onClick={() => navigate(tab.to)}
            aria-current={active ? "page" : undefined}
            aria-label={tab.label}
            className={
              "flex-1 min-h-[56px] flex flex-col items-center justify-center gap-0.5 py-2 transition-colors " +
              (active
                ? "text-indigo-600 dark:text-indigo-400"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200")
            }
          >
            {tab.icon}
            <span className="text-[11px] font-medium tracking-tight">
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
