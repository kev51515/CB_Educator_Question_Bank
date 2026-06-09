/**
 * AuthGate
 * ========
 * Orchestrator. Owns the auth/profile lifecycle and declares the URL routing
 * table for the entire app. State → URL: each surface has a real path so
 * refresh-survives-state, deep-links, and the back button all work.
 *
 * Route map (also exported from `lib/routes.ts`):
 *
 *   Unauthenticated:
 *     /signin               → AuthScreen
 *     /quick-start          → QuickStartScreen
 *     anything else         → redirect to /signin
 *
 *   PASSWORD_RECOVERY (highest priority — wins over everything):
 *     any URL               → PasswordResetScreen
 *
 *   Authenticated, role = "student":
 *     (inside StudentShell — overlays only)
 *     /                     → AreaSelector (welcome + assignments + classes)
 *     /practice             → Question Bank (legacy main viewer, passed
 *                              from main.tsx as children)
 *     /mock-test            → MockTestApp (free practice)
 *     /assignment/:id/take  → AssignmentRunner
 *     /assignment/:id/review/:attemptId
 *                           → StudentAttemptReview
 *     /account/*            → AccountRoutes (settings; admin tabs hidden)
 *     anything else         → redirect to /
 *
 *   Authenticated, role = "teacher" or "admin":
 *     (inside StaffShell — Canvas-style left rail)
 *     /                     → redirect to /dashboard
 *     /dashboard            → DashboardPage (course-cards grid)
 *     /courses              → AllClassesView
 *     /courses/:courseId/*  → ClassLayout (owned by another agent)
 *     /account/*            → AccountRoutes (settings + admin sub-nav)
 *     anything else         → redirect to /dashboard
 *
 * Per migration 0009, teacher and admin share the same surface — privilege
 * differences (e.g. who can mint invite codes) live below this layer.
 */
import { lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import { CommandPalette } from "@/components/CommandPalette";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { useStudentSession } from "./session";
import { useProfile } from "@/lib/profile";
import { useViewAs, ViewAsBanner } from "./viewAs";
import { AuthScreen } from "./AuthScreen";
import { QuickStartScreen } from "./QuickStartScreen";
import { PasswordResetScreen } from "./PasswordResetScreen";
import { ROUTES } from "@/lib/routes";
import { supabase } from "@/lib/supabase";
import type { AccountContext } from "./routeTreeTypes";

// Code-split surface trees: the teacher console (StaffRoutesTree) and the
// student surfaces + test runner (StudentRoutesTree) each load as their own
// async chunk, so a session only downloads the role it actually uses.
const StaffRoutesTree = lazy(() => import("./StaffRoutesTree"));
const StudentRoutesTree = lazy(() => import("./StudentRoutesTree"));

interface AuthGateProps {
  children: ReactNode;
}

/**
 * Read a `code=` parameter from either the URL query string or hash. We
 * uppercase + strip whitespace because join codes are stored uppercased
 * server-side. Returns "" when no code is present so callers can use the
 * result directly as an input default.
 */
function getPrefillCode(): string {
  if (typeof window === "undefined") return "";
  const query = new URLSearchParams(window.location.search).get("code");
  const hash = new URLSearchParams(
    window.location.hash.replace(/^#/, ""),
  ).get("code");
  const raw = query ?? hash ?? "";
  return raw.replace(/\s+/g, "").toUpperCase();
}

function hasCodeInUrl(): boolean {
  return getPrefillCode().length > 0;
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-sky-100 dark:from-slate-900 dark:via-slate-950 dark:to-indigo-950 text-slate-500 dark:text-slate-400 text-sm">
      Loading…
    </div>
  );
}

interface ProfileErrorProps {
  message: string;
  onRetry: () => void;
  onSignOut: () => void;
}

function ProfileError({ message, onRetry, onSignOut }: ProfileErrorProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-sky-100 dark:from-slate-900 dark:via-slate-950 dark:to-indigo-950 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 shadow-xl p-6 space-y-4 text-center">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Couldn't load your profile
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">{message}</p>
        <div className="flex items-center justify-center gap-2 pt-1">
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 text-sm font-medium px-4 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Public (unauthenticated) routes. Code-entry is the primary path: any
 * unmatched URL lands on /quick-start so first-time students don't have
 * to know what an email + password is. The /signin tab is still one
 * click away from QuickStartScreen for returning users (and for
 * educators, who do need email+password). `hasCodeInUrl()` is retained
 * (and still relevant in QuickStartScreen for the QR-deeplink prefill).
 */
function PublicRoutes({
  signInWithPassword,
  signUp,
  requestPasswordReset,
}: {
  signInWithPassword: ReturnType<typeof useStudentSession>["signInWithPassword"];
  signUp: ReturnType<typeof useStudentSession>["signUp"];
  requestPasswordReset: ReturnType<typeof useStudentSession>["requestPasswordReset"];
}) {
  const navigate = useNavigate();
  const [defaultPath] = useState(() => ROUTES.QUICK_START);

  return (
    <Routes>
      <Route
        path={ROUTES.SIGN_IN}
        element={
          <AuthScreen
            signInWithPassword={signInWithPassword}
            signUp={signUp}
            requestPasswordReset={requestPasswordReset}
            onSwitchToQuickStart={() => navigate(ROUTES.QUICK_START)}
          />
        }
      />
      <Route
        path={ROUTES.QUICK_START}
        element={
          <QuickStartScreen
            prefillCode={getPrefillCode()}
            onSwitchToSignIn={(role) =>
              navigate(role ? `${ROUTES.SIGN_IN}?role=${role}` : ROUTES.SIGN_IN)
            }
          />
        }
      />
      <Route path="*" element={<Navigate to={defaultPath} replace />} />
    </Routes>
  );
}


/**
 * E2E shell used only when `VITE_E2E_BYPASS_AUTH=1`. Mirrors the small subset
 * of `StudentShell` that real users get — currently just the global ⌘/Ctrl+K
 * command-palette listener — so tests that exercise shell-level shortcuts
 * keep working without spinning up the full Supabase session machinery.
 */
function E2EBypassShell({ children }: { children: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
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
      {children}
      <CommandPalette
        open={paletteOpen}
        onClose={closePalette}
        index={[]}
        recentIds={[]}
        commands={[]}
        onPickQuestion={closePalette}
      />
    </>
  );
}

export function AuthGate({ children }: AuthGateProps) {
  // E2E test bypass: when the dev server is launched by Playwright with
  // VITE_E2E_BYPASS_AUTH=1, render the bank directly so tests don't have
  // to spin up a real Supabase session. Never set in production builds.
  //
  // This guard lives in a hook-free wrapper that delegates to AuthGateImpl.
  // Keeping it out of the component that owns the auth hooks means the bypass
  // path never changes the hook order of the real gate (rules-of-hooks) — and
  // the heavy useStudentSession/useProfile hooks don't run at all under bypass.
  if (import.meta.env.VITE_E2E_BYPASS_AUTH === "1") {
    return <E2EBypassShell>{children}</E2EBypassShell>;
  }
  return <AuthGateImpl />;
}

function AuthGateImpl() {
  const {
    session,
    loading,
    signInWithPassword,
    signUp,
    signOut,
    requestPasswordReset,
    updateDisplayName,
    updatePassword,
  } = useStudentSession();
  const { profile, loading: profileLoading, error: profileError, refresh } =
    useProfile();
  // Admin "view as" preview (no-op for non-admins). Read unconditionally here so
  // the hook order is stable across the early returns below.
  const viewAs = useViewAs();

  // Track whether we're currently inside a Supabase PASSWORD_RECOVERY window.
  // We listen to the auth event rather than ?reset=1 because the event is
  // the canonical signal (URL params can be stripped, refreshed, etc.).
  const [passwordResetActive, setPasswordResetActive] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setPasswordResetActive(true);
      }
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  // Once the session lands (anonymous or otherwise), strip the ?code= from
  // the URL so a refresh post-enrollment doesn't bounce the user back into
  // quickstart mode.
  useEffect(() => {
    if (!session) return;
    if (typeof window === "undefined") return;
    if (!hasCodeInUrl()) return;
    window.history.replaceState(null, "", window.location.pathname);
  }, [session]);

  if (loading) return <LoadingScreen />;

  if (passwordResetActive) {
    return (
      <PasswordResetScreen
        updatePassword={updatePassword}
        onComplete={() => {
          if (typeof window !== "undefined") {
            window.history.replaceState(null, "", window.location.pathname);
          }
          setPasswordResetActive(false);
        }}
      />
    );
  }

  if (!session) {
    return (
      <PublicRoutes
        signInWithPassword={signInWithPassword}
        signUp={signUp}
        requestPasswordReset={requestPasswordReset}
      />
    );
  }

  // Auth session lives, but the profiles row hasn't loaded yet.
  if (profileLoading) return <LoadingScreen />;

  if (profileError || !profile) {
    return (
      <ProfileError
        message={profileError ?? "Profile not found."}
        onRetry={() => void refresh()}
        onSignOut={signOut}
      />
    );
  }

  // An admin can preview the educator/student experience; everyone else renders
  // their real role. effectiveRole drives which surface tree mounts.
  const effectiveRole =
    profile.role === "admin" && viewAs ? viewAs : profile.role;
  const isStaff = effectiveRole === "teacher" || effectiveRole === "admin";
  const account: AccountContext = {
    profile,
    email: session.email,
    updateDisplayName,
    updatePassword,
    onSignOut: signOut,
  };

  return (
    <Suspense fallback={<LoadingScreen />}>
      <ViewAsBanner />
      {isStaff ? (
        <StaffRoutesTree account={account} />
      ) : (
        <StudentRoutesTree studentId={session.userId} account={account} />
      )}
    </Suspense>
  );
}
