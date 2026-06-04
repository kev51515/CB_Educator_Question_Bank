/**
 * QuickStartScreen
 * ================
 * One entry point, two flows — chosen automatically by the SHAPE of the code:
 *
 *  • COURSE code ("Y8M3KP", 6 chars) → frictionless quick-start.
 *      Student types course code + name + email. We mint an anonymous session
 *      and call `quick_start_with_code`, which stamps name+email onto the
 *      just-created profile and enrolls them. No password.
 *
 *  • SEAT code ("Y8M3KP-01", course code + "-NN") → CLAIM a pre-created seat.
 *      The teacher already made this student ("Bob") via admin_create_student,
 *      so we do NOT mint a new profile and we do NOT ask for a name (the teacher
 *      owns it — cf. migration 0093). Instead the student sets their own email +
 *      password, and `claim_student_seat` takes over the existing seat:
 *        - first claim  → swaps the synthetic @students.local email → real email,
 *                         sets the password, keeps the teacher's name + all work.
 *                         We then sign in as that seat (email+password).
 *        - already taken → files a teacher-approval request; we show a notice.
 *
 * Optional `prefillCode` is supplied by AuthGate when the URL carries `?code=…`
 * so a QR-scanned deeplink lands with the code already filled.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

interface QuickStartScreenProps {
  prefillCode?: string;
  onSwitchToSignIn: () => void;
}

/**
 * Course short_code spec (per CLAUDE.md migrations 0038–0040):
 *   - exactly 6 characters
 *   - alphabet A-Z and 2-9 (excludes O/0/I/1/L confusables)
 * A SEAT code appends "-NN" (a 1–3 digit ordinal that CAN contain 0/1).
 */
const CODE_LENGTH = 6;
const COURSE_RE = /^[A-HJ-NP-Z2-9]{6}$/;
// Require the dash so a 6-char course code with an accidental trailing digit
// (e.g. "AB23CD1") isn't misread as a seat code — seat codes are always
// distributed with the dash ("Y8M3KP-01").
const SEAT_RE = /^([A-HJ-NP-Z2-9]{6})-([0-9]{1,3})$/;
/** Keep letters, digits and a dash while typing; uppercase; cap length. */
const ENTRY_SCRUB = /[^A-Z0-9-]/g;

function scrubEntry(raw: string): string {
  return raw.toUpperCase().replace(ENTRY_SCRUB, "").slice(0, 12);
}

type Parsed =
  | { mode: "empty" }
  | { mode: "course"; courseCode: string }
  | { mode: "seat"; seatCode: string };

/** Decide which flow the typed code implies. */
function parseEntry(raw: string): Parsed {
  const v = scrubEntry(raw);
  if (v === "") return { mode: "empty" };
  const seat = v.match(SEAT_RE);
  if (seat) {
    const base = seat[1];
    const seq = seat[2].padStart(2, "0"); // "1" → "01" to match the printed code
    return { mode: "seat", seatCode: `${base}-${seq}` };
  }
  if (COURSE_RE.test(v)) return { mode: "course", courseCode: v };
  return { mode: "empty" };
}

/**
 * Map Supabase / Postgres error messages to user-friendly copy. Falls back
 * to a cleaned version of the raw message for anything unrecognised.
 */
