/**
 * AuthScreen
 * ==========
 * First screen unauthenticated students see. Tabs: "Sign in" and "Create
 * account". The Sign in tab also exposes a "Forgot password?" sub-mode.
 * Delegates the actual auth calls to whatever `useStudentSession` gave us —
 * this component is purely presentational + form state.
 *
 * On successful signUp, we don't auto-route; if Supabase returns a live
 * session the AuthGate will move on by itself. Otherwise (email confirmation
 * required, or signup-only flow) we flip to the Sign in tab and show a notice.
 *
 * Teacher signups require an admin-minted invite code. The code is sent to
 * the session.signUp() function which redeems it server-side after the auth
 * user is created. If the redemption fails, session.signUp signs the user
 * out and returns an error — see session.ts for the full flow.
 */
import { useEffect, useRef, useState } from "react";
import type { AuthResult, SignUpRole } from "./session";

type Tab = "signin" | "signup";
type SignInMode = "password" | "reset";

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

function cleanError(message: string): string {
  // Trim and strip any trailing stack-ish junk; supabase-js usually returns
  // tidy strings already, but be defensive.
  const firstLine = message.split("\n")[0] ?? message;
  return firstLine.trim();
}

export function AuthScreen({
  signInWithPassword,
  signUp,
  requestPasswordReset,
  onSwitchToQuickStart,
}: AuthScreenProps) {
  const [tab, setTab] = useState<Tab>("signin");
  const [signInMode, setSignInMode] = useState<SignInMode>("password");

  // Sign-in fields
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");

  // Password-reset fields
  const [resetEmail, setResetEmail] = useState("");

  // Sign-up fields
  const [signUpRole, setSignUpRole] = useState<SignUpRole>("student");
  const [signUpName, setSignUpName] = useState("");
  const [signUpEmail, setSignUpEmail] = useState("");
  const [signUpPassword, setSignUpPassword] = useState("");
  const [signUpInviteCode, setSignUpInviteCode] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signInEmailRef = useRef<HTMLInputElement | null>(null);
  const signUpNameRef = useRef<HTMLInputElement | null>(null);
  const resetEmailRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (tab === "signin") {
      if (signInMode === "reset") resetEmailRef.current?.focus();
      else signInEmailRef.current?.focus();
    } else {
      signUpNameRef.current?.focus();
    }
    setError(null);
  }, [tab, signInMode]);

  const onSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!signInEmail.trim() || !signInPassword) {
      setError("Please enter your email and password.");
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await signInWithPassword(signInEmail.trim(), signInPassword);
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

  const onSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!signUpName.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (!signUpEmail.trim()) {
      setError("Please enter your email.");
      return;
    }
    if (signUpPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (signUpRole === "teacher" && !signUpInviteCode.trim()) {
      setError("Teacher signup requires an invite code from your admin.");
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await signUp(
        signUpEmail.trim(),
        signUpPassword,
        signUpName.trim(),
        signUpRole,
        signUpRole === "teacher" ? signUpInviteCode.trim() : undefined,
      );
      if (err) {
        setError(cleanError(err));
        return;
      }
      // Success. If Supabase returned a session, onAuthStateChange will
      // already have routed us out of this screen. If not (e.g. email
      // confirmation required), nudge the user to sign in.
      setNotice("Account created — you can sign in now.");
      setSignInEmail(signUpEmail.trim());
      setSignUpPassword("");
      setSignUpInviteCode("");
      setTab("signin");
    } finally {
      setBusy(false);
    }
  };

  const tabButtonClass = (active: boolean): string =>
    `flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      active
        ? "bg-indigo-600 text-white shadow"
        : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
    }`;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-sky-100 dark:from-slate-900 dark:via-slate-950 dark:to-indigo-950 px-4">
      <div
        className="w-full max-w-md rounded-2xl bg-white/90 dark:bg-slate-900/80 backdrop-blur shadow-xl ring-1 ring-slate-200 dark:ring-slate-800 p-8 space-y-6"
        aria-labelledby="auth-title"
      >
        <header className="space-y-1 text-center">
          <h1
            id="auth-title"
            className="text-2xl font-semibold text-slate-900 dark:text-slate-100"
          >
            Student Sign-In
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {tab === "signin"
              ? signInMode === "reset"
                ? "Enter your email and we'll send you a reset link."
                : "Sign in with your email and password."
              : "Create an account to start practicing."}
          </p>
        </header>

        <div
          role="tablist"
          aria-label="Authentication mode"
          className="flex gap-2 rounded-xl bg-slate-100 dark:bg-slate-800/60 p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "signin"}
            onClick={() => {
              setTab("signin");
              setSignInMode("password");
            }}
            className={tabButtonClass(tab === "signin")}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "signup"}
            onClick={() => setTab("signup")}
            className={tabButtonClass(tab === "signup")}
          >
            Create account
          </button>
        </div>

        {notice && (
          <div
            role="status"
            className="rounded-md bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-200 dark:ring-emerald-900"
          >
            {notice}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-md bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-sm text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-900"
          >
            {error}
          </div>
        )}

        {tab === "signin" && signInMode === "password" && (
          <form onSubmit={onSignInSubmit} className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Email
              </span>
              <input
                ref={signInEmailRef}
                type="email"
                value={signInEmail}
                onChange={(e) => setSignInEmail(e.target.value)}
                autoComplete="email"
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="you@example.com"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Password
              </span>
              <input
                type="password"
                value={signInPassword}
                onChange={(e) => setSignInPassword(e.target.value)}
                autoComplete="current-password"
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="••••••••"
              />
            </label>
            <div className="text-right">
              <button
                type="button"
                onClick={() => {
                  setResetEmail(signInEmail);
                  setSignInMode("reset");
                  setError(null);
                  setNotice(null);
                }}
                className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded"
              >
                Forgot password?
              </button>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-slate-900"
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        )}

        {tab === "signin" && signInMode === "reset" && (
          <form onSubmit={onResetSubmit} className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Email
              </span>
              <input
                ref={resetEmailRef}
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                autoComplete="email"
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="you@example.com"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-slate-900"
            >
              {busy ? "Sending…" : "Send reset link"}
            </button>
            <button
              type="button"
              onClick={() => {
                setSignInMode("password");
                setError(null);
                setNotice(null);
              }}
              className="block w-full text-center text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded"
            >
              ← Back to sign in
            </button>
          </form>
        )}

        {tab === "signup" && (
          <form onSubmit={onSignUpSubmit} className="space-y-4">
            <fieldset>
              <legend className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                I am a
              </legend>
              <div
                role="radiogroup"
                aria-label="Account role"
                className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 dark:bg-slate-800/60 p-1"
              >
                {(["student", "teacher"] as const).map((value) => {
                  const active = signUpRole === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setSignUpRole(value)}
                      className={`rounded-lg px-3 py-2 text-sm font-medium capitalize transition-colors ${
                        active
                          ? "bg-indigo-600 text-white shadow"
                          : "text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700/60"
                      }`}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Your name
              </span>
              <input
                ref={signUpNameRef}
                type="text"
                value={signUpName}
                onChange={(e) => setSignUpName(e.target.value)}
                autoComplete="name"
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g. Alex Chen"
              />
            </label>

            {signUpRole === "teacher" && (
              <label className="block">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Teacher invite code
                </span>
                <input
                  type="text"
                  value={signUpInviteCode}
                  onChange={(e) => setSignUpInviteCode(e.target.value.toUpperCase())}
                  autoComplete="off"
                  spellCheck={false}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 font-mono uppercase tracking-wider text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. SPRING-2026"
                />
                <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                  Teachers have full Console access (manage all courses, users,
                  invite codes). You'll need a code from existing staff to sign
                  up as one.
                </span>
              </label>
            )}

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Email
              </span>
              <input
                type="email"
                value={signUpEmail}
                onChange={(e) => setSignUpEmail(e.target.value)}
                autoComplete="email"
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="you@example.com"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Password
              </span>
              <input
                type="password"
                value={signUpPassword}
                onChange={(e) => setSignUpPassword(e.target.value)}
                autoComplete="new-password"
                minLength={6}
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="At least 6 characters"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-slate-900"
            >
              {busy ? "Creating account…" : "Create account"}
            </button>
          </form>
        )}

        <p className="text-xs text-center text-slate-500 dark:text-slate-400">
          Have a code?{" "}
          <button
            type="button"
            onClick={onSwitchToQuickStart}
            className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded"
          >
            Quick start
          </button>
        </p>

        <p className="text-xs text-center text-slate-500 dark:text-slate-400">
          Trouble signing in? Ask your teacher for help.
        </p>
      </div>
    </div>
  );
}
