/**
 * AuthScreen
 * ==========
 * First screen unauthenticated users see — a two-pane editorial sign-in.
 * LEFT (lg+): an ink brand panel. RIGHT: the auth card with an Educator /
 * Student toggle, email+password sign-in, a "Create account" tab, and a
 * password reset sub-mode.
 *
 * Purely presentational + form state; the actual auth calls come in as props
 * from `useStudentSession`.
 *
 * On successful signUp, we don't auto-route; if Supabase returns a live
 * session the AuthGate will move on by itself. Otherwise (email confirmation
 * required, or signup-only flow) we flip to the Sign in tab and show a notice.
 *
 * Teacher signups require an admin-minted invite code. The code is sent to
 * the session.signUp() function which redeems it server-side after the auth
 * user is created. If the redemption fails, session.signUp signs the user
 * out and returns an error — see session.ts for the full flow.
 *
 * NOTE: no seed/demo credentials are surfaced on this screen — both the
 * educator (admin) and student seed logins were intentionally removed so
 * nothing is exposed publicly. Seed accounts live only in the seed scripts.
 *
 * Type: Fraunces (display serif) + Hanken Grotesk (UI) — loaded in index.html.
 */
import { useEffect, useRef, useState } from "react";
import type { AuthResult, SignUpRole } from "./session";
import {
  ROLE_LABELS,
  SANS,
  serif,
  cleanError,
  resolveLoginEmail,
  Wordmark,
  AuthKeyframes,
  BrandPanel,
  inputCls,
  labelCls,
  primaryBtn,
  type Tab,
  type SignInMode,
  type SignInRole,
} from "./authScreenHelpers";

interface AuthScreenProps {
  signInWithPassword: (email: string, password: string) => Promise<AuthResult>;
  signUp: (
    email: string,
    password: string,
    displayName: string,
    role: SignUpRole,
    teacherInviteCode?: string,
  ) => Promise<AuthResult>;
  requestPasswordReset: (email: string) => Promise<AuthResult>;
  onSwitchToQuickStart: () => void;
}

