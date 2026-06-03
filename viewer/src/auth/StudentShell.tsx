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
 *
 * Round 36 (student lane): mirrors the StaffShell desktop sidebar so the
 * Linear-style ⌘B collapse affordance is available on the student surface
 * too. Sidebar lives at `lg+` only — sm/md viewports continue to use the
 * existing `StudentMobileTabBar` (bottom tabs) for navigation.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ROUTES, studentHomePath } from "../lib/routes";
import { StudentBadge } from "./StudentBadge";
import { AccountUpgradeBanner } from "./AccountUpgradeBanner";
import { useStudentSession } from "./session";
import { useProfile } from "../lib/profile";
import { CommandPalette, type Command } from "../components/CommandPalette";
import { ShortcutsHelp } from "../components/ShortcutsHelp";
import {
  STUDENT_RECENT_COMMANDS_CAP,
  readStudentRecentCommandIds,
  useStudentCommands,
  writeStudentRecentCommandIds,
} from "../lib/studentCommands";

/**
 * Per-user localStorage key prefix for the Linear-style desktop sidebar
 * collapse state. Mirrors the StaffShell pattern but uses a `student.*`
 * namespace so the two surfaces don't clobber each other when a single
 * browser profile sees both (e.g. a teacher who also has a student-area
 * login for QA).
 */
const SIDEBAR_COLLAPSED_KEY_PREFIX = "student.shell.sidebarCollapsed:";

function readSidebarCollapsed(userId: string | null): boolean {
  try {
    const key = userId
      ? `${SIDEBAR_COLLAPSED_KEY_PREFIX}${userId}`
      : SIDEBAR_COLLAPSED_KEY_PREFIX;
    const raw = window.localStorage.getItem(key);
    return raw === "true";
  } catch {
    return false;
  }
}

function writeSidebarCollapsed(userId: string | null, value: boolean): void {
  try {
    const key = userId
      ? `${SIDEBAR_COLLAPSED_KEY_PREFIX}${userId}`
      : SIDEBAR_COLLAPSED_KEY_PREFIX;
    window.localStorage.setItem(key, value ? "true" : "false");
  } catch {
    // ignore (private mode, quota)
  }
}

/**
 * Returns true when focus is currently in an editable surface (input,
 * textarea, or contenteditable). Used to suppress shortcut keys like ⌘B
 * while the user is typing — otherwise pressing ⌘B inside a markdown
 * editor would steal the "bold text" affordance, and inside a search box
 * would silently collapse the sidebar mid-query.
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

interface RailIconProps {
  children: ReactNode;
}

function RailIcon({ children }: RailIconProps) {
  return (
    <span
      aria-hidden
      className="inline-flex items-center justify-center h-6 w-6"
    >
      {children}
    </span>
  );
}

function railLinkClass({ isActive }: { isActive: boolean }): string {
  return [
    "flex items-center gap-3 px-3 py-3 min-h-[44px] rounded-lg text-sm font-medium transition-colors w-full",
    isActive
      ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-200 ring-1 ring-indigo-200 dark:ring-indigo-900"
      : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800",
  ].join(" ");
}

/**
 * Heuristic: a path "matches" /account when it starts with /account/. We
 * rely on this for the Account rail item's active state instead of
 * NavLink's built-in match (which would only highlight on an exact
 * /account hit).
 */
function isAccountRouteActive(pathname: string): boolean {
  return (
    pathname === ROUTES.STUDENT_ACCOUNT ||
    pathname.startsWith(`${ROUTES.STUDENT_ACCOUNT}/`)
  );
}

/**
 * The student dashboard now lives under `/student` (and `/student/:code` for
 * managed accounts), with `/` redirecting there. Treat all three as "Home"
 * for nav highlight so the rail/tab Home item stays lit on the landing.
 */
function isStudentHomeActive(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === ROUTES.STUDENT_HOME ||
    pathname.startsWith(`${ROUTES.STUDENT_HOME}/`)
  );
}

