/**
 * AuthScreen
 * ==========
 * First screen unauthenticated users see — a two-pane editorial sign-in.
 * LEFT (lg+): an ink brand panel. RIGHT: the auth card with an Educator /
 * Student toggle, email+password sign-in, a "Create account" tab, a password
 * reset sub-mode, and a one-click demo-credentials card for testing.
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
 * Type: Fraunces (display serif) + Hanken Grotesk (UI) — loaded in index.html.
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

/**
 * Seeded demo accounts (see viewer/scripts/seed-demo.mjs). Surfaced on the
 * sign-in screen so the husband-wife teaching team — and anyone testing — can
 * one-click into either role. These are intentionally public test credentials;
 * if this ever ships to real end-users, gate the demo card behind
 * `import.meta.env.DEV` or a `VITE_SHOW_DEMO_LOGINS` flag.
 */
const DEMO_ACCOUNTS = {
  student: {
    label: "Student",
    email: "demo-student1@example.com",
    password: "demostudent123",
    blurb: "Practice tests, question bank, and score history.",
  },
  educator: {
    label: "Educator",
    email: "demo-teacher@example.com",
    password: "demoteacher123",
    blurb: "Full Console — courses, gradebook, and tests admin.",
  },
} as const;
type SignInRole = keyof typeof DEMO_ACCOUNTS;

const SERIF = "'Fraunces', 'Iowan Old Style', Georgia, 'Times New Roman', serif";
const SANS =
  "'Hanken Grotesk', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
const serif = { fontFamily: SERIF } as const;

// Fine fractal-noise grain for the brand panel — adds tactile depth so the
// dark pane reads as paper/ink rather than flat color.
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

function cleanError(message: string): string {
  // Trim and strip any trailing stack-ish junk; supabase-js usually returns
  // tidy strings already, but be defensive.
  const firstLine = message.split("\n")[0] ?? message;
  return firstLine.trim();
}

/**
 * Resolve the email GoTrue should authenticate against from what the user
 * typed. Educators type a real email. Students type their per-course login
 * code (e.g. "ABCDEF-04"), which maps to the reserved synthetic mailbox
 * `<code>@students.local` minted by admin_create_student. We still accept a
 * raw email for the student field too (e.g. the seeded demo student, or a
 * self-signup student) by branching on the "@".
 */
const STUDENT_EMAIL_DOMAIN = "students.local";
function resolveLoginEmail(role: SignInRole, raw: string): string {
  const t = raw.trim();
  if (role === "educator") return t;
  if (t.includes("@")) return t;
  return `${t.toLowerCase()}@${STUDENT_EMAIL_DOMAIN}`;
}

/** Small ink/cream serif monogram lockup. */
function Wordmark({ tone }: { tone: "light" | "dark" }) {
  const square =
    tone === "dark"
      ? "bg-stone-50 text-stone-900"
      : "bg-stone-900 text-stone-50 dark:bg-stone-100 dark:text-stone-900";
  const text =
    tone === "dark"
      ? "text-stone-50"
      : "text-stone-900 dark:text-stone-100";
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={`grid h-9 w-9 place-items-center rounded-[10px] text-lg leading-none ${square}`}
        style={serif}
        aria-hidden
      >
        P
      </span>
      <span
        className={`text-lg font-semibold tracking-tight ${text}`}
        style={serif}
      >
        PrepMasters
      </span>
    </div>
  );
}