export function AuthScreen({
  signInWithPassword,
  requestPasswordReset,
  onSwitchToQuickStart,
}: AuthScreenProps) {
  const [tab, setTab] = useState<Tab>("signin");
  const [signInMode, setSignInMode] = useState<SignInMode>("password");

  // Sign-in fields. Initial role honours a `?role=student|educator` hint from
  // the QuickStart "Student / Educator sign-in" cards (defaults to student).
  const [signInRole, setSignInRole] = useState<SignInRole>(() => {
    if (typeof window === "undefined") return "student";
    return new URLSearchParams(window.location.search).get("role") === "educator"
      ? "educator"
      : "student";
  });
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");

  // Password-reset fields
  const [resetEmail, setResetEmail] = useState("");


  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signInEmailRef = useRef<HTMLInputElement | null>(null);
  const resetEmailRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (signInMode === "reset") resetEmailRef.current?.focus();
    else signInEmailRef.current?.focus();
    setError(null);
  }, [tab, signInMode]);

  // QR / deep-link prefill: a teacher-shared student login link arrives as
  // `?login=<code>&key=<password>`. Pre-fill the Student-role form and strip
  // the (sensitive) params from the address bar. We do NOT auto-submit — the
  // student taps "Sign in" so a shared/projected screen never logs someone in
  // unattended.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const login = sp.get("login");
    const key = sp.get("key");
    if (!login) return;
    setTab("signin");
    setSignInMode("password");
    setSignInRole("student");
    setSignInEmail(login);
    if (key) setSignInPassword(key);
    setNotice("Scanned your login — just tap Sign in.");
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const onSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!signInEmail.trim() || !signInPassword) {
      setError(
        signInRole === "student"
          ? "Please enter your student code and password."
          : "Please enter your email and password.",
      );
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await signInWithPassword(
        resolveLoginEmail(signInRole, signInEmail),
        signInPassword,
      );
      if (err) setError(cleanError(err));
    } finally {
      setBusy(false);
    }
  };

  const onResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!resetEmail.trim()) {
      setError("Please enter the email associated with your account.");
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await requestPasswordReset(resetEmail.trim());
      if (err) {
        setError(cleanError(err));
        return;
      }
      setNotice(
        "Check your email for a reset link. If you don't see it within a few minutes, check your spam folder.",
      );
    } finally {
      setBusy(false);
    }
  };

  // ---- presentational classes ---------------------------------------------
  // inputCls / labelCls / primaryBtn are shared with QuickStartScreen — see
  // authScreenHelpers. tabCls / segBtn are auth-only.
  const tabCls = (active: boolean) =>
    `-mb-px border-b-2 pb-2.5 text-sm font-medium transition-colors focus:outline-none ${
      active
        ? "border-stone-900 text-stone-900 dark:border-stone-100 dark:text-stone-100"
        : "border-transparent text-stone-400 hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300"
    }`;
  const segBtn = (active: boolean) =>
    `rounded-[10px] px-3 py-2 text-sm transition ${
      active
        ? "bg-white font-semibold text-stone-900 shadow-sm ring-1 ring-stone-900/5 dark:bg-stone-100 dark:text-stone-900"
        : "font-medium text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"
    }`;

  return (
    <div
      className="relative min-h-screen w-full bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100 lg:grid lg:grid-cols-[1.1fr_1fr]"
      style={{ fontFamily: SANS }}
    >
      <AuthKeyframes />

      {/* ───────────────── LEFT · brand panel (lg+) ───────────────── */}
      <BrandPanel
        eyebrow="Teaching & college counseling"
        title="One platform,"
        titleAccent="class to college."
        lead="OmniLMS brings classes and college counseling together — modules and full-length tests, skill mastery, plus college lists, applications, and advising."
        steps={[
          { n: "01", title: "Classes & tests", blurb: "Modules, assignments, full-length Bluebook-style tests." },
          { n: "02", title: "Skill mastery", blurb: "Every question mapped to a skill, with insights." },
          { n: "03", title: "College counseling", blurb: "College lists, applications, tasks, advising." },
        ]}
      />

      {/* ───────────────── RIGHT · auth card ───────────────── */}
      <main className="relative flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
        <div
          className="w-full max-w-[26rem] auth-reveal"
          aria-labelledby="auth-title"
          style={{ animationDelay: "60ms" }}
        >
          {/* compact wordmark for mobile (brand panel hidden) */}
          <div className="mb-8 lg:hidden">
            <Wordmark tone="light" />
          </div>

          <header className="mb-7">
            <h1
              id="auth-title"
              className="text-[1.95rem] font-medium leading-tight tracking-tight text-stone-900 dark:text-stone-100"
              style={serif}
            >
              {tab === "signin"
                ? `${ROLE_LABELS[signInRole]} sign-in`
                : "Educator sign-up"}
            </h1>
            <p className="mt-1.5 text-sm text-stone-500 dark:text-stone-400">
              {tab === "signin"
                ? signInMode === "reset"
                  ? "Enter your email and we'll send you a reset link."
                  : "Welcome back — pick your role and sign in."
                : "Accounts are invitation-only — here's how to get one."}
            </p>
          </header>

          {/* tabs */}
          <div
            role="tablist"
            aria-label="Authentication mode"
            className="mb-6 flex gap-7 border-b border-stone-200 dark:border-white/10"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === "signin"}
              onClick={() => {
                setTab("signin");
                setSignInMode("password");
              }}
              className={tabCls(tab === "signin")}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "signup"}
              onClick={() => setTab("signup")}
              className={tabCls(tab === "signup")}
            >
              Educator sign-up
            </button>
          </div>

          {notice && (
            <div
              role="status"
              className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
            >
              {notice}
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
            >
              {error}
            </div>
          )}

          {/* role toggle */}
          {tab === "signin" && signInMode === "password" && (
            <div
              role="radiogroup"
              aria-label="Sign in as"
              className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1 dark:bg-white/5"
            >
              {(["student", "educator"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={signInRole === value}
                  onClick={() => {
                    setSignInRole(value);
                    setError(null);
                    setNotice(null);
                  }}
                  className={segBtn(signInRole === value)}
                >
                  {ROLE_LABELS[value]} login
                </button>
              ))}
            </div>
          )}

          {/* sign-in form */}
          {tab === "signin" && signInMode === "password" && (
            <form onSubmit={onSignInSubmit} className="space-y-4">
              <label className="block">
                <span className={labelCls}>
                  {signInRole === "student" ? "Student code" : "Email"}
                </span>
                <input
                  ref={signInEmailRef}
                  type={signInRole === "student" ? "text" : "email"}
                  value={signInEmail}
                  onChange={(e) => setSignInEmail(e.target.value)}
                  autoComplete={signInRole === "student" ? "username" : "email"}
                  spellCheck={signInRole === "student" ? false : undefined}
                  className={
                    signInRole === "student"
                      ? `${inputCls} font-mono tracking-wide`
                      : inputCls
                  }
                  placeholder={
                    signInRole === "student" ? "e.g. ABCDEF-04" : "you@example.com"
                  }
                />
                {signInRole === "student" && (
                  <span className="mt-1 block text-xs text-stone-500 dark:text-stone-400">
                    The login code your teacher gave you (e.g. ABCDEF-04).
                    Scanned a QR? It fills this in automatically.
                  </span>
                )}
              </label>
              <label className="block">
                <span className={labelCls}>Password</span>
                <input
                  type="password"
                  value={signInPassword}
                  onChange={(e) => setSignInPassword(e.target.value)}
                  autoComplete="current-password"
                  className={inputCls}
                  placeholder="••••••••"
                />
              </label>
              {signInRole === "educator" ? (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setResetEmail(signInEmail);
                      setSignInMode("reset");
                      setError(null);
                      setNotice(null);
                    }}
                    className="text-xs font-medium text-stone-500 transition hover:text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/30 rounded dark:text-stone-400 dark:hover:text-stone-100"
                  >
                    Forgot password?
                  </button>
                </div>
              ) : (
                <p className="text-right text-xs text-stone-400 dark:text-stone-500">
                  Forgot your password? Ask your teacher to reset it.
                </p>
              )}
              <button type="submit" disabled={busy} className={primaryBtn}>
                {busy ? "Signing in…" : "Sign in"}
              </button>
            </form>
          )}


          {/* password reset */}
          {tab === "signin" && signInMode === "reset" && (
            <form onSubmit={onResetSubmit} className="space-y-4">
              <label className="block">
                <span className={labelCls}>Email</span>
                <input
                  ref={resetEmailRef}
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  autoComplete="email"
                  className={inputCls}
                  placeholder="you@example.com"
                />
              </label>
              <button type="submit" disabled={busy} className={primaryBtn}>
                {busy ? "Sending…" : "Send reset link"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSignInMode("password");
                  setError(null);
                  setNotice(null);
                }}
                className="block w-full text-center text-xs font-medium text-stone-500 transition hover:text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/30 rounded dark:text-stone-400 dark:hover:text-stone-100"
              >
                ← Back to sign in
              </button>
            </form>
          )}

          {/* sign-up: invitation-only — educators are provisioned by an admin,
              students join with a class code. No self-service account creation. */}
          {tab === "signup" && (
            <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-4 dark:border-white/10 dark:bg-white/[0.03]">
              <p className="text-sm font-medium text-stone-800 dark:text-stone-100">
                Accounts are invitation-only.
              </p>
              <ul className="mt-2 space-y-1.5 text-sm text-stone-600 dark:text-stone-400">
                <li>
                  <span className="font-medium text-stone-700 dark:text-stone-200">Educators</span> — ask an
                  admin to create your account, then sign in above with your email + password.
                </li>
                <li>
                  <span className="font-medium text-stone-700 dark:text-stone-200">Students</span> — use{" "}
                  <span className="font-medium">Join with a class code</span> below (your teacher gives you a code).
                </li>
              </ul>
            </div>
          )}

          {/* prominent alternative entry — class / QR code, no password needed.
              Hidden only during password-reset so it never competes with that
              focused flow. */}
          {!(tab === "signin" && signInMode === "reset") && (
            <div className="mt-6">
              <div className="mb-4 flex items-center gap-3" aria-hidden>
                <span className="h-px flex-1 bg-stone-200 dark:bg-white/10" />
                <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-stone-400 dark:text-stone-500">
                  or
                </span>
                <span className="h-px flex-1 bg-stone-200 dark:bg-white/10" />
              </div>
              <button
                type="button"
                onClick={onSwitchToQuickStart}
                className="group flex w-full items-center gap-3.5 rounded-2xl border border-stone-300/80 bg-white/60 px-4 py-3.5 text-left shadow-sm transition hover:border-stone-900/30 hover:bg-white focus:outline-none focus:ring-4 focus:ring-stone-900/[0.06] dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-white/30 dark:hover:bg-white/[0.07]"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-stone-900 text-stone-50 dark:bg-stone-100 dark:text-stone-900">
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <rect width="5" height="5" x="3" y="3" rx="1" />
                    <rect width="5" height="5" x="16" y="3" rx="1" />
                    <rect width="5" height="5" x="3" y="16" rx="1" />
                    <path d="M21 16h-3a2 2 0 0 0-2 2v3" />
                    <path d="M21 21v.01" />
                    <path d="M12 7v3a2 2 0 0 1-2 2H7" />
                    <path d="M3 12h.01" />
                    <path d="M12 3h.01" />
                    <path d="M12 16v.01" />
                    <path d="M16 12h1" />
                    <path d="M21 12v.01" />
                    <path d="M12 21v-1" />
                  </svg>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-stone-900 dark:text-stone-100">
                    Join with a class code
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-stone-500 dark:text-stone-400">
                    Got a code or QR from your teacher? Start here — no password
                    needed.
                  </span>
                </span>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0 text-stone-400 transition group-hover:translate-x-0.5 group-hover:text-stone-700 dark:text-stone-500 dark:group-hover:text-stone-200"
                  aria-hidden
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            </div>
          )}

          {/* footer links */}
          <div className="mt-8 border-t border-stone-200 pt-5 text-center dark:border-white/10">
            <p className="text-xs text-stone-400 dark:text-stone-500">
              Trouble signing in? Ask your teacher for help.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