function mapRpcError(raw: string): string {
  const msg = raw.toLowerCase();
  if (msg.includes("seat_not_found")) {
    return "We couldn't find a personal login for that code. Check it with your teacher.";
  }
  if (msg.includes("email_in_use")) {
    return "That email is already attached to another account. Try signing in instead.";
  }
  if (msg.includes("weak_password")) {
    return "Password must be at least 6 characters.";
  }
  if (msg.includes("invalid_join_code") || msg.includes("invalid_invite_code") || msg.includes("code not found")) {
    return "We couldn't find a course matching that code. Check with your teacher.";
  }
  if (msg.includes("code_expired")) {
    return "That code has expired. Ask your teacher for a fresh one.";
  }
  if (msg.includes("code_revoked")) {
    return "That code has been revoked. Ask your teacher for a fresh one.";
  }
  if (msg.includes("rate_limit") || msg.includes("too many")) {
    return "Too many attempts. Wait a minute and try again.";
  }
  if (msg.includes("invalid_email")) {
    return "That email doesn't look right.";
  }
  if (msg.includes("invalid_name")) {
    return "Please enter your full name.";
  }
  if (msg.includes("not_authenticated")) {
    return "We couldn't start a session. Please refresh and try again.";
  }
  // Strip PostgREST-style noise like "PGRST116:" or "code 23505:" prefixes.
  return raw
    .replace(/^PGRST\w*:?\s*/i, "")
    .replace(/^code\s+\w+:?\s*/i, "")
    .split("\n")[0]
    ?.trim() || "Something went wrong. Please try again.";
}

/**
 * Recognise the anonymous-sign-in-disabled error from Supabase Auth.
 * The error code is `anonymous_provider_disabled` but the human message
 * also embeds the word "anonymous" — match either.
 */
function isAnonymousDisabled(message: string, code?: string | null): boolean {
  if (code === "anonymous_provider_disabled") return true;
  return /anonymous/i.test(message);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Something went wrong. Please try again.";
}

interface ClaimSeatRow {
  status: "claimed" | "pending";
  login_email: string;
}

