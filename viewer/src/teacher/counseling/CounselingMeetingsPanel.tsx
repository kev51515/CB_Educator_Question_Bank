/**
 * CounselingMeetingsPanel
 * =======================
 * Counselor-private meeting log for a single student in a course. The viewer is
 * the COUNSELOR; these notes are private to counselors and RLS on
 * `counseling_meetings` enforces who can read/write them — this component does
 * no client-side gating beyond what the table allows.
 *
 * Data: `counseling_meetings` (id, course_id, student_id, met_on, summary,
 * next_steps, created_at, updated_at), ordered by `met_on` descending so the
 * most recent meeting is first.
 *
 * UI: a "Log a meeting" form at the top (date + summary + next steps), then a
 * vertical TIMELINE (most-recent-first) with a connecting rail and a node per
 * meeting. Each entry shows the met_on date prominently, the summary, and a
 * clearly-labeled "Next steps" callout when present. Entries can be edited
 * inline or removed (with a destructive ConfirmDialog). The empty state offers
 * a CTA that focuses the summary field to log the first meeting.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast, MarkdownEditor, SmartDatePicker } from "@/components";
import { SkeletonRows } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmDialog } from "../ConfirmDialog";

interface Meeting {
  id: string;
  course_id: string;
  student_id: string;
  met_on: string;
  summary: string | null;
  next_steps: string | null;
  created_at: string;
  updated_at: string;
}

interface Props {
  courseId: string;
  studentId: string;
}

function todayStr(): string {
  // Local-date YYYY-MM-DD persisted to `met_on`.
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** `met_on` (YYYY-MM-DD) → local-noon ISO string for <SmartDatePicker>. */
function dateStrToIso(value: string): string | null {
  const [y, m, d] = value.split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return null;
  // Noon local avoids the picker's end-of-day rollover crossing a day boundary.
  return new Date(y, m - 1, d, 12, 0, 0).toISOString();
}

