/**
 * StaffShell
 * ==========
 * Canvas-style layout chrome for the staff (teacher / admin) surface.
 * Renders a vertical icon+label left rail (Dashboard / Courses / Account)
 * plus an `<Outlet />` for whichever child route the router picked.
 *
 * The rail is collapsed to a slim icon-only column on narrow screens, then
 * expanded once we have horizontal room. Selection state lives in the URL
 * (via NavLink's `isActive`); no internal `useState`.
 *
 * The shell also mounts the overlay widgets (StudentBadge, AccountUpgradeBanner)
 * so the student/staff shells stay DRY.
 */
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Breadcrumbs, BreadcrumbProvider } from "@/components";
import { ROUTES } from "@/lib/routes";
import { StudentBadge } from "./StudentBadge";
import { NotificationBell } from "@/notifications";
import { AccountUpgradeBanner } from "./AccountUpgradeBanner";
import { useStudentSession } from "./session";
import { useProfile } from "@/lib/profile";
import { CommandPalette, type Command } from "@/components/CommandPalette";
import { ShortcutsHelp } from "@/components/ShortcutsHelp";
import { useLmsCommands } from "@/lib/lmsCommands";

/**
 * localStorage key for the staff-level ⌘K palette "recent commands" stack.
 * Keyed at app-level (not per-user) because the staff shell only ever
 * mounts after auth, and the rail itself is per-session — the same browser
 * profile == the same user for this surface.
 */
const RECENT_COMMANDS_KEY = "staff.cmdpalette.recent";
const RECENT_COMMANDS_CAP = 8;

/**
 * Per-user localStorage key prefix for the Linear-style desktop sidebar
 * collapse state. We key by user id so two teachers sharing a browser
 * profile (rare but real — kiosk machines in some schools) don't clobber
 * each other's layout preference. Falls back to a shared key when no user
 * id is available (pre-auth flicker window).
 */
const SIDEBAR_COLLAPSED_KEY_PREFIX = "staff.shell.sidebarCollapsed:";

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

function readRecentCommandIds(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_COMMANDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v): v is string => typeof v === "string")
      .slice(0, RECENT_COMMANDS_CAP);
  } catch {
    return [];
  }
}

function writeRecentCommandIds(ids: readonly string[]): void {
  try {
    window.localStorage.setItem(
      RECENT_COMMANDS_KEY,
      JSON.stringify(ids.slice(0, RECENT_COMMANDS_CAP)),
    );
  } catch {
    // ignore (private mode, quota)
  }
}

/**
 * Returns true when focus is currently in an editable surface (input, textarea,
 * or contenteditable). Used to suppress shortcut keys like `?` while the user
 * is typing — otherwise pressing Shift+/ inside a search box would silently
 * pop the help overlay on top of their query.
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
    "flex flex-col md:flex-row items-center md:items-center gap-1 md:gap-3 px-2 md:px-3 py-3 min-h-[44px] rounded-lg text-xs md:text-sm font-medium transition-colors w-full",
    isActive
      ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-200 ring-1 ring-indigo-200 dark:ring-indigo-900"
      : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800",
  ].join(" ");
}


/**
 * Heuristic: a path "matches" /account when it starts with /account/. We
 * rely on this for the Account rail item's active state instead of NavLink's
 * built-in match (which would only highlight on an exact /account hit).
 */
function isAccountRouteActive(pathname: string): boolean {
  return pathname === ROUTES.ACCOUNT || pathname.startsWith(`${ROUTES.ACCOUNT}/`);
}