export function StudentShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, signOut, setArea, upgradeAnonymousAccount } =
    useStudentSession();
  const { profile } = useProfile();
  const displayName = profile?.display_name ?? session?.name ?? "";
  // Personal code (managed students) and the prefixed landing path. The code
  // is display-only — it makes the role + student identity legible in the URL
  // and the badge; access is enforced by auth/RLS.
  const personalCode = profile?.login_code ?? null;
  const homePath = studentHomePath(personalCode);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const [helpOpen, setHelpOpen] = useState(false);
  const closeHelp = useCallback(() => setHelpOpen(false), []);

  // Linear-style desktop sidebar collapse (⌘B / Ctrl+B). State is per-user
  // and persisted to localStorage. Only visually applies at lg+ — narrower
  // breakpoints use the StudentMobileTabBar instead and don't render a
  // rail at all. The shortcut still binds at smaller sizes (state will
  // reflect when the user widens back to lg+).
  const userId = profile?.id ?? null;
  const [collapsed, setCollapsed] = useState<boolean>(() =>
    readSidebarCollapsed(userId),
  );
  // Re-hydrate from storage once we learn the actual user id (profile
  // loads async; first paint uses the pre-auth fallback key).
  useEffect(() => {
    if (userId) {
      setCollapsed(readSidebarCollapsed(userId));
    }
  }, [userId]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      writeSidebarCollapsed(userId, next);
      return next;
    });
  }, [userId]);

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

  // Global ⌘/Ctrl+K listener for opening the palette on every student
  // route, plus ⌘/Ctrl+B for the Linear-style sidebar toggle. ⌘B is
  // suppressed when focus is in an editable surface so it doesn't fight
  // the markdown editor's bold affordance or hijack a search field.
  // preventDefault() so the browser-level bookmarks-bar toggle stays
  // quiet (Firefox/Edge bind ⌘B / Ctrl+B by default).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        if (isEditableTarget(e.target)) return;
        e.preventDefault();
        toggleCollapsed();
        return;
      }
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (isEditableTarget(e.target)) return;
        e.preventDefault();
        setHelpOpen((v) => !v);
        return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleCollapsed]);

  return (
    <>
      <AccountUpgradeBanner upgradeAnonymousAccount={upgradeAnonymousAccount} />
      {/* Desktop (lg+): two-column shell with the collapsible left rail.
          Phone/tablet (< lg): no rail; the StudentMobileTabBar below
          handles navigation and we add bottom padding to keep content
          clear of the floating tab bar. */}
      <div className="lg:flex lg:min-h-screen">
        {/* Left rail — desktop only. Mobile/tablet keeps the existing
            StudentMobileTabBar (rendered below). */}
        <nav
          id="student-shell-sidebar"
          aria-label="Primary"
          className={[
            "hidden lg:flex sticky top-0 self-start h-screen flex-shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-4 flex-col gap-1 motion-safe:transition-[width] motion-safe:duration-150 motion-safe:ease-out",
            collapsed ? "lg:w-16 lg:px-2" : "lg:w-44",
          ].join(" ")}
        >
          <div
            className={[
              "px-2 pb-3 mb-2 border-b border-slate-100 dark:border-slate-800",
              collapsed ? "lg:hidden" : "",
            ].join(" ")}
          >
            <p
              aria-hidden={collapsed}
              className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate"
            >
              Student
            </p>
          </div>

          <NavLink
            to={homePath}
            title="Home"
            className={() =>
              railLinkClass({ isActive: isStudentHomeActive(location.pathname) })
            }
          >
            <RailIcon>
              <svg
                width={20}
                height={20}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 12 12 3l9 9" />
                <path d="M5 10v10h14V10" />
              </svg>
            </RailIcon>
            <span className={collapsed ? "lg:hidden" : undefined}>Home</span>
          </NavLink>

          <NavLink
            to={ROUTES.CALENDAR}
            className={railLinkClass}
            title="Calendar"
          >
            <RailIcon>
              <svg
                width={20}
                height={20}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x={3} y={4} width={18} height={17} rx={2} />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
            </RailIcon>
            <span className={collapsed ? "lg:hidden" : undefined}>
              Calendar
            </span>
          </NavLink>

          <NavLink to={ROUTES.STUDENT_INBOX} className={railLinkClass} title="Inbox">
            <RailIcon>
              <svg
                width={20}
                height={20}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 4h16v12H5.5L4 17.5z" />
                <path d="M8 9h8M8 13h5" />
              </svg>
            </RailIcon>
            <span className={collapsed ? "lg:hidden" : undefined}>Inbox</span>
          </NavLink>

          <NavLink
            to={ROUTES.STUDENT_ACCOUNT}
            title="Account"
            className={() =>
              railLinkClass({
                isActive: isAccountRouteActive(location.pathname),
              })
            }
          >
            <RailIcon>
              <svg
                width={20}
                height={20}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx={12} cy={8} r={4} />
                <path d="M4 21a8 8 0 0 1 16 0" />
              </svg>
            </RailIcon>
            <span className={collapsed ? "lg:hidden" : undefined}>Account</span>
          </NavLink>

          {/* Spacer pushes the collapse toggle to the bottom of the rail. */}
          <div className="flex-1" aria-hidden />

          {/* Desktop-only collapse toggle. Hidden below lg because the
              rail itself isn't rendered there. The shortcut still binds
              at smaller sizes — state simply reflects when the user
              widens back to lg+. */}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            aria-controls="student-shell-sidebar"
            title={collapsed ? "Expand sidebar (⌘B)" : "Collapse sidebar (⌘B)"}
            className="hidden lg:inline-flex items-center justify-center min-h-[40px] min-w-[40px] w-full rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 motion-safe:transition-all"
          >
            <svg
              aria-hidden
              width={18}
              height={18}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={[
                "motion-safe:transition-transform motion-safe:duration-150",
                collapsed ? "" : "rotate-180",
              ].join(" ")}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </nav>

        {/* Right pane. Bottom safe-area padding (env(safe-area-inset-bottom))
            plus the tab bar's ~64px height — phone-only so desktop stays
            unchanged. `min-w-0` so long content doesn't blow out the
            flex layout. */}
        <main className="flex-1 min-w-0 md:pb-0 pb-[calc(64px+env(safe-area-inset-bottom))]">
          <Outlet />
        </main>
      </div>
      <StudentBadge
        studentName={displayName}
        roleLabel="Student"
        personalCode={personalCode}
        inboxPath={ROUTES.STUDENT_INBOX}
        accountPath={ROUTES.STUDENT_ACCOUNT}
        onSwitchArea={() => {
          setArea(null);
          navigate(homePath);
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
      <ShortcutsHelp
        open={helpOpen}
        onClose={closeHelp}
        userRole={profile?.role ?? null}
      />
      <StudentMobileTabBar homePath={homePath} />
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
    to: ROUTES.STUDENT_HOME,
    label: "Home",
    match: (p) =>
      p === "/" || p === "" || p === ROUTES.STUDENT_HOME || p.startsWith(`${ROUTES.STUDENT_HOME}/`),
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
    to: ROUTES.CALENDAR,
    label: "Calendar",
    match: (p) => p.startsWith("/calendar"),
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
        <rect x={3} y={4} width={18} height={17} rx={2} />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    ),
  },
  {
    to: ROUTES.STUDENT_INBOX,
    label: "Inbox",
    match: (p) => p.startsWith(ROUTES.STUDENT_INBOX),
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
    to: ROUTES.STUDENT_ACCOUNT,
    label: "Account",
    match: (p) => p.startsWith(ROUTES.STUDENT_ACCOUNT),
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

function StudentMobileTabBar({ homePath }: { homePath: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <nav
      aria-label="Student sections"
      className="md:hidden fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)] print:hidden"
    >
      {STUDENT_TABS.map((tab) => {
        const active = tab.match(location.pathname);
        // Home routes to the (possibly code-prefixed) landing; others are static.
        const to = tab.label === "Home" ? homePath : tab.to;
        return (
          <button
            key={tab.to}
            type="button"
            onClick={() => navigate(to)}
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
