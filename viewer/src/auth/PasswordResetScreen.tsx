/**
 * PasswordResetScreen
 * ===================
 * Surface rendered while the user is inside a Supabase PASSWORD_RECOVERY
 * window. Supabase establishes the recovery session automatically when the
 * link in the reset email is clicked; the auth event is the canonical signal
 * (the `?reset=1` query param is just a hint and gets stripped by AuthGate
 * after success).
 *
 * The screen is intentionally tiny: new password + confirm + submit. On
 * success we hand control back to AuthGate by clearing the local
 * passwordResetActive flag — the user is then signed in normally.
 *
 * UX notes (Wave 21+):
 *  - Live validation on blur (don't yell at the user as they type the first
 *    character; only show errors after they've stepped away from the field).
 *  - Submit is gated on (non-empty, length >= 6, confirm matches, !busy,
 *    !done). Disabled tooltip explains why.
 *  - Server errors mapped to friendly copy ("same as current password",
 *    "rate limited", "weak password", network failure).
 *  - On success: emerald confirmation card with status role, brief countdown
 *    before AuthGate swaps surfaces so the user can read the success copy.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { AuthResult } from "./session";

interface PasswordResetScreenProps {
  updatePassword: (newPassword: string) => Promise<AuthResult>;
  /** Called once the password has been updated AND we want to hand back to
      the normal app. Strips the URL flag and clears the recovery flag. */
  onComplete: () => void;
}

const MIN_LENGTH = 6;
const HANDOFF_DELAY_MS = 1500;

function cleanError(message: string): string {
  const firstLine = message.split("\n")[0] ?? message;
  return firstLine.trim();
}

/**
 * Map Supabase auth.updateUser errors to friendly copy. The Supabase JS
 * client returns the message verbatim from GoTrue; matching on substrings
 * is the only stable contract.
 */
function friendlyError(raw: string): string {
  const msg = raw.toLowerCase();
  if (msg.includes("same") && msg.includes("password")) {
    return "That's the same password you had before. Pick a different one.";
  }
  if (
    msg.includes("rate limit") ||
    msg.includes("too many") ||
    msg.includes("429")
  ) {
    return "Too many attempts. Wait a minute and try again.";
  }
  if (msg.includes("weak") || msg.includes("strength")) {
    return "That password is too weak. Try a longer one with mixed characters.";
  }
  if (msg.includes("at least") || msg.includes("minimum")) {
    return `Password must be at least ${MIN_LENGTH} characters.`;
  }
  if (
    msg.includes("network") ||
    msg.includes("failed to fetch") ||
    msg.includes("offline")
  ) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  if (
    msg.includes("session") &&
    (msg.includes("expired") || msg.includes("invalid"))
  ) {
    return "Your reset link expired. Request a new one and try again.";
  }
  return cleanError(raw);
}

