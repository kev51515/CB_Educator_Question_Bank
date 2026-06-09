/**
 * BetaGate — site-wide private-beta access screen
 * ===============================================
 * While the product is in closed beta we don't want casual visitors landing on
 * isportify.org and poking around before sign-in. BetaGate wraps the whole app
 * (outside the router + AuthGate) and, until the shared beta password is
 * entered, shows nothing but a password prompt. Once entered it's remembered in
 * localStorage so a beta tester only does it once per device.
 *
 * SECURITY NOTE: this is a *soft* gate, not authentication. The password is a
 * shared constant compiled into the client bundle, so a determined visitor can
 * read it from the JS. Its only job is to keep the beta out of the hands of
 * random/search traffic. Real access control is the Supabase sign-in that sits
 * behind this gate. Don't put anything sensitive behind the password alone.
 *
 * Local development (`vite` dev server) bypasses the gate so it never gets in
 * the way while building; any real deploy (production build) enforces it. Bump
 * UNLOCK_VERSION to force every device to re-enter the password (e.g. after
 * rotating it).
 */
import { useState, type FormEvent, type ReactNode } from "react";

const BETA_PASSWORD = "Taipei101";
const STORAGE_KEY = "isportify:beta:unlocked";
const UNLOCK_VERSION = "1";

function readUnlocked(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === UNLOCK_VERSION;
  } catch {
    return false; // private mode / storage disabled → show the gate
  }
}

function persistUnlocked(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, UNLOCK_VERSION);
  } catch {
    /* ignore — they'll just re-enter next visit */
  }
}

export function BetaGate({ children }: { children: ReactNode }): JSX.Element {
  // Dev server is never gated; deployed builds gate until the password is entered.
  const [unlocked, setUnlocked] = useState(() => import.meta.env.DEV || readUnlocked());

  if (unlocked) return <>{children}</>;
  return <BetaGateScreen onUnlock={() => setUnlocked(true)} />;
}

function BetaGateScreen({ onUnlock }: { onUnlock: () => void }): JSX.Element {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (value === BETA_PASSWORD) {
      persistUnlocked();
      onUnlock();
    } else {
      setError(true);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl bg-white p-7 shadow-xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">isportify</span>
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
              Private beta
            </span>
          </div>
          <h1 className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">
            Enter the access password
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            This site is in private beta. Ask your teacher for the password to continue.
          </p>

          <form onSubmit={submit} className="mt-5 space-y-3" noValidate>
            <div>
              <label htmlFor="beta-password" className="sr-only">
                Beta access password
              </label>
              <input
                id="beta-password"
                type="password"
                autoFocus
                autoComplete="off"
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  if (error) setError(false);
                }}
                aria-invalid={error}
                aria-describedby={error ? "beta-password-error" : undefined}
                placeholder="Password"
                className={`w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:bg-slate-950 dark:text-slate-100 ${
                  error
                    ? "border-rose-400 dark:border-rose-700"
                    : "border-slate-300 dark:border-slate-700"
                }`}
              />
              {error && (
                <p id="beta-password-error" role="alert" className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">
                  That password isn't right. Try again.
                </p>
              )}
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
            >
              Continue
            </button>
          </form>
        </div>
        <p className="mt-4 text-center text-[11px] text-slate-400 dark:text-slate-600">
          isportify · invitation-only beta
        </p>
      </div>
    </div>
  );
}