/** Icon button that copies `value` and flips to a check for ~1.4s. */
function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Fallback for non-secure contexts / older browsers.
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* give up silently */
      }
      ta.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={copied ? `${label} copied` : `Copy ${label.toLowerCase()}`}
      title={copied ? "Copied!" : `Copy ${label.toLowerCase()}`}
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border transition focus:outline-none focus:ring-2 ${
        copied
          ? "border-emerald-300 bg-emerald-50 text-emerald-600 focus:ring-emerald-400/40 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
          : "border-amber-300/70 bg-white/60 text-amber-700 hover:bg-white focus:ring-amber-500/30 dark:border-amber-500/30 dark:bg-white/5 dark:text-amber-400 dark:hover:bg-white/10"
      }`}
    >
      {copied ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V5a2 2 0 0 1 2-2h10" />
        </svg>
      )}
    </button>
  );
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
  const [signInRole, setSignInRole] = useState<SignInRole>("student");
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

  // One-click sign-in with the seeded demo account for the selected role.
  const signInAsDemo = async () => {
    const acct = DEMO_ACCOUNTS[signInRole];
    setSignInEmail(acct.email);
    setSignInPassword(acct.password);
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const { error: err } = await signInWithPassword(acct.email, acct.password);
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

  // ---- shared presentational classes --------------------------------------
  const inputCls =
    "mt-1.5 w-full rounded-xl border border-stone-300/80 bg-white/70 px-3.5 py-2.5 text-[15px] text-stone-900 placeholder:text-stone-400 shadow-sm transition focus:border-stone-900 focus:bg-white focus:outline-none focus:ring-4 focus:ring-stone-900/[0.06] dark:border-white/10 dark:bg-white/[0.04] dark:text-stone-100 dark:placeholder:text-stone-500 dark:focus:border-white/40 dark:focus:ring-white/10";
  const labelCls = "block text-[13px] font-medium text-stone-600 dark:text-stone-300";
  const primaryBtn =
    "w-full rounded-xl bg-stone-900 px-4 py-3 text-sm font-semibold tracking-tight text-stone-50 shadow-sm transition hover:bg-stone-800 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-4 focus:ring-stone-900/15 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white dark:focus:ring-white/20";
  const linkBtn =
    "font-semibold text-stone-900 underline decoration-stone-300 decoration-1 underline-offset-[3px] transition hover:decoration-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/30 rounded dark:text-stone-100 dark:decoration-stone-600 dark:hover:decoration-stone-200";
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
      <style>{`
        @keyframes authReveal{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
        @keyframes authFade{from{opacity:0}to{opacity:1}}
        @keyframes authFloat{0%,100%{transform:translate3d(0,0,0)}50%{transform:translate3d(0,-14px,0)}}
        .auth-reveal{animation:authReveal .75s cubic-bezier(.22,.61,.36,1) both}
        .auth-fade{animation:authFade 1.1s ease both}
        @media (prefers-reduced-motion: reduce){.auth-reveal,.auth-fade{animation:none}}
      `}</style>

      {/* ───────────────── LEFT · brand panel (lg+) ───────────────── */}
      <aside className="relative hidden overflow-hidden bg-stone-950 text-stone-100 lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        {/* atmosphere: warm + cool radial glows, drifting slowly */}
        <div
          className="pointer-events-none absolute -left-24 -top-24 h-[28rem] w-[28rem] rounded-full opacity-60 blur-3xl auth-fade"
          style={{
            background:
              "radial-gradient(closest-side, rgba(217,160,84,0.30), transparent 70%)",
            animation: "authFloat 18s ease-in-out infinite",
          }}
        />
        <div
          className="pointer-events-none absolute -bottom-32 right-[-10%] h-[34rem] w-[34rem] rounded-full opacity-50 blur-3xl"
          style={{
            background:
              "radial-gradient(closest-side, rgba(99,102,241,0.22), transparent 70%)",
            animation: "authFloat 22s ease-in-out infinite reverse",
          }}
        />
        {/* grain + a faint vertical hairline frame */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12] mix-blend-overlay"
          style={{ backgroundImage: GRAIN, backgroundSize: "220px 220px" }}
          aria-hidden
        />
        <div className="pointer-events-none absolute inset-y-10 left-10 w-px bg-gradient-to-b from-transparent via-white/15 to-transparent" />

        <header className="relative auth-reveal">
          <Wordmark tone="dark" />
        </header>

        <div className="relative max-w-md auth-reveal" style={{ animationDelay: "90ms" }}>
          <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-amber-300/80">
            Digital SAT preparation
          </p>
          <h2
            className="mt-5 text-[2.9rem] font-medium leading-[1.04] tracking-tight text-stone-50"
            style={serif}
          >
            Scores,
            <br />
            <span className="italic text-amber-200/90">by design.</span>
          </h2>
          <p className="mt-6 max-w-sm text-[15px] leading-relaxed text-stone-300/90">
            A focused practice platform built by SAT teachers — skill mastery,
            full-length Bluebook-style tests, and progress you can actually see.
          </p>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-stone-400">
            {["Full-length tests", "Skill mastery", "Score insights"].map((f) => (
              <span key={f} className="flex items-center gap-2">
                <span className="h-1 w-1 rounded-full bg-amber-300/80" aria-hidden />
                {f}
              </span>
            ))}
          </div>
        </div>

        <footer className="relative flex items-center justify-between text-xs text-stone-500 auth-reveal" style={{ animationDelay: "180ms" }}>
          <span>© {new Date().getFullYear()} PrepMasters</span>
          <span className="tracking-wide" style={serif}>
            Mastery, measured.
          </span>
        </footer>
      </aside>

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
                ? `${DEMO_ACCOUNTS[signInRole].label} sign-in`
                : "Create your account"}
            </h1>
            <p className="mt-1.5 text-sm text-stone-500 dark:text-stone-400">
              {tab === "signin"
                ? signInMode === "reset"
                  ? "Enter your email and we'll send you a reset link."
                  : "Welcome back — pick your role and sign in."
                : "Start practicing in under a minute."}
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
              Create account
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
                  {DEMO_ACCOUNTS[value].label} login
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
                    The code your teacher gave you. (You can also use an email if
                    you signed up with one.)
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

          {/* demo credentials card */}
          {tab === "signin" && signInMode === "password" && (
            <div className="mt-5 overflow-hidden rounded-2xl border border-amber-300/60 bg-gradient-to-b from-amber-50 to-amber-50/30 dark:border-amber-500/20 dark:from-amber-500/[0.07] dark:to-transparent">
              <div className="flex items-center gap-2 px-4 pt-3.5">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  className="text-amber-700 dark:text-amber-400"
                  aria-hidden
                >
                  <circle cx="7.5" cy="15.5" r="4.5" />
                  <path d="M10.7 12.3 19 4M16 7l3 3M14 9l2.5 2.5" />
                </svg>
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-400">
                  Demo {DEMO_ACCOUNTS[signInRole].label} · testing
                </span>
              </div>
              <div className="mt-3 space-y-1.5 px-4">
                {(
                  [
                    ["Email", DEMO_ACCOUNTS[signInRole].email],
                    ["Password", DEMO_ACCOUNTS[signInRole].password],
                  ] as const
                ).map(([k, v]) => (
                  <div
                    key={k}
                    className="flex items-center gap-2 rounded-lg bg-white/55 px-2.5 py-1.5 ring-1 ring-amber-300/40 dark:bg-white/[0.03] dark:ring-amber-500/15"
                  >
                    <span className="w-[58px] shrink-0 text-[12px] text-stone-500 dark:text-stone-400">
                      {k}
                    </span>
                    <code className="min-w-0 flex-1 select-all truncate font-mono text-[13px] text-stone-800 dark:text-stone-200">
                      {v}
                    </code>
                    <CopyButton value={v} label={k} />
                  </div>
                ))}
              </div>
              <p className="mt-2.5 px-4 text-[12px] leading-snug text-amber-700/80 dark:text-amber-400/70">
                {DEMO_ACCOUNTS[signInRole].blurb}
              </p>
              <div className="mt-3 px-3 pb-3">
                <button
                  type="button"
                  onClick={signInAsDemo}
                  disabled={busy}
                  className="w-full rounded-xl bg-amber-800 px-4 py-2.5 text-sm font-semibold text-amber-50 transition hover:bg-amber-900 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-4 focus:ring-amber-800/20 dark:bg-amber-400/90 dark:text-amber-950 dark:hover:bg-amber-300"
                >
                  {busy
                    ? "Signing in…"
                    : `Sign in as demo ${DEMO_ACCOUNTS[signInRole].label.toLowerCase()}`}
                </button>
              </div>
            </div>
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

          {/* sign-up */}
          {tab === "signup" && (
            <form onSubmit={onSignUpSubmit} className="space-y-4">
              <fieldset>
                <legend className={`${labelCls} mb-1.5`}>I am a</legend>
                <div
                  role="radiogroup"
                  aria-label="Account role"
                  className="grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1 dark:bg-white/5"
                >
                  {(["student", "teacher"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={signUpRole === value}
                      onClick={() => setSignUpRole(value)}
                      className={`capitalize ${segBtn(signUpRole === value)}`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </fieldset>
              <label className="block">
                <span className={labelCls}>Your name</span>
                <input
                  ref={signUpNameRef}
                  type="text"
                  value={signUpName}
                  onChange={(e) => setSignUpName(e.target.value)}
                  autoComplete="name"
                  className={inputCls}
                  placeholder="e.g. Alex Chen"
                />
              </label>

              {signUpRole === "teacher" && (
                <label className="block">
                  <span className={labelCls}>Teacher invite code</span>
                  <input
                    type="text"
                    value={signUpInviteCode}
                    onChange={(e) => setSignUpInviteCode(e.target.value.toUpperCase())}
                    autoComplete="off"
                    spellCheck={false}
                    className={`${inputCls} font-mono uppercase tracking-wider`}
                    placeholder="e.g. SPRING-2026"
                  />
                  <span className="mt-1 block text-xs text-stone-500 dark:text-stone-400">
                    Teachers have full Console access (manage all courses, users,
                    invite codes). You'll need a code from existing staff to sign
                    up as one.
                  </span>
                </label>
              )}

              <label className="block">
                <span className={labelCls}>Email</span>
                <input
                  type="email"
                  value={signUpEmail}
                  onChange={(e) => setSignUpEmail(e.target.value)}
                  autoComplete="email"
                  className={inputCls}
                  placeholder="you@example.com"
                />
              </label>
              <label className="block">
                <span className={labelCls}>Password</span>
                <input
                  type="password"
                  value={signUpPassword}
                  onChange={(e) => setSignUpPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                  className={inputCls}
                  placeholder="At least 6 characters"
                />
              </label>
              <button type="submit" disabled={busy} className={primaryBtn}>
                {busy ? "Creating account…" : "Create account"}
              </button>
            </form>
          )}

          {/* footer links */}
          <div className="mt-8 space-y-2 border-t border-stone-200 pt-5 text-center dark:border-white/10">
            <p className="text-sm text-stone-500 dark:text-stone-400">
              Have a class code?{" "}
              <button type="button" onClick={onSwitchToQuickStart} className={linkBtn}>
                Quick start
              </button>
            </p>
            <p className="text-xs text-stone-400 dark:text-stone-500">
              Trouble signing in? Ask your teacher for help.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