export function QuickStartScreen({ prefillCode, onSwitchToSignIn }: QuickStartScreenProps) {
  const [code, setCode] = useState<string>(() => scrubEntry(prefillCode ?? ""));
  const [name, setName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [confirmEmail, setConfirmEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState<boolean>(false);

  // Guards setState after an await if the component unmounts mid-flight (the
  // screen unmounts once AuthGate re-routes on success). House pattern (21I/J).
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const parsed = useMemo(() => parseEntry(code), [code]);
  const isSeat = parsed.mode === "seat";
  const codeValid = parsed.mode !== "empty";
  const emailsMatch =
    email.trim().toLowerCase() === confirmEmail.trim().toLowerCase();

  const canSubmit = useMemo(() => {
    if (busy || succeeded || !codeValid) return false;
    if (isSeat)
      return (
        email.trim().length > 0 &&
        confirmEmail.trim().length > 0 &&
        emailsMatch &&
        password.length >= 6
      );
    return name.trim().length > 0 && email.trim().length > 0;
  }, [busy, succeeded, codeValid, isSeat, name, email, confirmEmail, emailsMatch, password]);

  const codeRef = useRef<HTMLInputElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // If the code was prefilled (deeplink), skip past it. Focus the first
    // field the active flow needs (email for a seat, name for a course).
    if (prefillCode) {
      const p = parseEntry(prefillCode);
      if (p.mode === "seat") emailRef.current?.focus();
      else nameRef.current?.focus();
    } else {
      codeRef.current?.focus();
    }
  }, [prefillCode]);

  /**
   * Each submit returns whether the anonymous session should be KEPT — true only
   * when it was converted into a real signed-in state (quick-start success, or a
   * claim that signed in as the seat). Otherwise the caller signs the throwaway
   * anon session out so the student is never stranded half-authenticated.
   */

  /** Quick-start a brand-new self-serve enrolment from a 6-char course code. */
  const submitCourse = async (courseCode: string): Promise<boolean> => {
    const { error: rpcError } = await supabase.rpc("quick_start_with_code", {
      p_code: courseCode,
      p_name: name.trim(),
      p_email: email.trim(),
    });
    if (!aliveRef.current) return true; // unmounted; leave session as-is
    if (rpcError) {
      setError(mapRpcError(rpcError.message));
      return false;
    }
    setSucceeded(true);
    return true; // the anon session IS this student now
  };

  /** Claim (or request) a pre-created managed seat from a "-NN" seat code. */
  const submitSeat = async (seatCode: string): Promise<boolean> => {
    const trimmedEmail = email.trim();
    const { data, error: rpcError } = await supabase.rpc("claim_student_seat", {
      p_code: seatCode,
      p_email: trimmedEmail,
      p_password: password,
    });
    if (!aliveRef.current) return false;
    if (rpcError) {
      setError(mapRpcError(rpcError.message));
      return false;
    }
    const row = (Array.isArray(data) ? data[0] : data) as ClaimSeatRow | null;

    if (row?.status === "claimed") {
      // The seat now logs in with the real email + chosen password. Sign in as
      // the seat — this REPLACES the anon session, so keep it. AuthGate routes.
      const loginEmail = row.login_email || trimmedEmail;
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password,
      });
      if (!aliveRef.current) return true; // signed in; leave the seat session
      if (signInError) {
        setError(
          "Your login is set up — please sign in with your email and password.",
        );
        return false;
      }
      setSucceeded(true);
      return true;
    }

    // status === 'pending' → teacher must approve. The anon session is dropped
    // by the caller's cleanup; just surface the notice.
    if (aliveRef.current) {
      setNotice(
        "That spot is already in use, so we've asked your teacher to approve this login. " +
          "You'll be able to sign in once they do.",
      );
      setPassword("");
    }
    return false;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const p = parseEntry(code);
    if (p.mode === "empty") {
      setError("Enter the code your teacher gave you.");
      return;
    }
    if (p.mode === "seat") {
      if (!email.trim()) {
        setError("Please enter your email.");
        return;
      }
      if (!emailsMatch) {
        setError("The two emails don't match.");
        return;
      }
      if (password.length < 6) {
        setError("Password must be at least 6 characters.");
        return;
      }
    } else {
      if (!name.trim()) {
        setError("Please enter your full name.");
        return;
      }
      if (!email.trim()) {
        setError("Please enter your email.");
        return;
      }
    }

    setBusy(true);
    let anonStarted = false;
    let keepSession = false;
    try {
      // Both flows run against an authenticated context. Mint an anonymous
      // session first; by the time signInAnonymously resolves the JWT is on
      // the supabase-js client so the following RPC carries auth.
      const { error: anonError } = await supabase.auth.signInAnonymously();
      if (anonError) {
        const anonCode =
          (anonError as unknown as { code?: string | null }).code ?? null;
        if (aliveRef.current) {
          if (isAnonymousDisabled(anonError.message, anonCode)) {
            setError(
              "Quick-start is disabled. Ask your administrator to enable anonymous sign-in, or use Sign In above.",
            );
          } else {
            setError(mapRpcError(anonError.message));
          }
        }
        return;
      }
      anonStarted = true;

      keepSession =
        p.mode === "seat"
          ? await submitSeat(p.seatCode)
          : await submitCourse(p.courseCode);
    } catch (err: unknown) {
      if (aliveRef.current) setError(getErrorMessage(err));
    } finally {
      // If we minted an anon session but never converted it into a real
      // signed-in state (error / pending), drop it so the student isn't
      // stranded as an anonymous user with no course.
      if (anonStarted && !keepSession) {
        await supabase.auth.signOut().catch(() => undefined);
      }
      if (aliveRef.current) setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-sky-100 dark:from-slate-900 dark:via-slate-950 dark:to-indigo-950 px-4">
      <div
        className="w-full max-w-md rounded-2xl bg-white/90 dark:bg-slate-900/80 backdrop-blur shadow-xl ring-1 ring-slate-200 dark:ring-slate-800 p-8 space-y-6"
        aria-labelledby="quickstart-title"
      >
        <header className="space-y-1 text-center">
          <h1
            id="quickstart-title"
            className="text-2xl font-semibold text-slate-900 dark:text-slate-100"
          >
            Start with a code
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {isSeat
              ? "This is a personal login code — set your email & password to finish."
              : "Type the code your teacher gave you — no password needed."}
          </p>
        </header>

        {error && !succeeded && (
          <div
            id="quickstart-error"
            role="alert"
            className="rounded-md bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-sm text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-900"
          >
            {error}
          </div>
        )}

        {notice && !succeeded && (
          <div
            role="status"
            aria-live="polite"
            className="rounded-md bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-800 dark:text-amber-200 ring-1 ring-amber-200 dark:ring-amber-900"
          >
            {notice}
          </div>
        )}

        {succeeded && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-3 rounded-md bg-emerald-50 dark:bg-emerald-950/40 px-3 py-3 text-sm text-emerald-800 dark:text-emerald-200 ring-1 ring-emerald-200 dark:ring-emerald-900"
          >
            <span
              aria-hidden="true"
              className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent"
            />
            <span>Setting up your course…</span>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="flex items-baseline justify-between text-sm font-medium text-slate-700 dark:text-slate-300">
              <span>{isSeat ? "Your login code" : "Course code"}</span>
              <span
                aria-live="polite"
                className={`text-xs font-normal tabular-nums ${
                  codeValid
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-slate-400 dark:text-slate-500"
                }`}
              >
                {isSeat ? "personal code" : `${code.length} / ${CODE_LENGTH}`}
              </span>
            </span>
            <input
              ref={codeRef}
              type="text"
              value={code}
              onChange={(e) => setCode(scrubEntry(e.target.value))}
              onPaste={(e) => {
                e.preventDefault();
                setCode(scrubEntry(e.clipboardData.getData("text")));
              }}
              autoComplete="one-time-code"
              spellCheck={false}
              inputMode="text"
              maxLength={12}
              aria-describedby="quickstart-code-hint quickstart-error"
              aria-invalid={code.length > 0 && !codeValid}
              disabled={succeeded}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 font-mono tracking-widest text-xl text-slate-900 dark:text-slate-100 motion-safe:transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
              placeholder="ABC234"
            />
            <span
              id="quickstart-code-hint"
              className="mt-1 block text-xs text-slate-500 dark:text-slate-400"
            >
              {isSeat
                ? "Your teacher already set your name — you just need email & password."
                : "6 characters — letters and numbers (no O, 0, I, 1, or L)."}
            </span>
          </label>

          {!isSeat && (
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Full name
              </span>
              <input
                ref={nameRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                disabled={succeeded}
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 motion-safe:transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                placeholder="e.g. Alex Chen"
              />
            </label>
          )}

          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Email
            </span>
            <input
              ref={emailRef}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              disabled={succeeded}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 motion-safe:transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
              placeholder="you@example.com"
            />
          </label>

          {isSeat && (
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Confirm email
              </span>
              <input
                type="email"
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                autoComplete="email"
                disabled={succeeded}
                aria-invalid={confirmEmail.length > 0 && !emailsMatch}
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 motion-safe:transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                placeholder="Re-type your email"
              />
              {confirmEmail.length > 0 && !emailsMatch && (
                <span className="mt-1 block text-xs text-rose-600 dark:text-rose-400">
                  The two emails don't match.
                </span>
              )}
            </label>
          )}

          {isSeat && (
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Password
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={6}
                disabled={succeeded}
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 motion-safe:transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                placeholder="At least 6 characters"
              />
              <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                You'll use this email and password to sign in from now on.
              </span>
            </label>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            title={!codeValid ? "Enter the code your teacher gave you" : undefined}
            className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-2.5 motion-safe:transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            {busy
              ? isSeat
                ? "Finishing…"
                : "Starting…"
              : succeeded
                ? "Started ✓"
                : isSeat
                  ? "Claim my login"
                  : "Start"}
          </button>
        </form>

        <p className="text-xs text-center text-slate-500 dark:text-slate-400">
          Have an account already?{" "}
          <button
            type="button"
            onClick={onSwitchToSignIn}
            className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded"
          >
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}
