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
import type { AuthResult } from "./session";
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
  type SignInMode,
  type SignInRole,
} from "./authScreenHelpers";

interface AuthScreenProps {
  signInWithPassword: (email: string, password: string) => Promise<AuthResult>;
  /** Passwordless student sign-in with a teacher-issued login code. */
  signInWithCode: (code: string) => Promise<AuthResult>;
  /** Google OAuth — redirects away on success; resolves with error otherwise. */
  signInWithGoogle: () => Promise<AuthResult>;
  requestPasswordReset: (email: string) => Promise<AuthResult>;
  onSwitchToQuickStart: () => void;
}

export function AuthScreen({
  signInWithPassword,
  signInWithCode,
  signInWithGoogle,
  requestPasswordReset,
  onSwitchToQuickStart,
}: AuthScreenProps) {
  // Signups are CLOSED (owner decision 2026-06): no tab bar, sign-in only.
  // Students are the primary audience — student role is the default and the
  // class-code join card leads the page.
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
  }, [signInMode]);

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
    setSignInMode("password");
    setSignInRole("student");
    setSignInEmail(login);
    if (key) setSignInPassword(key);
    setNotice("Scanned your login — just tap Sign in.");
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  // Students may sign in two ways: with their teacher-issued login CODE (a bare
  // identifier with no "@" → passwordless, mirrors first-time join) OR with the
  // email + password they set when claiming. Educators always use email+pwd.
  const codeMode =
    signInRole === "student" &&
    signInEmail.trim().length > 0 &&
    !signInEmail.includes("@");

  const onGoogleSignIn = async (): Promise<void> => {
    setError(null);
    setNotice(null);
    setBusy(true);
    const { error: gErr } = await signInWithGoogle();
    if (gErr) {
      setError(cleanError(gErr));
      setBusy(false);
    }
    // On success the browser redirects to Google — stay busy until then.
  };

  const onSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const id = signInEmail.trim();
    if (!id) {
      setError(
        signInRole === "student"
          ? "Enter your login code, or your email and password."
          : "Please enter your email and password.",
      );
      return;
    }
    if (!codeMode && !signInPassword) {
      setError("Please enter your password.");
      return;
    }
    setBusy(true);
    try {
      const { error: err } = codeMode
        ? await signInWithCode(id)
        : await signInWithPassword(resolveLoginEmail(signInRole, id), signInPassword);
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
  // authScreenHelpers. segBtn is auth-only.
  const segBtn = (active: boolean) =>
    `rounded-[10px] px-3 py-2 text-sm transition ${
      active
        ? "bg-white font-semibold text-stone-900 shadow-sm ring-1 ring-stone-900/5 dark:bg-stone-100 dark:text-stone-900"
        : "font-medium text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"
    }`;

  // The first-time / no-password entry: enter a class code or scan a QR. Reused
  // for the Student sign-in path and the sign-up tab.
  const joinCard = (
    <button
      type="button"
      onClick={onSwitchToQuickStart}
      className="group flex w-full items-center gap-3.5 rounded-2xl border border-stone-300/80 bg-white/60 px-4 py-3.5 text-left shadow-sm transition hover:border-stone-900/30 hover:bg-white focus:outline-none focus:ring-4 focus:ring-stone-900/[0.06] dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-white/30 dark:hover:bg-white/[0.07]"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-stone-900 text-stone-50 dark:bg-stone-100 dark:text-stone-900">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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
          Enter the code or scan the QR your teacher gave you. No password needed.
        </span>
      </span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-stone-400 transition group-hover:translate-x-0.5 group-hover:text-stone-700 dark:text-stone-500 dark:group-hover:text-stone-200" aria-hidden>
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </button>
  );

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
              {`${ROLE_LABELS[signInRole]} sign-in`}
            </h1>
            <p className="mt-1.5 text-sm text-stone-500 dark:text-stone-400">
              {signInMode === "reset"
                ? "Enter your email and we'll send you a reset link."
                : signInRole === "student"
                  ? "Joining for the first time? Use your class code. Returning? Sign in below."
                  : "Sign in with your email and password."}
            </p>
          </header>

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
          {signInMode === "password" && (
            <div
              role="radiogroup"
              aria-label="Sign in as"
              className="mb-5 grid grid-cols-2 gap-2 sm:gap-1 rounded-xl bg-stone-100 p-1 dark:bg-white/5"
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

          {/* STUDENT first-time path — the no-password class code is the primary
              action for a student who hasn't signed in before; the returning-
              student code+password form sits below the divider. */}
          {signInMode === "password" && signInRole === "student" && (
            <div className="mb-5">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400 dark:text-stone-500">
                New here? Joining a class?
              </p>
              {joinCard}
              <div className="mt-6 flex items-center gap-3" aria-hidden>
                <span className="h-px flex-1 bg-stone-200 dark:bg-white/10" />
                <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-stone-400 dark:text-stone-500">
                  already have a login?
                </span>
                <span className="h-px flex-1 bg-stone-200 dark:bg-white/10" />
              </div>
            </div>
          )}

          {/* sign-in form — for students this is the RETURNING path (student
              code + password your teacher set); for educators it's email + password. */}
          {signInMode === "password" && (
            <form onSubmit={onSignInSubmit} className="space-y-4">
              <label className="block">
                <span className={labelCls}>
                  {signInRole === "student" ? "Login code or email" : "Email"}
                </span>
                <input
                  ref={signInEmailRef}
                  // type="text" (not "email"): students may enter a bare login
                  // code here (no "@"), which strict email validation would block.
                  // A code → passwordless sign-in (codeMode); an email → password.
                  type="text"
                  inputMode="email"
                  value={signInEmail}
                  onChange={(e) => setSignInEmail(e.target.value)}
                  autoComplete="email"
                  className={inputCls}
                  placeholder={signInRole === "student" ? "ABCDEF or you@example.com" : "you@example.com"}
                />
                {signInRole === "student" && (
                  <span className="mt-1 block text-xs text-stone-500 dark:text-stone-400">
                    {codeMode
                      ? "Using your login code — no password needed."
                      : "Enter the login code your teacher gave you (no password needed), or the email + password you set."}
                  </span>
                )}
              </label>
              {/* Password is hidden when a student is signing in with their code
                  (passwordless). Educators and email sign-in always show it. */}
              {!codeMode && (
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
              )}
              {/* Self-serve reset is available to anyone signing in with
                  EMAIL + password — including self-registered students. Only
                  code users (passwordless; synthetic non-deliverable emails)
                  are routed to their teacher instead. The link is deliberately
                  prominent (accent + underline) — it was a near-invisible grey
                  footnote before and users couldn't find it. */}
              {codeMode ? null : (
                <div className="flex items-center justify-between gap-3">
                  {signInRole === "student" ? (
                    <span className="text-xs text-stone-400 dark:text-stone-500">
                      Using a login code? Ask your teacher to reset it.
                    </span>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setResetEmail(signInEmail);
                      setSignInMode("reset");
                      setError(null);
                      setNotice(null);
                    }}
                    className="min-h-[40px] shrink-0 text-sm font-semibold text-indigo-600 hover:text-indigo-700 hover:underline underline-offset-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded dark:text-indigo-400 dark:hover:text-indigo-300"
                  >
                    Forgot password?
                  </button>
                </div>
              )}
              <button type="submit" disabled={busy} className={primaryBtn}>
                {busy ? "Signing in…" : codeMode ? "Sign in with code" : "Sign in"}
              </button>
            </form>
          )}

          {/* Google sign-in. Signups stay invitation-only, but Google is a
              SIGN-IN method: Supabase links the Google identity to the
              existing account with the same verified email, so self-
              registered students (and educators) can use either method.
              Code-login students keep using their codes. */}
          {signInMode === "password" && (
            <div className="mt-5">
              <div className="mb-4 flex items-center gap-3" aria-hidden>
                <span className="h-px flex-1 bg-stone-200 dark:bg-white/10" />
                <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-stone-400 dark:text-stone-500">
                  or
                </span>
                <span className="h-px flex-1 bg-stone-200 dark:bg-white/10" />
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void onGoogleSignIn();
                }}
                className="flex min-h-[44px] w-full items-center justify-center gap-2.5 rounded-xl border border-stone-300/80 bg-white px-4 py-3 text-sm font-semibold text-stone-800 shadow-sm transition hover:border-stone-900/30 hover:bg-stone-50 focus:outline-none focus:ring-4 focus:ring-stone-900/[0.06] disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.04] dark:text-stone-100 dark:hover:bg-white/[0.08]"
              >
                <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                </svg>
                Continue with Google
              </button>
              {signInRole === "student" && (
                <p className="mt-2 text-center text-xs text-stone-400 dark:text-stone-500">
                  Use the Google account with the same email as your OmniLMS
                  login to keep everything together.
                </p>
              )}
            </div>
          )}


          {/* password reset */}
          {signInMode === "reset" && (
            <form onSubmit={onResetSubmit} className="space-y-4">
              <p className="text-sm text-stone-600 dark:text-stone-400">
                Enter your account email and we'll send you a link to set a
                new password.
              </p>
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
