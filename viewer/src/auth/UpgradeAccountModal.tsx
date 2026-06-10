/**
 * UpgradeAccountModal
 * ===================
 * Modal that asks an anonymous (QuickStart) user for an email and password
 * to convert their guest account into a permanent one. Calls
 * upgradeAnonymousAccount, which under the hood is
 * supabase.auth.updateUser({ email, password }) — preserving the same
 * user_id so all the student's progress stays linked to them.
 *
 * On success we show a small "Account saved!" notice and close after a
 * short delay so the AccountUpgradeBanner's auth-state listener has time
 * to flip is_anonymous to false.
 */
import { useEffect, useRef, useState } from "react";
import type { AuthResult } from "./session";
import { useFocusTrap } from "@/hooks";

interface UpgradeAccountModalProps {
  upgradeAnonymousAccount: (email: string, password: string) => Promise<AuthResult>;
  onClose: () => void;
}

export function UpgradeAccountModal({
  upgradeAnonymousAccount,
  onClose,
}: UpgradeAccountModalProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(panelRef, true);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(onClose, 1800);
    return () => clearTimeout(t);
  }, [done, onClose]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError("Please enter your email.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await upgradeAnonymousAccount(email.trim(), password);
      if (err) {
        if (err === "email_exists") {
          setError(
            "That email is already in use. Sign out and sign in with your existing account instead.",
          );
        } else {
          setError(err);
        }
        return;
      }
      setDone(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-account-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4"
      onClick={!busy ? onClose : undefined}
    >
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-slate-200 dark:ring-slate-800 p-6 space-y-5"
      >
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label="Close"
          className="absolute right-3 top-3 inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 disabled:opacity-60"
        >
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            className="h-5 w-5"
            aria-hidden="true"
          >
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        </button>
        <header className="space-y-1 pr-10">
          <h2
            id="upgrade-account-title"
            className="text-lg font-semibold text-slate-900 dark:text-slate-100"
          >
            Save your account
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Add an email and password so you can sign in from any device. Your
            progress and class memberships will stay linked to you.
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

        {done ? (
          <div
            role="status"
            className="rounded-md bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-200 dark:ring-emerald-900"
          >
            Account saved! You can now sign in from any device.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Email
              </span>
              <input
                ref={emailRef}
                data-autofocus
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={6}
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="At least 6 characters"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Confirm password
              </span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                minLength={6}
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Repeat password"
              />
            </label>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 text-sm font-medium px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60"
              >
                Maybe later
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2"
              >
                {busy ? "Saving…" : "Save account"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