export function PasswordResetScreen({
  updatePassword,
  onComplete,
}: PasswordResetScreenProps) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newBlurred, setNewBlurred] = useState(false);
  const [confirmBlurred, setConfirmBlurred] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const newPasswordRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    newPasswordRef.current?.focus();
  }, []);

  const tooShort = newPassword.length > 0 && newPassword.length < MIN_LENGTH;
  const mismatched =
    confirmPassword.length > 0 && newPassword !== confirmPassword;
  const empty = newPassword.length === 0 || confirmPassword.length === 0;
  const canSubmit =
    !busy &&
    !done &&
    !empty &&
    newPassword.length >= MIN_LENGTH &&
    newPassword === confirmPassword;

  const disabledReason = useMemo(() => {
    if (busy) return "Updating your password…";
    if (done) return "Password updated.";
    if (empty) return "Enter and confirm your new password.";
    if (newPassword.length < MIN_LENGTH)
      return `Password must be at least ${MIN_LENGTH} characters.`;
    if (newPassword !== confirmPassword) return "Passwords don't match yet.";
    return undefined;
  }, [busy, done, empty, newPassword, confirmPassword]);

  const newError = newBlurred && tooShort
    ? `Password must be at least ${MIN_LENGTH} characters.`
    : null;
  const confirmError = confirmBlurred && mismatched
    ? "Passwords don't match."
    : null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    // Force errors visible on submit attempt even if the user hasn't blurred.
    setNewBlurred(true);
    setConfirmBlurred(true);
    if (!canSubmit) return;

    setBusy(true);
    try {
      const { error: err } = await updatePassword(newPassword);
      if (err) {
        setError(friendlyError(err));
        return;
      }
      setDone(true);
      // Give the user a beat to read the success message before AuthGate
      // swaps surfaces underneath them.
      window.setTimeout(() => {
        onComplete();
      }, HANDOFF_DELAY_MS);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Something went wrong.";
      setError(friendlyError(msg));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-sky-100 dark:from-slate-900 dark:via-slate-950 dark:to-indigo-950 px-4">
      <div
        className="w-full max-w-md rounded-2xl bg-white/90 dark:bg-slate-900/80 backdrop-blur shadow-xl ring-1 ring-slate-200 dark:ring-slate-800 p-8 space-y-6"
        aria-labelledby="password-reset-title"
      >
        <header className="space-y-1 text-center">
          <h1
            id="password-reset-title"
            className="text-2xl font-semibold text-slate-900 dark:text-slate-100"
          >
            {done ? "All set" : "Set a new password"}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {done
              ? "Your password was updated. Signing you in…"
              : "Choose a new password for your account. You'll be signed in automatically."}
          </p>
        </header>

        {done && (
          <div
            role="status"
            aria-live="polite"
            className="rounded-md bg-emerald-50 dark:bg-emerald-950/40 px-3 py-3 text-sm text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-200 dark:ring-emerald-900 motion-safe:transition-colors"
          >
            <div className="font-medium">Password updated</div>
            <div className="text-emerald-600/90 dark:text-emerald-300/80 mt-0.5">
              Hang tight — we're taking you to your account.
            </div>
          </div>
        )}

        {error && !done && (
          <div
            role="alert"
            className="rounded-md bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-sm text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-900 motion-safe:transition-colors"
          >
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              New password
            </span>
            <input
              ref={newPasswordRef}
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              onBlur={() => setNewBlurred(true)}
              autoComplete="new-password"
              minLength={MIN_LENGTH}
              disabled={busy || done}
              aria-invalid={newError ? true : undefined}
              aria-describedby="new-password-hint new-password-error"
              className={`mt-1 w-full min-h-[40px] rounded-lg border bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 disabled:opacity-60 disabled:cursor-not-allowed motion-safe:transition-colors ${
                newError
                  ? "border-rose-400 dark:border-rose-700 focus:ring-rose-500"
                  : "border-slate-300 dark:border-slate-700 focus:ring-indigo-500"
              }`}
              placeholder={`At least ${MIN_LENGTH} characters`}
            />
            <span
              id="new-password-hint"
              className="mt-1 block text-xs text-slate-500 dark:text-slate-400"
            >
              Use at least {MIN_LENGTH} characters. Longer is stronger.
            </span>
            {newError && (
              <span
                id="new-password-error"
                role="alert"
                className="mt-1 block text-xs text-rose-600 dark:text-rose-400"
              >
                {newError}
              </span>
            )}
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Confirm new password
            </span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onBlur={() => setConfirmBlurred(true)}
              autoComplete="new-password"
              minLength={MIN_LENGTH}
              disabled={busy || done}
              aria-invalid={confirmError ? true : undefined}
              aria-describedby="confirm-password-error"
              className={`mt-1 w-full min-h-[40px] rounded-lg border bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 disabled:opacity-60 disabled:cursor-not-allowed motion-safe:transition-colors ${
                confirmError
                  ? "border-rose-400 dark:border-rose-700 focus:ring-rose-500"
                  : "border-slate-300 dark:border-slate-700 focus:ring-indigo-500"
              }`}
              placeholder="Re-enter the new password"
            />
            {confirmError && (
              <span
                id="confirm-password-error"
                role="alert"
                className="mt-1 block text-xs text-rose-600 dark:text-rose-400"
              >
                {confirmError}
              </span>
            )}
          </label>

          <button
            type="submit"
            disabled={!canSubmit}
            title={disabledReason}
            aria-disabled={!canSubmit}
            className="w-full min-h-[40px] rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-2.5 motion-safe:transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-slate-900"
          >
            {busy ? "Updating…" : done ? "Updated" : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}