/** <SmartDatePicker> ISO string → local YYYY-MM-DD for `met_on`. */
function isoToDateStr(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function formatMetOn(value: string): string {
  // `met_on` is a plain date string (YYYY-MM-DD). Parse as local, not UTC, so
  // the displayed day matches what the counselor entered.
  const [y, m, d] = value.split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return value;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Compact two-line date parts (e.g. "MAR" / "14") for a timeline node. */
function metOnParts(value: string): { month: string; day: string } | null {
  const [y, m, d] = value.split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  return {
    month: date
      .toLocaleDateString(undefined, { month: "short" })
      .toUpperCase(),
    day: String(d),
  };
}

/** True when a MarkdownEditor's HTML has no visible content (empty `<p>`s). */
function isHtmlEmpty(html: string): boolean {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, "").trim().length === 0;
}

/**
 * MeetingDateField
 * ----------------
 * Shared wrapper that bridges <SmartDatePicker> (ISO strings) and the
 * `met_on` plain-date (YYYY-MM-DD) state used by both the add form and the
 * inline editor, so the two date inputs don't duplicate the conversion glue.
 */
function MeetingDateField({
  value,
  onChange,
}: {
  value: string; // YYYY-MM-DD
  onChange: (next: string) => void;
}) {
  return (
    <SmartDatePicker
      label="Date"
      allowClear={false}
      value={dateStrToIso(value)}
      onChange={(iso) => onChange(isoToDateStr(iso) || todayStr())}
    />
  );
}

export function CounselingMeetingsPanel({ courseId, studentId }: Props) {
  const toast = useToast();
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);

  // New-meeting form state.
  const [newDate, setNewDate] = useState(todayStr());
  const [newSummary, setNewSummary] = useState("");
  const [newNextSteps, setNewNextSteps] = useState("");
  const [saving, setSaving] = useState(false);
  const newFormRef = useRef<HTMLDivElement | null>(null);

  // Per-row edit + delete state.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [editNextSteps, setEditNextSteps] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Meeting | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    const { data, error } = await supabase
      .from("counseling_meetings")
      .select("*")
      .eq("course_id", courseId)
      .eq("student_id", studentId)
      .order("met_on", { ascending: false });
    if (!aliveRef.current) return;
    if (error) {
      toast.error("Couldn't load meeting notes", error.message);
      setMeetings([]);
    } else {
      setMeetings((data ?? []) as Meeting[]);
    }
    setLoading(false);
  }, [courseId, studentId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const onAdd = async (): Promise<void> => {
    if (saving) return;
    setSaving(true);
    const { error } = await supabase.from("counseling_meetings").insert({
      course_id: courseId,
      student_id: studentId,
      met_on: newDate || todayStr(),
      summary: isHtmlEmpty(newSummary) ? null : newSummary,
      next_steps: isHtmlEmpty(newNextSteps) ? null : newNextSteps,
    });
    if (!aliveRef.current) return;
    setSaving(false);
    if (error) {
      toast.error("Couldn't save meeting", error.message);
      return;
    }
    setNewDate(todayStr());
    setNewSummary("");
    setNewNextSteps("");
    toast.success("Meeting logged");
    void load();
  };

  const beginEdit = (m: Meeting): void => {
    setEditingId(m.id);
    setEditDate(m.met_on);
    setEditSummary(m.summary ?? "");
    setEditNextSteps(m.next_steps ?? "");
  };

  const cancelEdit = (): void => {
    setEditingId(null);
  };

  const onSaveEdit = async (id: string): Promise<void> => {
    if (savingEdit) return;
    setSavingEdit(true);
    const { error } = await supabase
      .from("counseling_meetings")
      .update({
        met_on: editDate || todayStr(),
        summary: isHtmlEmpty(editSummary) ? null : editSummary,
        next_steps: isHtmlEmpty(editNextSteps) ? null : editNextSteps,
      })
      .eq("id", id);
    if (!aliveRef.current) return;
    setSavingEdit(false);
    if (error) {
      toast.error("Couldn't update meeting", error.message);
      return;
    }
    setEditingId(null);
    toast.success("Meeting updated");
    void load();
  };

  const onConfirmDelete = async (): Promise<void> => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    const { error } = await supabase
      .from("counseling_meetings")
      .delete()
      .eq("id", pendingDelete.id);
    if (!aliveRef.current) return;
    setDeleting(false);
    if (error) {
      toast.error("Couldn't remove meeting", error.message);
      return;
    }
    setPendingDelete(null);
    toast.success("Meeting removed");
    void load();
  };

  return (
    <section className="rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white/80 dark:bg-slate-900/60 px-5 py-5 space-y-4">
      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
        Meeting notes
      </h3>

      {/* Log a meeting */}
      <div
        ref={newFormRef}
        className="space-y-3 rounded-xl ring-1 ring-slate-200 dark:ring-slate-800 bg-slate-50/60 dark:bg-slate-900/40 p-4"
      >
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Log a meeting
        </p>
        <MeetingDateField value={newDate} onChange={setNewDate} />
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
            Summary
          </label>
          <MarkdownEditor
            value={newSummary}
            onChange={setNewSummary}
            placeholder="What did you discuss?"
            minHeight={96}
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
            Next steps
          </label>
          <MarkdownEditor
            value={newNextSteps}
            onChange={setNewNextSteps}
            placeholder="Agreed follow-ups (optional)"
            minHeight={72}
          />
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              void onAdd();
            }}
            disabled={saving}
            className="min-h-[40px] rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* Timeline (most-recent-first) */}
      {loading ? (
        <SkeletonRows count={3} />
      ) : meetings.length === 0 ? (
        <EmptyState
          icon="pencil"
          title="No meetings logged yet"
          body="Keep a private running record of every counseling conversation. Log your first meeting to start the timeline."
          cta={{
            label: "Log first meeting",
            onClick: () => {
              newFormRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "center",
              });
              newFormRef.current
                ?.querySelector<HTMLElement>('[contenteditable="true"]')
                ?.focus();
            },
          }}
        />
      ) : (
        <ol className="relative space-y-4 pl-7">
          {/* Vertical rail behind the timeline nodes. */}
          <span
            aria-hidden
            className="pointer-events-none absolute left-[10px] top-1 bottom-1 w-px bg-slate-200 dark:bg-slate-800"
          />
          {meetings.map((m) => {
            const isEditing = editingId === m.id;
            const parts = metOnParts(m.met_on);
            return (
              <li key={m.id} className="relative">
                {/* Timeline node aligned to the rail. */}
                <span
                  aria-hidden
                  className="absolute -left-7 top-3 flex h-[21px] w-[21px] items-center justify-center rounded-full bg-white dark:bg-slate-900 ring-2 ring-indigo-400 dark:ring-indigo-500"
                >
                  <span className="h-2 w-2 rounded-full bg-indigo-500" />
                </span>
                <div className="rounded-xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2">
                {isEditing ? (
                  <div className="space-y-3">
                    <MeetingDateField value={editDate} onChange={setEditDate} />
                    <div>
                      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                        Summary
                      </label>
                      <MarkdownEditor
                        value={editSummary}
                        onChange={setEditSummary}
                        minHeight={96}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                        Next steps
                      </label>
                      <MarkdownEditor
                        value={editNextSteps}
                        onChange={setEditNextSteps}
                        minHeight={72}
                      />
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="min-h-[40px] rounded-lg px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void onSaveEdit(m.id);
                        }}
                        disabled={savingEdit}
                        className="min-h-[40px] rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {savingEdit ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-baseline gap-2">
                        {parts && (
                          <span className="inline-flex items-baseline gap-1 rounded-md bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 text-indigo-700 dark:text-indigo-300">
                            <span className="text-[11px] font-semibold uppercase tracking-wide">
                              {parts.month}
                            </span>
                            <span className="text-base font-bold leading-none">
                              {parts.day}
                            </span>
                          </span>
                        )}
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {formatMetOn(m.met_on)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => beginEdit(m)}
                          className="min-h-[40px] rounded-md px-2.5 py-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(m)}
                          className="min-h-[40px] rounded-md ring-1 ring-rose-300 dark:ring-rose-800 bg-rose-50 dark:bg-rose-950/40 px-2.5 py-1 text-xs font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/40"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    {m.summary && !isHtmlEmpty(m.summary) ? (
                      <div
                        className="prose prose-sm dark:prose-invert max-w-none text-sm text-slate-700 dark:text-slate-300"
                        dangerouslySetInnerHTML={{ __html: m.summary }}
                      />
                    ) : (
                      <p className="text-sm italic text-slate-400 dark:text-slate-500">
                        No summary.
                      </p>
                    )}
                    {m.next_steps && !isHtmlEmpty(m.next_steps) && (
                      <div className="rounded-lg border-l-2 border-emerald-400 dark:border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                          Next steps
                        </p>
                        <div
                          className="prose prose-sm dark:prose-invert mt-0.5 max-w-none text-sm text-slate-700 dark:text-slate-300"
                          dangerouslySetInnerHTML={{ __html: m.next_steps }}
                        />
                      </div>
                    )}
                  </>
                )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Remove meeting note"
          body={
            <>
              Remove the note from{" "}
              <span className="font-semibold">
                {formatMetOn(pendingDelete.met_on)}
              </span>
              ? This can't be undone.
            </>
          }
          confirmLabel="Remove"
          destructive
          busy={deleting}
          onConfirm={() => {
            void onConfirmDelete();
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </section>
  );
}
