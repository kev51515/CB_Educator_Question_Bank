/**
 * QuickStartScreen
 * ================
 * Frictionless entry path. The student types:
 *   - the short course code their teacher gave them
 *   - their full name
 *   - their email (collected but NOT verified — teacher controls distribution)
 *
 * On submit:
 *   1. Mint an anonymous Supabase session via `signInAnonymously()`.
 *   2. Call the `quick_start_with_code` RPC which, in one transaction,
 *      stamps the name + email onto the just-created profile row and
 *      enrolls the user in the course.
 *   3. Do NOT navigate explicitly — AuthGate will re-render on its own when
 *      the auth + profile streams settle.
 *
 * Optional `prefillCode` is supplied by AuthGate when the URL contains
 * `?code=XYZ` so a QR-scanned deeplink lands with the code already filled.
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

interface QuickStartScreenProps {
  prefillCode?: string;
  onSwitchToSignIn: () => void;
}

/**
 * Map Supabase / Postgres error messages to user-friendly copy. Falls back
 * to a cleaned version of the raw message for anything unrecognised.
 */
function mapRpcError(raw: string): string {
  const msg = raw.toLowerCase();
  if (msg.includes("invalid_join_code")) {
    return "That code didn't match an active course. Check with your teacher.";
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

export function QuickStartScreen({ prefillCode, onSwitchToSignIn }: QuickStartScreenProps) {
  const [code, setCode] = useState<string>(prefillCode ?? "");
  const [name, setName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const codeRef = useRef<HTMLInputElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // If the code was prefilled (deeplink), skip past it and focus the
    // student's name field. Otherwise focus the code field.
    if (prefillCode) {
      nameRef.current?.focus();
    } else {
      codeRef.current?.focus();
    }
  }, [prefillCode]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedCode = code.trim();
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (!trimmedCode) {
      setError("Please enter your course code.");
      return;
    }
    if (!trimmedName) {
      setError("Please enter your full name.");
      return;
    }
    if (!trimmedEmail) {
      setError("Please enter your email.");
      return;
    }
    setBusy(true);
    try {
      // 1. Mint anonymous session.
      const { error: anonError } = await supabase.auth.signInAnonymously();
      if (anonError) {
        const code =
          (anonError as unknown as { code?: string | null }).code ?? null;
        if (isAnonymousDisabled(anonError.message, code)) {
          setError(
            "Quick-start is disabled. Ask your teacher to enable it (Supabase Dashboard → Authentication → Sign In/Up → Allow anonymous sign-ins) or use Sign In above.",
          );
        } else {
          setError(anonError.message);
        }
        return;
      }

      // 2. Call the RPC. By the time `signInAnonymously` resolves the JWT
      // is already attached to the supabase-js client, so the RPC call
      // carries the authenticated context.
      const { error: rpcError } = await supabase.rpc("quick_start_with_code", {
        p_code: trimmedCode,
        p_name: trimmedName,
        p_email: trimmedEmail,
      });
      if (rpcError) {
        setError(mapRpcError(rpcError.message));
        return;
      }

      // 3. Success — AuthGate's session + profile hooks will pick up the
      // new state on their own. No navigation required here.
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
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
            Type the code your teacher gave you — no password needed.
          </p>
        </header>

        {error && (
          <div
            role="alert"
            className="rounded-md bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-sm text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-900"
          >
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Course code
            </span>
            <input
              ref={codeRef}
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              autoComplete="one-time-code"
              spellCheck={false}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 font-mono tracking-widest text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="ABCD1234"
            />
          </label>
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
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. Alex Chen"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Email
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
            {busy ? "Starting…" : "Start"}
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