export function StaffShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, signOut, setArea } = useStudentSession();
  const { profile } = useProfile();
  const { upgradeAnonymousAccount } = useStudentSession();

  const displayName = profile?.display_name ?? session?.name ?? "";

  const [paletteOpen, setPaletteOpen] = useState(false);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  const [helpOpen, setHelpOpen] = useState(false);
  const closeHelp = useCallback(() => setHelpOpen(false), []);

  // Linear-style desktop sidebar collapse (⌘B / Ctrl+B). State is per-user
  // and persisted to localStorage. Only visually applies at lg+ — narrower
  // breakpoints keep the existing responsive rail behavior (w-20 → md:w-44),
  // and the shortcut is gated on those screens to avoid invisible toggles
  // (state still updates, will reflect when user resizes back to wide).
  const userId = profile?.id ?? null;
  const [collapsed, setCollapsed] = useState<boolean>(() =>
    readSidebarCollapsed(userId),
  );
  // Re-hydrate from storage once we learn the actual user id (profile loads
  // async; first paint uses the pre-auth fallback key).
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

  // Build the LMS command list (nav + per-course tabs + staff quick-create).
  // The CommandPalette also merges these internally as a fallback, but we
  // wire them through props here so the StaffShell owns the registry source
  // of truth and can intercept `run` to bookkeep a "recents" stack.
  // NOTE (next add): quick-search across student and course names is not
  // wired in this lane — those entries should be appended to `wrappedCommands`
  // once a roster-aware lookup is available.
  const lmsCommands = useLmsCommands();

  // Recent command ids — last 8, dedup'd, persisted to localStorage. We
  // intercept each command's `run` to prepend its id when it fires.
  const [recentIds, setRecentIds] = useState<string[]>(() =>
    readRecentCommandIds(),
  );

  const recordRecent = useCallback((id: string): void => {
    setRecentIds((prev) => {
      const next = [id, ...prev.filter((existing) => existing !== id)].slice(
        0,
        RECENT_COMMANDS_CAP,
      );
      writeRecentCommandIds(next);
      return next;
    });
  }, []);

  const wrappedCommands = useMemo<Command[]>(
    () =>
      lmsCommands.map((cmd) => ({
        ...cmd,
        run: () => {
          recordRecent(cmd.id);
          cmd.run();
        },
      })),
    [lmsCommands, recordRecent],
  );

  // Global ⌘/Ctrl+K listener for opening the palette on every staff route,
  // plus the `?` (Shift+/) shortcut for the keyboard-shortcut overlay. We
  // ignore `?` when focus is in an editable surface so it doesn't hijack
  // legitimate typing.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
        return;
      }
      // ⌘B / Ctrl+B — Linear-style sidebar toggle. Suppress when focus is in
      // an editable surface so we don't fight find-in-page, bookmarks bar
      // toggle in Firefox/Edge (which fires on the same combo), or in-app
      // bold-text affordances inside the markdown editor. preventDefault()
      // so the browser-level bookmarks bar toggle stays quiet.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        if (isEditableTarget(e.target)) return;
        e.preventDefault();
        toggleCollapsed();
        return;
      }
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (isEditableTarget(e.target)) return;
        e.preventDefault();
        // Toggle so a second ? press closes the overlay, matching the
        // overlay's own "Press ? from anywhere to reopen" copy.
        setHelpOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleCollapsed]);

  // Publish the breadcrumb bar's height to descendants so page-level sticky
  // headers + full-height panes can offset themselves beneath it
  // (`top-[var(--app-chrome-top,0px)]` / `h-[calc(100vh-var(--app-chrome-top,0px))]`).
  const contentStyle = {
    "--app-chrome-top": "3rem",
  } as CSSProperties;

  return (
    <BreadcrumbProvider>
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <AccountUpgradeBanner upgradeAnonymousAccount={upgradeAnonymousAccount} />

      <div className="flex">
        {/* Left rail */}
        <nav
          id="staff-shell-sidebar"
          aria-label="Primary"
          className={[
            "sticky top-0 self-start h-screen flex-shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 md:px-3 py-4 flex flex-col gap-1 motion-safe:transition-[width] motion-safe:duration-150 motion-safe:ease-out",
            // Mobile + tablet: existing responsive behavior preserved.
            // Desktop (lg+): toggleable between ~16 (64px) and 44 (176px).
            "w-20 md:w-44",
            collapsed ? "lg:w-16 lg:px-2" : "lg:w-44",
          ].join(" ")}
        >
          <div
            className={[
              "px-2 pb-3 mb-2 border-b border-slate-100 dark:border-slate-800 hidden md:block",
              collapsed ? "lg:hidden" : "",
            ].join(" ")}
          >
            <p
              aria-hidden={collapsed}
              className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate"
            >
              Educator
            </p>
          </div>

          <NavLink to={ROUTES.DASHBOARD} className={railLinkClass} title="Dashboard">
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
                <rect x={3} y={3} width={7} height={9} rx={1} />
                <rect x={14} y={3} width={7} height={5} rx={1} />
                <rect x={14} y={12} width={7} height={9} rx={1} />
                <rect x={3} y={16} width={7} height={5} rx={1} />
              </svg>
            </RailIcon>
            <span className={collapsed ? "lg:hidden" : undefined}>
              Dashboard
            </span>
          </NavLink>

          <NavLink to={ROUTES.COURSES} className={railLinkClass} title="Courses">
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
                <path d="M4 19V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14" />
                <path d="M4 19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2" />
                <path d="M8 7h8M8 11h8M8 15h5" />
              </svg>
            </RailIcon>
            <span className={collapsed ? "lg:hidden" : undefined}>Courses</span>
          </NavLink>

          <NavLink
            to={ROUTES.QUESTION_BANK}
            className={railLinkClass}
            title="Question Bank"
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
                <path d="M2 4a2 2 0 0 1 2-2h6.5a2 2 0 0 1 2 2v16a2 2 0 0 0-2-2H2z" />
                <path d="M22 4a2 2 0 0 0-2-2h-6.5a2 2 0 0 0-2 2v16a2 2 0 0 1 2-2H22z" />
              </svg>
            </RailIcon>
            <span className={collapsed ? "lg:hidden" : undefined}>
              Question Bank
            </span>
          </NavLink>

          <NavLink
            to={ROUTES.QBANK_LOG}
            className={railLinkClass}
            title="Submissions"
          >
            <RailIcon>
              {/* List-with-checkmark — matches the "audit log of attempts"
                  semantics. Kept stroke-based to share the rail's visual
                  weight with the other icons. */}
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
                <path d="M9 6h11M9 12h11M9 18h11" />
                <path d="M3 6l1.5 1.5L7 5" />
                <path d="M3 12l1.5 1.5L7 11" />
                <path d="M3 18l1.5 1.5L7 17" />
              </svg>
            </RailIcon>
            <span className={collapsed ? "lg:hidden" : undefined}>
              Submissions
            </span>
          </NavLink>

          {/* "Tests" nav removed — full-length tests now live under the
              Question Bank → "Full-Test" tab (unified tests surface). The
              /tests/:slug/review route stays for the "Review answer key" link. */}

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
            <span className={collapsed ? "lg:hidden" : undefined}>Calendar</span>
          </NavLink>

          <NavLink to={ROUTES.INBOX} className={railLinkClass} title="Inbox">
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
            to={ROUTES.ACCOUNT}
            title="Account"
            className={() =>
              railLinkClass({ isActive: isAccountRouteActive(location.pathname) })
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

          {/* Desktop-only collapse toggle. Hidden below lg because the rail
              has no width state to toggle there (responsive icon-only / md
              expanded). The shortcut still binds at smaller sizes — see the
              keydown effect above. */}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            aria-controls="staff-shell-sidebar"
            title={
              collapsed
                ? "Expand sidebar (⌘B)"
                : "Collapse sidebar (⌘B)"
            }
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

        {/* Right pane */}
        <main className="flex-1 min-w-0 flex flex-col" style={contentStyle}>
          <Breadcrumbs />
          <div className="flex-1 min-w-0">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Floating notification bell — paired with the StudentBadge */}
      <div className="fixed bottom-3 right-44 z-50 print:hidden">
        <NotificationBell />
      </div>

      {/* Floating badge in lower-right corner; for staff we hide "Switch area" */}
      <StudentBadge
        studentName={displayName}
        onSwitchArea={() => {
          setArea(null);
          navigate(ROUTES.HOME);
        }}
        onSignOut={signOut}
        showSwitchArea={false}
      />

      {/* Global ⌘/Ctrl+K command palette. We pass the LMS command registry
          (nav + per-course tabs + staff quick-create) explicitly so the
          shell owns the source of truth, including the "recents" bookkeeping
          stored under `staff.cmdpalette.recent`. Question-bank index is
          empty because the staff shell has no question-bank context — the
          palette already merges /practice-scoped bank commands internally
          via `useBankCommands()`. `recentIds` here is a list of *command*
          ids (not question ids); the palette only resolves them as
          "Recent" question rows when it can find them in `index`, so an
          empty index simply means staff-level recents drive the in-palette
          dedupe + ordering for commands but don't surface as a "Recent"
          group of questions. */}
      <CommandPalette
        open={paletteOpen}
        onClose={closePalette}
        index={[]}
        recentIds={recentIds}
        commands={wrappedCommands}
        onPickQuestion={closePalette}
      />

      {/* Global keyboard-shortcut help overlay (`?` to open). Role gates the
          staff-only sections (Inside Courses ⌘N quick-create, Modules drag). */}
      <ShortcutsHelp
        open={helpOpen}
        onClose={closeHelp}
        userRole={profile?.role ?? null}
      />
    </div>
    </BreadcrumbProvider>
  );
}
