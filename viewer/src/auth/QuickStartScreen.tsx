/**
 * QuickStartScreen
 * ================
 * One entry point, two flows. A personal login code and a course code are
 * BOTH bare 6-char codes (shape-identical), so the flow is resolved
 * server-side via `peek_join_code` ('seat' | 'course' | 'none') rather than
 * by shape. (A legacy "-NN" dash shape is still parsed for backward-compat —
 * see SEAT_RE below — but is no longer how login codes are distributed.)
 *
 *  • COURSE code ("Y8M3KP", 6 chars) → frictionless quick-start.
 *      Student types course code + name + email. We mint an anonymous session
 *      and call `quick_start_with_code`, which stamps name+email onto the
 *      just-created profile and enrolls them. No password.
 *
 *  • SEAT code (a bare, non-guessable 6-letter login code, e.g. "CWXKHR" —
 *      6 distinct letters from the confusable-free set A–Z minus I/L/O/Q,
 *      minted by admin_create_student) → CLAIM a pre-created seat.
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
 *
 * Visual system: shares the editorial two-pane treatment with AuthScreen — the
 * dark "ink" BrandPanel on the left (lg+), the warm-stone card on the right,
 * Fraunces/Hanken type, and the shared inputCls / primaryBtn primitives — so
 * sign-in and class-code entry feel like one continuous product.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  SANS,
  serif,
  Wordmark,
  AuthKeyframes,
  BrandPanel,
  inputCls,
  labelCls,
  primaryBtn,
} from "./authScreenHelpers";

interface QuickStartScreenProps {
  prefillCode?: string;
  onSwitchToSignIn: (role?: "student" | "educator") => void;
}

/**
 * Course short_code spec (per CLAUDE.md migrations 0038–0040):
 *   - exactly 6 characters
 *   - alphabet A-Z and 2-9 (excludes O/0/I/1/L confusables)
 * A personal login code is also a bare 6-letter code (e.g. "CWXKHR" — 6 distinct
 * letters from the confusable-free set A–Z minus I/L/O/Q); since it
 * is shape-identical to a course code, `peek_join_code` decides seat vs course.
 * The "-NN" dash shape below is LEGACY (no longer how login codes are minted);
 * SEAT_RE is kept only so any old dash-form code still routes to the claim flow.
 */
const CODE_LENGTH = 6;
const COURSE_RE = /^[A-HJ-NP-Z2-9]{6}$/;
// Legacy backward-compat: a "-NN" dash shape (no longer distributed) is still
// recognised as a seat code. Requiring the dash keeps a 6-char course code with
// an accidental trailing digit (e.g. "AB23CD1") from being misread as a seat.
const SEAT_RE = /^([A-HJ-NP-Z2-9]{6})-([0-9]{1,3})$/;
/** Keep letters, digits and a dash while typing; uppercase; cap length. */
const ENTRY_SCRUB = /[^A-Z0-9-]/g;

/**
 * The hero code field — the shared stone/soft-ring input treatment, but larger,
 * monospaced and letter-spaced so the code reads as a code. Includes the
 * disabled dimming used while the success spinner is up.
 */
const codeInputCls =
  "mt-1.5 w-full rounded-xl border border-stone-300/80 bg-white/70 px-3.5 py-3 font-mono text-xl tracking-[0.3em] text-stone-900 placeholder:text-stone-300 placeholder:tracking-[0.3em] shadow-sm transition focus:border-stone-900 focus:bg-white focus:outline-none focus:ring-4 focus:ring-stone-900/[0.06] disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.04] dark:text-stone-100 dark:placeholder:text-stone-600 dark:focus:border-white/40 dark:focus:ring-white/10";
