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
 */
import { useEffect, useRef, useState } from "react";
import type { AuthResult } from "./session";

interface PasswordResetScreenProps {
  updatePassword: (newPassword: string) => Promise<AuthResult>;
  /** Called once the password has been updated AND we want to hand back to
      the normal app. Strips the URL flag and clears the recovery flag. */
  onComplete: () => void;
}

function cleanError(message: string): string {
  const firstLine = message.split("\n")[0] ?? message;
  return firstLine.trim();
}

export function PasswordResetScreen({
  updatePassword,
  onComplete,
}: PasswordResetScreenProps) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const newPasswordRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    newPasswordRef.current?.focus();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await updatePassword(newPassword);
      if (err) {
        setError(cleanError(err));
        return;
      }
      setNotice("Password updated — signing you in…");
      // Give the user a beat to read the success message before AuthGate
      // swaps surfaces underneath them.
      window.setTimeout(() => {
        onComplete();
      }, 900);
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
            Set a new password
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Choose a new password for your account.
          </p>
        </header>

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

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              New password
            </span>
            <input
              ref={newPasswordRef}
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={6}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="At least 6 characters"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Confirm new password
            </span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              minLength={6}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Re-enter the new password"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-slate-900"
          >
            {busy ? "Updating…" : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}
