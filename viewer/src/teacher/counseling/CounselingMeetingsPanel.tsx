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
 * chronological list. Each entry can be edited inline or removed (with a
 * destructive ConfirmDialog).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components";
import { SkeletonRows } from "@/components/Skeleton";
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
  // Local-date YYYY-MM-DD for an <input type="date"> default.
  const d = new Date();
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

const inputCls =
  "w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500";

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
      summary: newSummary.trim() || null,
      next_steps: newNextSteps.trim() || null,
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
        summary: editSummary.trim() || null,
        next_steps: editNextSteps.trim() || null,
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
      <div className="space-y-2 rounded-xl ring-1 ring-slate-200 dark:ring-slate-800 bg-slate-50/60 dark:bg-slate-900/40 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Log a meeting
        </p>
        <div>
          <label
            htmlFor="counseling-new-date"
            className="block text-xs text-slate-500 dark:text-slate-400 mb-1"
          >
            Date
          </label>
          <input
            id="counseling-new-date"
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className={`${inputCls} min-h-[40px]`}
          />
        </div>
        <div>
          <label
            htmlFor="counseling-new-summary"
            className="block text-xs text-slate-500 dark:text-slate-400 mb-1"
          >
            Summary
          </label>
          <textarea
            id="counseling-new-summary"
            value={newSummary}
            onChange={(e) => setNewSummary(e.target.value)}
            rows={3}
            placeholder="What did you discuss?"
            className={inputCls}
          />
        </div>
        <div>
          <label
            htmlFor="counseling-new-next"
            className="block text-xs text-slate-500 dark:text-slate-400 mb-1"
          >
            Next steps
          </label>
          <textarea
            id="counseling-new-next"
            value={newNextSteps}
            onChange={(e) => setNewNextSteps(e.target.value)}
            rows={2}
            placeholder="Agreed follow-ups (optional)"
            className={inputCls}
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

      {/* List */}
      {loading ? (
        <SkeletonRows count={3} />
      ) : meetings.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No meetings logged yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {meetings.map((m) => {
            const isEditing = editingId === m.id;
            return (
              <li
                key={m.id}
                className="rounded-xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2"
              >
                {isEditing ? (
                  <div className="space-y-2">
                    <div>
                      <label
                        htmlFor={`counseling-edit-date-${m.id}`}
                        className="block text-xs text-slate-500 dark:text-slate-400 mb-1"
                      >
                        Date
                      </label>
                      <input
                        id={`counseling-edit-date-${m.id}`}
                        type="date"
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)}
                        className={`${inputCls} min-h-[40px]`}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`counseling-edit-summary-${m.id}`}
                        className="block text-xs text-slate-500 dark:text-slate-400 mb-1"
                      >
                        Summary
                      </label>
                      <textarea
                        id={`counseling-edit-summary-${m.id}`}
                        value={editSummary}
                        onChange={(e) => setEditSummary(e.target.value)}
                        rows={3}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`counseling-edit-next-${m.id}`}
                        className="block text-xs text-slate-500 dark:text-slate-400 mb-1"
                      >
                        Next steps
                      </label>
                      <textarea
                        id={`counseling-edit-next-${m.id}`}
                        value={editNextSteps}
                        onChange={(e) => setEditNextSteps(e.target.value)}
                        rows={2}
                        className={inputCls}
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
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {formatMetOn(m.met_on)}
                      </p>
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
                    {m.summary ? (
                      <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
                        {m.summary}
                      </p>
                    ) : (
                      <p className="text-sm italic text-slate-400 dark:text-slate-500">
                        No summary.
                      </p>
                    )}
                    {m.next_steps && (
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        <span className="font-medium text-slate-600 dark:text-slate-300">
                          Next steps:
                        </span>{" "}
                        <span className="whitespace-pre-wrap">{m.next_steps}</span>
                      </p>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
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