/** The shared input + the disabled dimming the success state needs. */
const fieldCls = `${inputCls} disabled:opacity-60`;

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
  course_id: string;
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

  // A bare 6-char code is AMBIGUOUS: it can be a course join/short code OR a
  // managed student's personal login code — both are 6 chars in the same
  // alphabet, so shape alone can't tell them apart. Ask the server which it is
  // (peek_join_code) so we route to the right flow and show the right fields.
  // A "COURSECODE-NN" dash form is unambiguous (always a seat) and skips the
  // round-trip. We intentionally keep the dash-less personal-code format.
  const [resolvedKind, setResolvedKind] = useState<"seat" | "course" | "none" | null>(
    null,
  );
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (parsed.mode !== "course") {
      setResolvedKind(null);
      setResolving(false);
      return;
    }
    const probe = parsed.courseCode;
    let cancelled = false;
    setResolving(true);
    const timer = setTimeout(() => {
      void (async () => {
        const { data, error: rpcErr } = await supabase.rpc("peek_join_code", {
          p_code: probe,
        });
        if (cancelled) return;
        setResolvedKind(
          rpcErr || typeof data !== "string"
            ? "none"
            : (data as "seat" | "course" | "none"),
        );
        setResolving(false);
      })();
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [parsed]);

  // Effective flow: a dash seat, OR a bare code the server resolved to a seat.
  const isSeat =
    parsed.mode === "seat" || (parsed.mode === "course" && resolvedKind === "seat");
  const codeValid = parsed.mode !== "empty";
  const emailsMatch =
    email.trim().toLowerCase() === confirmEmail.trim().toLowerCase();

  const canSubmit = useMemo(() => {
    // Block submit while we're still resolving a bare code — we don't yet know
    // whether to demand a password (seat) or not (course).
    if (busy || succeeded || !codeValid || resolving) return false;
    if (isSeat)
      return (
        email.trim().length > 0 &&
        confirmEmail.trim().length > 0 &&
        emailsMatch &&
        password.length >= 6
      );
    return name.trim().length > 0 && email.trim().length > 0;
  }, [busy, succeeded, codeValid, resolving, isSeat, name, email, confirmEmail, emailsMatch, password]);

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
    if (rpcError) {
      if (aliveRef.current) setError(mapRpcError(rpcError.message));
      return false;
    }
    if (aliveRef.current) setSucceeded(true);
    return true; // the anon session IS this student now — keep it
  };

  /** Claim (or request) a pre-created managed seat from a "-NN" seat code. */
  const submitSeat = async (seatCode: string): Promise<boolean> => {
    const trimmedEmail = email.trim();
    const { data, error: rpcError } = await supabase.rpc("claim_student_seat", {
      p_code: seatCode,
      p_email: trimmedEmail,
      p_password: password,
    });
    if (rpcError) {
      if (aliveRef.current) setError(mapRpcError(rpcError.message));
      return false;
    }
    const row = (Array.isArray(data) ? data[0] : data) as ClaimSeatRow | null;

    if (row?.status === "claimed") {
      // The seat now logs in with the real email + chosen password. Sign in as
      // the seat — this REPLACES the shared anon session. We MUST complete this
      // even if signInAnonymously already routed AuthGate off /quick-start and
      // unmounted us: bailing here on `!aliveRef` would leave the seat CLAIMED
      // but the student signed out → bounced back to /quick-start (the bug).
      const loginEmail = row.login_email || trimmedEmail;
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password,
      });
      if (signInError) {
        if (aliveRef.current)
          setError("Your login is set up — please sign in with your email and password.");
        return false;
      }
      // Better UX: hand off the invited course so the student lands straight in
      // it (AreaSelector consumes this). sessionStorage survives the unmount that
      // the seat sign-in triggers. Best-effort — falls back to the student hub.
      try {
        if (row.course_id) sessionStorage.setItem("qs.goToCourse", row.course_id);
      } catch {
        /* sessionStorage unavailable */
      }
      if (aliveRef.current) setSucceeded(true);
      return true; // seat session established — keep it
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
    // Effective flow — a dash seat, or a bare code the server resolved to a seat.
    const seatFlow =
      p.mode === "seat" || (p.mode === "course" && resolvedKind === "seat");
    if (seatFlow) {
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

      // For a dash seat the padded `seatCode` is the login_code; for a bare
      // personal code the typed (scrubbed/uppercased) string is the login_code.
      const seatCode = p.mode === "seat" ? p.seatCode : scrubEntry(code);
      keepSession = seatFlow
        ? await submitSeat(seatCode)
        : await submitCourse((p as { courseCode: string }).courseCode);
    } catch (err: unknown) {
      if (aliveRef.current) setError(getErrorMessage(err));
    } finally {
      // Drop the throwaway anon session ONLY if it's still anonymous — i.e. the
      // flow errored before converting it. signInAnonymously + signInWithPassword
      // (seat claim) share ONE supabase session, so a blind signOut here would
      // strand a just-signed-in seat student and bounce them to /quick-start.
      if (anonStarted && !keepSession) {
        const { data: who } = await supabase.auth.getUser();
        const stillAnon =
          (who?.user as { is_anonymous?: boolean } | null)?.is_anonymous === true;
        if (stillAnon) await supabase.auth.signOut().catch(() => undefined);
      }
      if (aliveRef.current) setBusy(false);
    }
  };

  return (
    <div
      className="relative min-h-screen w-full bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100 lg:grid lg:grid-cols-[1.1fr_1fr]"
      style={{ fontFamily: SANS }}
    >
      <AuthKeyframes />

      {/* ───────── LEFT · brand panel (lg+) — same ink treatment as sign-in,
          copy tuned to the "join with a code" moment ───────── */}
      <BrandPanel
        eyebrow="Join your class"
        title="You're one"
        titleAccent="code away."
        lead="No account to create, nothing to install. Enter the code your teacher gave you and you're in your class in under a minute."
        steps={[
          { n: "01", title: "Enter your code", blurb: "The course or personal login code from your teacher." },
          { n: "02", title: "Add your details", blurb: "Your name — or an email & password for a personal seat." },
          { n: "03", title: "Open your class", blurb: "Jump straight into your assignments, tests, and resources." },
        ]}
      />

      {/* ───────── RIGHT · quick-start card ───────── */}
      <main className="relative flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
        <div
          className="w-full max-w-[26rem] auth-reveal"
          aria-labelledby="quickstart-title"
          style={{ animationDelay: "60ms" }}
        >
          {/* compact wordmark for mobile (brand panel hidden) */}
          <div className="mb-8 lg:hidden">
            <Wordmark tone="light" />
          </div>

          <header className="mb-7">
            <h1
              id="quickstart-title"
              className="text-[1.95rem] font-medium leading-tight tracking-tight text-stone-900 dark:text-stone-100"
              style={serif}
            >
              {isSeat ? "Finish your login" : "Start with a code"}
            </h1>
            <p className="mt-1.5 text-sm text-stone-500 dark:text-stone-400">
              {isSeat
                ? "This is a personal login code — set your email and password to finish."
                : "Type the code your teacher gave you — no password needed."}
            </p>
          </header>

          {error && !succeeded && (
            <div
              id="quickstart-error"
              role="alert"
              className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
            >
              {error}
            </div>
          )}

          {notice && !succeeded && (
            <div
              role="status"
              aria-live="polite"
              className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
            >
              {notice}
            </div>
          )}

          {succeeded && (
            <div
              role="status"
              aria-live="polite"
              className="mb-5 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
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
              <span className="flex items-baseline justify-between">
                <span className={labelCls}>{isSeat ? "Your login code" : "Course code"}</span>
                <span
                  aria-live="polite"
                  className={`text-xs font-medium tabular-nums ${
                    codeValid
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-stone-400 dark:text-stone-500"
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
                className={codeInputCls}
                placeholder="ABC234"
              />
              <span
                id="quickstart-code-hint"
                className="mt-1 block text-xs text-stone-500 dark:text-stone-400"
              >
                {resolving
                  ? "Checking your code…"
                  : isSeat
                    ? "Your teacher already set your name — you just need email & password."
                    : "6 characters — letters and numbers (no O, 0, I, 1, or L)."}
              </span>
            </label>

            {!isSeat && (
              <label className="block">
                <span className={labelCls}>Full name</span>
                <input
                  ref={nameRef}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  disabled={succeeded}
                  className={fieldCls}
                  placeholder="e.g. Alex Chen"
                />
              </label>
            )}

            <label className="block">
              <span className={labelCls}>Email</span>
              <input
                ref={emailRef}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                disabled={succeeded}
                className={fieldCls}
                placeholder="you@example.com"
              />
            </label>

            {isSeat && (
              <label className="block">
                <span className={labelCls}>Confirm email</span>
                <input
                  type="email"
                  value={confirmEmail}
                  onChange={(e) => setConfirmEmail(e.target.value)}
                  autoComplete="email"
                  disabled={succeeded}
                  aria-invalid={confirmEmail.length > 0 && !emailsMatch}
                  className={fieldCls}
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
                <span className={labelCls}>Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                  disabled={succeeded}
                  className={fieldCls}
                  placeholder="At least 6 characters"
                />
                <span className="mt-1 block text-xs text-stone-500 dark:text-stone-400">
                  You'll use this email and password to sign in from now on.
                </span>
              </label>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              title={!codeValid ? "Enter the code your teacher gave you" : undefined}
              className={primaryBtn}
            >
              {busy
                ? isSeat
                  ? "Finishing…"
                  : "Starting…"
                : succeeded
                  ? "Started ✓"
                  : isSeat
                    ? "Claim my login"
                    : "Enter class"}
            </button>
          </form>

          {/* switch to password sign-in — mirrors the sign-in screen's
              "Join with a class code" card so the two surfaces are symmetric */}
          <div className="mt-6">
            <div className="mb-4 flex items-center gap-3" aria-hidden>
              <span className="h-px flex-1 bg-stone-200 dark:bg-white/10" />
              <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-stone-400 dark:text-stone-500">
                or
              </span>
              <span className="h-px flex-1 bg-stone-200 dark:bg-white/10" />
            </div>
            {/* Normal email + password sign-in, offered for BOTH roles so a
                returning student or an educator can always log in here. Each
                lands on the sign-in screen pre-set to that role (?role=…). */}
            <div className="space-y-2.5">
              {([
                {
                  role: "student" as const,
                  title: "Student sign-in",
                  sub: "Returning students — use your email & password.",
                },
                {
                  role: "educator" as const,
                  title: "Educator sign-in",
                  sub: "Teachers & admins.",
                },
              ]).map((opt) => (
                <button
                  key={opt.role}
                  type="button"
                  onClick={() => onSwitchToSignIn(opt.role)}
                  className="group flex w-full items-center gap-2 rounded-2xl border border-stone-300/80 bg-white/60 px-4 py-3.5 text-left shadow-sm transition hover:border-stone-900/30 hover:bg-white focus:outline-none focus:ring-4 focus:ring-stone-900/[0.06] sm:gap-3.5 dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-white/30 dark:hover:bg-white/[0.07]"
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
                      {opt.role === "educator" ? (
                        <>
                          <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                          <path d="M6 12v5c3 3 9 3 12 0v-5" />
                        </>
                      ) : (
                        <>
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </>
                      )}
                    </svg>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-stone-900 dark:text-stone-100">
                      {opt.title}
                    </span>
                    <span className="mt-0.5 block text-xs leading-snug text-stone-500 dark:text-stone-400">
                      {opt.sub}
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
              ))}
            </div>
          </div>

          {/* footer */}
          <div className="mt-8 border-t border-stone-200 pt-5 text-center dark:border-white/10">
            <p className="text-xs text-stone-400 dark:text-stone-500">
              Don't have a code? Ask your teacher to share one.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
