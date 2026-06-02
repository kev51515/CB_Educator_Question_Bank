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
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ROUTES } from "../lib/routes";
import { StudentBadge } from "./StudentBadge";
import { NotificationBell } from "../notifications";
import { AccountUpgradeBanner } from "./AccountUpgradeBanner";
import { useStudentSession } from "./session";
import { useProfile } from "../lib/profile";
import { CommandPalette, type Command } from "../components/CommandPalette";
import { ShortcutHelpOverlay } from "../components/ShortcutHelpOverlay";
import { useLmsCommands } from "../lib/lmsCommands";

/**
 * localStorage key for the staff-level ⌘K palette "recent commands" stack.
 * Keyed at app-level (not per-user) because the staff shell only ever
 * mounts after auth, and the rail itself is per-session — the same browser
 * profile == the same user for this surface.
 */
const RECENT_COMMANDS_KEY = "staff.cmdpalette.recent";
const RECENT_COMMANDS_CAP = 8;

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
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <AccountUpgradeBanner upgradeAnonymousAccount={upgradeAnonymousAccount} />

      <div className="flex">
        {/* Left rail */}
        <nav
          aria-label="Primary"
          className="sticky top-0 self-start h-screen flex-shrink-0 w-20 md:w-44 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 md:px-3 py-4 flex flex-col gap-1"
        >
          <div className="px-2 pb-3 mb-2 border-b border-slate-100 dark:border-slate-800 hidden md:block">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              Educator
            </p>
          </div>

          <NavLink to={ROUTES.DASHBOARD} className={railLinkClass}>
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
            <span>Dashboard</span>
          </NavLink>

          <NavLink to={ROUTES.COURSES} className={railLinkClass}>
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
            <span>Courses</span>
          </NavLink>

          <NavLink to={ROUTES.QUESTION_BANK} className={railLinkClass}>
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
            <span>Question Bank</span>
          </NavLink>

          <NavLink to={ROUTES.QBANK_LOG} className={railLinkClass}>
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
            <span>Submissions</span>
          </NavLink>

          <NavLink to={ROUTES.TESTS_ADMIN} className={railLinkClass}>
            <RailIcon>
              {/* Document-with-check — full-length test review/QA. */}
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
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
                <path d="m9 15 2 2 4-4" />
              </svg>
            </RailIcon>
            <span>Tests</span>
          </NavLink>

          <NavLink to={ROUTES.CALENDAR} className={railLinkClass}>
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
            <span>Calendar</span>
          </NavLink>

          <NavLink to={ROUTES.INBOX} className={railLinkClass}>
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
            <span>Inbox</span>
          </NavLink>

          <NavLink
            to={ROUTES.ACCOUNT}
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
            <span>Account</span>
          </NavLink>
        </nav>

        {/* Right pane */}
        <main className="flex-1 min-w-0">
          <Outlet />
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

      {/* Global keyboard-shortcut help overlay (`?` to open). */}
      <ShortcutHelpOverlay open={helpOpen} onClose={closeHelp} />
    </div>
  );
}
