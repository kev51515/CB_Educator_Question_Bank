/**
 * DigestsPage — parent progress digests (lane C).
 *
 * A course tab where the teacher reviews + sends a weekly progress digest to
 * each student's GUARDIANS via LINE. For each roster student it shows this
 * week's draft status; "Review & send" opens a ResponsiveModal with the
 * composed stats (read-only), an editable AI summary (with a "Generate with
 * AI" button), an editable teacher note, and "Approve & Send to parents".
 *
 * Delivery is LINE-only (guardians have synthetic @students.local emails).
 * Students with no guardian linked show a hint and a disabled send.
 *
 * Mounted by ClassLayout at /educator/courses/:courseId/digests — see the
 * integration note in the PR description. No emojis (CLAUDE.md).
 */
import { useMemo, useState } from "react";
import { useClassContext } from "./classLayoutContext";
import { useCourseDigests } from "./useDigests";
import type { DigestRosterRow, DigestStats, StudentDigest } from "./digests";
import { ResponsiveModal } from "@/components/ResponsiveModal";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { SkeletonRows } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/components/Toast";

function fmtPct(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : `${v}%`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

function StatsPreview({ stats }: { stats: DigestStats }): JSX.Element {
  const best = stats.best_recent_score;
  const prior = stats.prior_score;
  const delta =
    best !== null && prior !== null ? Math.round((best - prior) * 10) / 10 : null;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 ring-1 ring-slate-200 dark:ring-slate-700 p-3">
          <div className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Best score
          </div>
          <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {fmtPct(best)}
            {delta !== null && (
              <span
                className={
                  delta >= 0
                    ? "ml-1 text-xs font-medium text-emerald-600 dark:text-emerald-400"
                    : "ml-1 text-xs font-medium text-rose-600 dark:text-rose-400"
                }
              >
                {delta >= 0 ? `+${delta}` : delta}
              </span>
            )}
          </div>
        </div>
        <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 ring-1 ring-slate-200 dark:ring-slate-700 p-3">
          <div className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Completed
          </div>
          <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {stats.completed_this_week}
          </div>
        </div>
        <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 ring-1 ring-slate-200 dark:ring-slate-700 p-3">
          <div className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Due soon
          </div>
          <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {stats.due_soon}
          </div>
        </div>
      </div>

      {stats.recent_scores.length > 0 && (
        <div>
          <div className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
            Practice tests this week
          </div>
          <ul className="space-y-1">
            {stats.recent_scores.map((r, i) => (
              <li
                key={i}
                className="flex justify-between text-sm text-slate-700 dark:text-slate-300"
              >
                <span className="truncate pr-2">{r.test_title}</span>
                <span className="tabular-nums text-slate-500 dark:text-slate-400">
                  {r.score ?? "—"}
                  {r.total ? ` / ${r.total}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {stats.upcoming.length > 0 && (
        <div>
          <div className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
            Upcoming
          </div>
          <ul className="space-y-1">
            {stats.upcoming.map((u, i) => (
              <li
                key={i}
                className="flex justify-between text-sm text-slate-700 dark:text-slate-300"
              >
                <span className="truncate pr-2">{u.title}</span>
                <span className="text-slate-500 dark:text-slate-400">
                  {fmtDate(u.due_at)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

interface ReviewModalProps {
  row: DigestRosterRow;
  digest: StudentDigest;
  onClose: () => void;
  requestAiSummary: (input: {
    digestId?: string;
    stats?: DigestStats;
  }) => Promise<string>;
  approveAndSend: (
    digestId: string,
    aiSummary: string,
    note: string,
  ) => Promise<number>;
}

function ReviewModal({
  row,
  digest,
  onClose,
  requestAiSummary,
  approveAndSend,
}: ReviewModalProps): JSX.Element {
  const toast = useToast();
  const [summary, setSummary] = useState(digest.ai_summary ?? "");
  const [note, setNote] = useState(digest.teacher_note ?? "");
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const sent = digest.status === "sent";
  const noGuardian = row.guardian_count === 0;

  const onGenerate = async (): Promise<void> => {
    setGenerating(true);
    try {
      const text = await requestAiSummary({ digestId: digest.id });
      setSummary(text);
      toast.success("AI summary drafted", "Review + edit before sending.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not generate.";
      // 503 / ai_not_configured → graceful: keep stats-only.
      if (/not_configured|503/.test(msg)) {
        toast.info(
          "AI summary unavailable",
          "Send the stats-only digest, or add a note.",
        );
      } else {
        toast.error("AI summary failed", msg);
      }
    } finally {
      setGenerating(false);
    }
  };

  const onSend = async (): Promise<void> => {
    setSending(true);
    try {
      const count = await approveAndSend(digest.id, summary, note);
      if (count > 0) {
        toast.success(
          "Digest sent",
          `Delivered to ${count} guardian${count === 1 ? "" : "s"} via LINE.`,
        );
      } else {
        toast.warning(
          "Marked sent — no LINE delivery",
          "No guardian is linked to LINE for this student.",
        );
      }
      onClose();
    } catch (e) {
      toast.error(
        "Could not send",
        e instanceof Error ? e.message : "Try again.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <ResponsiveModal
      open
      onClose={onClose}
      title={`Weekly digest — ${row.display_name ?? "Student"}`}
      subtitle={`${fmtDate(digest.period_start)} – ${fmtDate(digest.period_end)}`}
      size="2xl"
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {noGuardian
              ? "No guardian linked — nothing will be delivered."
              : `${row.guardian_count} guardian${row.guardian_count === 1 ? "" : "s"} on file`}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={sent || sending}
              onClick={() => {
                void onSend();
              }}
              className="rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2"
            >
              {sending ? "Sending…" : "Approve & Send to parents"}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {sent && (
          <div
            role="status"
            className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-200 dark:ring-emerald-900"
          >
            Already sent {digest.sent_at ? `on ${fmtDate(digest.sent_at)}` : ""}.
          </div>
        )}

        <StatsPreview stats={digest.stats} />

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Summary for parents
            </label>
            <button
              type="button"
              disabled={generating || sent}
              onClick={() => {
                void onGenerate();
              }}
              className="rounded-lg bg-slate-100 dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-accent-50 dark:hover:bg-accent-950/40 disabled:opacity-50"
            >
              {generating ? "Generating…" : "Generate with AI"}
            </button>
          </div>
          <MarkdownEditor
            value={summary}
            onChange={setSummary}
            placeholder="A warm 2-3 sentence note about this week's progress…"
            minHeight={120}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
            Personal note (optional)
          </label>
          <MarkdownEditor
            value={note}
            onChange={setNote}
            placeholder="Anything you'd like to add for the parents…"
            minHeight={90}
          />
        </div>
      </div>
    </ResponsiveModal>
  );
}

export function DigestsPage(): JSX.Element {
  const { cls } = useClassContext();
  const courseId = cls.id;
  const toast = useToast();
  const {
    rows,
    loading,
    error,
    composeDigest,
    composeAll,
    requestAiSummary,
    approveAndSend,
  } = useCourseDigests(courseId);

  const [openStudentId, setOpenStudentId] = useState<string | null>(null);
  const [composingAll, setComposingAll] = useState(false);
  const [busyStudent, setBusyStudent] = useState<string | null>(null);

  const openRow = useMemo(
    () => rows.find((r) => r.student_id === openStudentId) ?? null,
    [rows, openStudentId],
  );

  const onComposeAll = async (): Promise<void> => {
    setComposingAll(true);
    try {
      const n = await composeAll();
      toast.success(
        "Drafts composed",
        `${n} student${n === 1 ? "" : "s"} ready to review.`,
      );
    } catch (e) {
      toast.error(
        "Could not compose drafts",
        e instanceof Error ? e.message : "Try again.",
      );
    } finally {
      setComposingAll(false);
    }
  };

  const onReview = async (row: DigestRosterRow): Promise<void> => {
    // Ensure there's a fresh draft before opening the modal.
    if (!row.digest) {
      setBusyStudent(row.student_id);
      try {
        await composeDigest(row.student_id);
      } catch (e) {
        toast.error(
          "Could not compose",
          e instanceof Error ? e.message : "Try again.",
        );
        setBusyStudent(null);
        return;
      }
      setBusyStudent(null);
    }
    setOpenStudentId(row.student_id);
  };

  if (loading) {
    return <SkeletonRows count={6} rowClassName="h-14" />;
  }

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-lg bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-sm text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-900"
      >
        {error}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No students yet"
        body="Enrol students in this course to send weekly parent progress digests."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Parent progress digests
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Review each student's weekly summary, then send it to their parents
            via LINE.
          </p>
        </div>
        <button
          type="button"
          disabled={composingAll}
          onClick={() => {
            void onComposeAll();
          }}
          className="rounded-lg bg-slate-100 dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-accent-50 dark:hover:bg-accent-950/40 disabled:opacity-50"
        >
          {composingAll ? "Composing…" : "Generate this week's drafts"}
        </button>
      </div>

      <div className="overflow-hidden rounded-xl ring-1 ring-slate-200 dark:ring-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900/60 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <tr>
              <th className="px-4 py-2.5 font-medium">Student</th>
              <th className="px-4 py-2.5 font-medium">Guardians</th>
              <th className="px-4 py-2.5 font-medium">This week</th>
              <th className="px-4 py-2.5 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
            {rows.map((row) => {
              const d = row.digest;
              const status = d?.status ?? null;
              return (
                <tr key={row.student_id}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900 dark:text-slate-100">
                      {row.display_name ?? row.email}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {row.guardian_count === 0 ? (
                      <span className="text-xs text-amber-600 dark:text-amber-400">
                        No guardian linked
                      </span>
                    ) : (
                      <span className="text-slate-600 dark:text-slate-300">
                        {row.guardian_count}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {status === "sent" ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-950/50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-200 dark:ring-emerald-900">
                        Sent {d?.sent_at ? fmtDate(d.sent_at) : ""}
                      </span>
                    ) : status === "draft" ? (
                      <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-700">
                        Draft ready
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        Not composed
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      disabled={busyStudent === row.student_id}
                      onClick={() => {
                        void onReview(row);
                      }}
                      className="rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5"
                    >
                      {busyStudent === row.student_id
                        ? "Composing…"
                        : status === "sent"
                          ? "View"
                          : "Review & send"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {openRow?.digest && (
        <ReviewModal
          row={openRow}
          digest={openRow.digest}
          onClose={() => setOpenStudentId(null)}
          requestAiSummary={requestAiSummary}
          approveAndSend={approveAndSend}
        />
      )}
    </div>
  );
}
