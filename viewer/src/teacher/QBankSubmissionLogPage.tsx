/**
 * QBankSubmissionLogPage
 * ======================
 * Teacher-facing recovery surface for question-bank submissions.
 *
 * What it shows
 * -------------
 * The latest 100 rows of `qbank_submission_log` (migration 0046). Every
 * call to the `submit_qbank_attempt` RPC writes a row here — success or
 * failure. The page is designed so a teacher can:
 *
 *  1. Spot failed submissions immediately (Issues tab + emerald/rose
 *     status badges).
 *  2. Filter by course.
 *  3. Replay a failed submission — re-run the RPC with the original
 *     `client_attempt_id`. If the failure was transient (network blip)
 *     the replay succeeds; if it was structural (idempotency match,
 *     not_enrolled, etc.) the RPC returns the existing canonical state.
 *
 * Mount point
 * -----------
 * `/qbank-submissions` (`ROUTES.QBANK_LOG`) under StaffShell.
 *
 * Why a separate page (not a tab on Question Bank)
 * ------------------------------------------------
 * The audit log spans every course + every assignment + every student.
 * It deserves its own rail entry so it shows up next to the operational
 * surfaces (Inbox, Calendar) rather than tucked inside a content-authoring
 * page.
 */
import { useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { courseAssignmentAttemptPath } from "../lib/routes";
import { EmptyState } from "../components/EmptyState";
import { SkeletonRows } from "../components/Skeleton";
import { useToast } from "../components/Toast";
import { ConfirmDialog } from "./ConfirmDialog";
import { useQBankLog, type QBankLogEntry } from "./useQBankLog";

// --- Result-code → badge mapping ------------------------------------------
// The RPC returns a small set of stable string codes; we render each with a
// short label + palette swatch. Anything we don't recognise falls into the
// generic "Error" bucket — better to surface an unknown failure as a clear
// red badge than to silently treat it as success.

type BadgeTone = "emerald" | "amber" | "rose" | "slate";

interface BadgeMeta {
  label: string;
  tone: BadgeTone;
}

function badgeFor(code: string): BadgeMeta {
  switch (code) {
    case "success":
      return { label: "Submitted", tone: "emerald" };
    case "success_idempotent":
      return { label: "Duplicate (no-op)", tone: "amber" };
    case "max_attempts_reached":
      return { label: "Max attempts", tone: "amber" };
    case "not_enrolled":
      return { label: "Not enrolled", tone: "rose" };
    case "assignment_not_found":
      return { label: "Assignment missing", tone: "rose" };
    default:
      return { label: "Error", tone: "rose" };
  }
}

function toneClasses(tone: BadgeTone): string {
  switch (tone) {
    case "emerald":
      return "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 ring-emerald-200 dark:ring-emerald-900";
    case "amber":
      return "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 ring-amber-200 dark:ring-amber-900";
    case "rose":
      return "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 ring-rose-200 dark:ring-rose-900";
    case "slate":
    default:
      return "bg-slate-50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 ring-slate-200 dark:ring-slate-700";
  }
}

// --- Relative time --------------------------------------------------------

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diff = Date.now() - t;
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatAbsolute(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatScore(percent: number | null, attemptId: string | null): string {
  if (attemptId === null) return "—";
  if (percent === null) return "—";
  return `${percent.toFixed(0)}%`;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Resubmit failed.";
}

// --- Page -----------------------------------------------------------------

type TabKey = "all" | "issues";

export function QBankSubmissionLogPage() {
  const [tab, setTab] = useState<TabKey>("all");
  const [courseFilter, setCourseFilter] = useState<string>("");
  const [replayTarget, setReplayTarget] = useState<QBankLogEntry | null>(null);

  const { entries, loading, error, refresh } = useQBankLog({
    courseId: courseFilter || null,
    failuresOnly: tab === "issues",
  });

  // The course filter dropdown is derived from the entries we have in hand
  // — no extra round-trip. If a teacher has zero log rows the dropdown will
  // only show "All courses", which is fine since the table is empty anyway.
  const courseOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of entries) {
      if (e.course_id && !map.has(e.course_id)) {
        map.set(e.course_id, e.course_name || "—");
      }
    }
    return Array.from(map.entries()).sort((a, b) =>
      a[1].localeCompare(b[1]),
    );
  }, [entries]);

  // Issue-count badge on the "Issues" tab — quick scan signal.
  const issueCount = useMemo(
    () =>
      entries.filter((e) => {
        const b = badgeFor(e.result_code);
        return b.tone === "rose";
      }).length,
    [entries],
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50 to-sky-100 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 px-4 py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 p-6 space-y-2">
          <p className="text-xs uppercase tracking-wide text-indigo-600 dark:text-indigo-400 font-medium">
            Audit log
          </p>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Question Bank Submissions
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Audit log of every test submission. Failed/orphan submissions are
            highlighted so you can recover student work.
          </p>
        </header>

        <section
          aria-labelledby="log-title"
          className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 overflow-hidden"
        >
          <header className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-4 justify-between">
            <div className="flex items-center gap-2">
              <TabButton
                active={tab === "all"}
                onClick={() => setTab("all")}
                label="All"
              />
              <TabButton
                active={tab === "issues"}
                onClick={() => setTab("issues")}
                label="Issues"
                count={tab === "issues" ? undefined : issueCount}
              />
            </div>

            <div className="flex items-center gap-3">
              <label
                htmlFor="course-filter"
                className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >
                Course
              </label>
              <select
                id="course-filter"
                value={courseFilter}
                onChange={(e) => setCourseFilter(e.target.value)}
                className="rounded-md bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-700 px-2 py-1.5 text-sm text-slate-700 dark:text-slate-200"
              >
                <option value="">All courses</option>
                {courseOptions.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => void refresh()}
                className="rounded-md ring-1 ring-slate-200 dark:ring-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Refresh
              </button>
            </div>
          </header>

          {loading ? (
            <div className="px-6 py-6">
              <SkeletonRows count={5} />
            </div>
          ) : error ? (
            <p
              role="alert"
              className="px-6 py-8 text-sm text-rose-600 dark:text-rose-400"
            >
              {error}
            </p>
          ) : entries.length === 0 ? (
            <div className="py-4">
              <EmptyState
                icon="check"
                title={
                  tab === "issues"
                    ? "All clear — no failed submissions"
                    : "No submissions yet"
                }
                body={
                  tab === "issues"
                    ? "If a student submission ever fails, you'll see it here."
                    : "When students submit a question bank assignment, the audit row appears here."
                }
              />
            </div>
          ) : (
            <LogTable
              entries={entries}
              onReplay={(e) => setReplayTarget(e)}
            />
          )}
        </section>
      </div>

      {replayTarget && (
        <ReplayDialog
          entry={replayTarget}
          onClose={() => setReplayTarget(null)}
          onDone={() => {
            setReplayTarget(null);
            void refresh();
          }}
        />
      )}
    </div>
  );
}

