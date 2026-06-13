/**
 * UserDetailDrawer — admin per-user activity snapshot
 * ===================================================
 * Opens from the admin "All Users" table (click a name) to monitor one user at
 * a glance: identity, last sign-in / last activity, and how much they've done
 * (courses taught / enrolled, assignment attempts, full-test runs). Reads the
 * admin-only `admin_user_overview` RPC (0125). Modal contract per CLAUDE.md:
 * role="dialog", focus trap, Esc + backdrop close, ≥40px close target.
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { Skeleton } from "@/components/Skeleton";
import { LoginActivityPanel } from "@/components/LoginActivity";
import { useToast } from "@/components/Toast";
import type { ProfileRole } from "@/lib/profile";
import { formatDate, getErrorMessage, roleBadgeClass } from "./allUsersHelpers";

interface Overview {
  id: string;
  email: string;
  display_name: string | null;
  role: ProfileRole;
  created_at: string;
  last_sign_in_at: string | null;
  courses_teaching: number;
  courses_enrolled: number;
  assignment_attempts: number;
  test_runs: number;
  test_runs_submitted: number;
  last_active: string | null;
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

export function UserDetailDrawer({
  userId,
  onClose,
}: {
  userId: string | null;
  onClose: () => void;
}): JSX.Element | null {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, userId != null);
  const toast = useToast();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (!userId) return;
    const alive = { current: true };
    setData(null);
    setError(null);
    setLoading(true);
    void (async () => {
      try {
        const { data: res, error: err } = await supabase.rpc("admin_user_overview", { p_user_id: userId });
        if (!alive.current) return;
        if (err) throw err;
        setData(res as Overview);
      } catch (e) {
        if (alive.current) setError(getErrorMessage(e));
      } finally {
        if (alive.current) setLoading(false);
      }
    })();
    return () => {
      alive.current = false;
    };
  }, [userId]);

  const sendReset = async (): Promise<void> => {
    if (!data) return;
    setResetting(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(data.email, {
        redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
      });
      if (err) throw err;
      toast.success("Password reset sent", data.email);
    } catch (e) {
      toast.error("Couldn't send reset", getErrorMessage(e));
    } finally {
      setResetting(false);
    }
  };

  const copyId = async (): Promise<void> => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.id);
      toast.success("User ID copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  if (!userId) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="User details"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
            User details
          </h2>
          <button
            type="button"
            data-autofocus
            onClick={onClose}
            aria-label="Close"
            className="grid h-10 w-10 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-slate-800"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 px-5 py-5">
          {loading ? (
            <div className="space-y-3" aria-busy="true">
              <Skeleton className="h-6 w-48 rounded" />
              <Skeleton className="h-4 w-40 rounded" />
              <Skeleton className="h-24 w-full rounded-lg" />
            </div>
          ) : error ? (
            <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-900">
              {error}
            </p>
          ) : data ? (
            <div className="space-y-5">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {data.display_name ?? <span className="text-slate-400">No name</span>}
                  </h3>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${roleBadgeClass(data.role)}`}>
                    {data.role}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{data.email}</p>
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <Meta label="Joined" value={formatDate(data.created_at)} />
                <Meta label="Last sign-in" value={fmtDateTime(data.last_sign_in_at)} />
                <Meta label="Last active" value={fmtDateTime(data.last_active)} full />
              </dl>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  Activity
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Stat label="Courses teaching" value={data.courses_teaching} />
                  <Stat label="Courses enrolled" value={data.courses_enrolled} />
                  <Stat label="Assignment attempts" value={data.assignment_attempts} />
                  <Stat
                    label="Full-test runs"
                    value={`${data.test_runs_submitted}/${data.test_runs}`}
                    hint="submitted / total"
                  />
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  Login activity
                </p>
                <LoginActivityPanel userId={data.id} />
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  Quick actions
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void sendReset()}
                    disabled={resetting}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <rect x="3" y="5" width="18" height="14" rx="2" />
                      <path d="m3 7 9 6 9-6" />
                    </svg>
                    {resetting ? "Sending…" : "Send password reset"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyId()}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <rect x="9" y="9" width="13" height="13" rx="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    Copy user ID
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
                  Sends a password-reset email to {data.email}.
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value, full }: { label: string; value: string; full?: boolean }): JSX.Element {
  return (
    <div className={full ? "col-span-2" : ""}>
      <dt className="text-xs text-slate-400 dark:text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-slate-700 dark:text-slate-200 tabular-nums">{value}</dd>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }): JSX.Element {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200 dark:bg-slate-800/40 dark:ring-slate-800">
      <div className="text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">{value}</div>
      <div className="text-[11px] leading-tight text-slate-500 dark:text-slate-400">
        {label}
        {hint && <span className="block text-slate-400 dark:text-slate-500">{hint}</span>}
      </div>
    </div>
  );
}
