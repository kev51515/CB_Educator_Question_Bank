/**
 * SeatClaimRequestsPanel
 * ======================
 * Amber strip at the top of the Roster tab that surfaces pending seat-claim
 * (login recovery) requests. Renders nothing when there are none.
 *
 * Approving resets that seat's sign-in to the requested email + password —
 * the student's name and work are untouched (same profile id). See migration
 * 0095 + useSeatClaimRequests.
 */
import { useState } from "react";
import { useToast } from "@/components/Toast";
import { useSeatClaimRequests } from "./useSeatClaimRequests";

interface SeatClaimRequestsPanelProps {
  courseId: string;
  /** Called after a successful approve so the parent roster can re-fetch. */
  onChange?: () => void;
}

function mapDecideError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("email_in_use")) return "That email is now attached to another account.";
  if (m.includes("already_decided")) return "This request was already handled.";
  if (m.includes("not_authorized")) return "You don't have permission to decide this.";
  if (m.includes("not_found")) return "This request no longer exists.";
  return "Couldn't complete that. Please try again.";
}

export function SeatClaimRequestsPanel({
  courseId,
  onChange,
}: SeatClaimRequestsPanelProps): JSX.Element | null {
  const { requests, error, decide } = useSeatClaimRequests(courseId);
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  // Nothing to show, and no error → render nothing.
  if (requests.length === 0 && !error) return null;

  if (requests.length === 0 && error) {
    return (
      <div className="px-6 py-3 border-b border-rose-200 dark:border-rose-900 bg-rose-50/60 dark:bg-rose-950/20">
        <p role="alert" className="text-xs text-rose-700 dark:text-rose-300">
          Couldn't load login requests. Refresh to try again.
        </p>
      </div>
    );
  }

  const handle = async (id: string, approve: boolean, who: string): Promise<void> => {
    setBusyId(id);
    try {
      const res = await decide(id, approve);
      if (!res.ok) {
        toast.error(mapDecideError(res.error ?? ""));
        return;
      }
      toast.success(
        approve ? `Approved login for ${who}.` : `Denied login request for ${who}.`,
      );
      onChange?.();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="px-6 py-4 border-b border-amber-200 dark:border-amber-900 bg-amber-50/70 dark:bg-amber-950/30">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
        Login requests ({requests.length})
      </h3>
      <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
        A student is asking to claim a login that's already in use. Approving resets that
        student's sign-in to the new email &amp; password — their name and work stay the same.
      </p>
      <ul className="mt-3 space-y-2">
        {requests.map((r) => {
          const who = r.display_name ?? r.roster_code;
          const busy = busyId === r.id;
          return (
            <li
              key={r.id}
              className="flex flex-wrap items-center gap-3 rounded-lg bg-white/80 dark:bg-slate-900/60 ring-1 ring-amber-200 dark:ring-amber-900 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                  {who}{" "}
                  <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                    ({r.roster_code})
                  </span>
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  new email:{" "}
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    {r.requested_email}
                  </span>
                  {r.current_email ? <> · current: {r.current_email}</> : null}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handle(r.id, false, who)}
                  className="rounded-md text-xs font-medium px-3 py-1.5 min-h-[34px] text-rose-600 dark:text-rose-400 ring-1 ring-rose-300 dark:ring-rose-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:opacity-60"
                >
                  Deny
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handle(r.id, true, who)}
                  className="rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-3 py-1.5 min-h-[34px] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-500 disabled:opacity-60"
                >
                  {busy ? "…" : "Approve"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