// --- Sub-components --------------------------------------------------------

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}

function TabButton({ active, onClick, label, count }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-200 ring-1 ring-indigo-200 dark:ring-indigo-900"
          : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
      }`}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span className="ml-2 inline-flex items-center justify-center rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-xs font-semibold px-1.5 min-w-[20px]">
          {count}
        </span>
      )}
    </button>
  );
}

interface LogTableProps {
  entries: QBankLogEntry[];
  onReplay: (entry: QBankLogEntry) => void;
}

function LogTable({ entries, onReplay }: LogTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800/40 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
          <tr>
            <th className="px-6 py-3 font-medium">Time</th>
            <th className="px-6 py-3 font-medium">Course</th>
            <th className="px-6 py-3 font-medium">Assignment</th>
            <th className="px-6 py-3 font-medium">Student</th>
            <th className="px-6 py-3 font-medium">Result</th>
            <th className="px-6 py-3 font-medium">Score</th>
            <th className="px-6 py-3 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {entries.map((e) => {
            const badge = badgeFor(e.result_code);
            const isFailure = badge.tone === "rose";
            return (
              <tr key={e.id}>
                <td
                  className="px-6 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap"
                  title={formatAbsolute(e.created_at)}
                >
                  {formatRelative(e.created_at)}
                </td>
                <td className="px-6 py-3 text-slate-700 dark:text-slate-200">
                  {e.course_name}
                </td>
                <td className="px-6 py-3 text-slate-700 dark:text-slate-200">
                  {e.assignment_title}
                </td>
                <td className="px-6 py-3 text-slate-700 dark:text-slate-200">
                  <div className="flex flex-col">
                    <span>{e.student_name || "—"}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {e.student_email}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${toneClasses(
                      badge.tone,
                    )}`}
                    title={e.error_message ?? undefined}
                  >
                    {isFailure && e.error_message
                      ? `Failed: ${truncate(e.error_message, 40)}`
                      : badge.label}
                  </span>
                </td>
                <td className="px-6 py-3 text-slate-900 dark:text-slate-100 font-medium whitespace-nowrap">
                  {formatScore(e.score_percent, e.attempt_id)}
                </td>
                <td className="px-6 py-3 text-right whitespace-nowrap">
                  {e.attempt_id ? (
                    <a
                      href={courseAssignmentAttemptPath(e.course_id, e.assignment_id, e.attempt_id)}
                      className="rounded-md bg-indigo-50 dark:bg-indigo-950/40 ring-1 ring-indigo-200 dark:ring-indigo-900 px-2.5 py-1 text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40"
                    >
                      View attempt
                    </a>
                  ) : isFailure ? (
                    <button
                      type="button"
                      onClick={() => onReplay(e)}
                      className="rounded-md bg-rose-50 dark:bg-rose-950/40 ring-1 ring-rose-200 dark:ring-rose-900 px-2.5 py-1 text-xs font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/40"
                    >
                      Replay
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

// --- Replay dialog --------------------------------------------------------

interface ReplayDialogProps {
  entry: QBankLogEntry;
  onClose: () => void;
  onDone: () => void;
}

/**
 * Shows the original payload (formatted JSON, capped at 30 lines) and a
 * "Try resubmit" button. The replay calls `submit_qbank_attempt` with the
 * same assignment + payload — preserving the original `client_attempt_id`
 * if present so the RPC's idempotency key still matches. That way a
 * transient failure becomes a clean success, and a structural failure
 * returns the existing canonical state without creating a duplicate.
 */
function ReplayDialog({ entry, onClose, onDone }: ReplayDialogProps) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const json = useMemo(() => {
    try {
      return JSON.stringify(entry.payload, null, 2);
    } catch {
      return "(payload not displayable)";
    }
  }, [entry.payload]);

  const previewLines = json.split("\n");
  const truncated = previewLines.length > 30;
  const preview = truncated
    ? `${previewLines.slice(0, 30).join("\n")}\n… (${previewLines.length - 30} more lines)`
    : json;

  const handleResubmit = async (): Promise<void> => {
    setBusy(true);
    try {
      // Re-inject the original client_attempt_id (if any) so the RPC's
      // idempotency check keys on the same value. The payload object
      // already came from the audit log row, but we belt-and-brace it
      // here in case the original payload didn't carry it explicitly.
      const payload: Record<string, unknown> = { ...entry.payload };
      if (entry.client_attempt_id && !payload["clientAttemptId"]) {
        payload["clientAttemptId"] = entry.client_attempt_id;
      }

      const { data, error } = await supabase.rpc("submit_qbank_attempt", {
        p_assignment_id: entry.assignment_id,
        p_payload: payload,
      });

      if (error) {
        toast.error("Resubmit failed", error.message);
        return;
      }
      const newAttemptId = typeof data === "string" ? data : null;
      if (newAttemptId) {
        toast.success(
          "Resubmitted",
          "Attempt recorded — refreshing the log.",
        );
      } else {
        toast.info(
          "Replay completed",
          "RPC returned no attempt id — see the log for the new row.",
        );
      }
      onDone();
    } catch (err: unknown) {
      toast.error("Resubmit failed", getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const body = (
    <div className="space-y-3">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Re-runs the original submission with the same idempotency key. If the
        original failure was transient, this creates the attempt. If it was
        structural, the RPC returns the existing canonical state without
        creating a duplicate.
      </p>
      {entry.error_message && (
        <div className="rounded-md bg-rose-50 dark:bg-rose-950/40 ring-1 ring-rose-200 dark:ring-rose-900 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
          <span className="font-medium">Original error:</span>{" "}
          {entry.error_message}
        </div>
      )}
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
          Payload
        </p>
        <pre className="max-h-72 overflow-auto rounded-md bg-slate-900 text-slate-100 text-xs p-3 font-mono whitespace-pre">
          {preview}
        </pre>
      </div>
    </div>
  );

  return (
    <ConfirmDialog
      title={`Replay submission for ${entry.student_name || entry.student_email || "student"}`}
      body={body}
      confirmLabel="Try resubmit"
      busy={busy}
      onConfirm={() => void handleResubmit()}
      onCancel={onClose}
    />
  );
}
