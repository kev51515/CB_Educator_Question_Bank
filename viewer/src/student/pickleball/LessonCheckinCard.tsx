/**
 * LessonCheckinCard — Pickleball PLAYER-track student card (Increment 3, Lane B).
 *
 * The signed-in player sees their UPCOMING lessons (scheduled, in the future)
 * and, for each, can submit a pre-lesson CHECK-IN before they show up:
 *   - focus_request : what they'd like to work on (short text, ~200 chars)
 *   - condition     : good | minor_issue | injured (segmented control)
 *   - note          : optional free-text detail (rich text)
 *
 * Submitting calls pk_submit_checkin(p_lesson_id, p_focus, p_condition, p_note)
 * (defined by Lane A in migration 0158). When condition === "injured" the RPC
 * fans out an alert notification to the coach, so the UI confirms "your coach
 * has been notified" on success.
 *
 * Check-ins are editable up to the lesson start. Already-submitted state is
 * read back from the lesson's own check-in columns (checkin_focus /
 * checkin_condition / checkin_note / checkin_at on pickleball_lessons; RLS
 * scopes to the caller) and pre-fills the form when checkin_at is non-null.
 *
 * RLS scopes lesson reads to player_id = auth.uid(); the explicit player_id
 * filter keeps the query tight. The `studentId` prop equals profiles.id
 * (== auth.uid()).
 *
 * Prop contract (do not change):
 *   export function LessonCheckinCard({ courseId, studentId }: {
 *     courseId: string; studentId: string })
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { MarkdownEditor, Skeleton, SkeletonRows, useToast } from "@/components";

const FOCUS_LIMIT = 200;

type Condition = "good" | "minor_issue" | "injured";

const CONDITIONS: { value: Condition; label: string }[] = [
  { value: "good", label: "Feeling good" },
  { value: "minor_issue", label: "Minor issue" },
  { value: "injured", label: "Injured" },
];

const CONDITION_LABEL: Record<Condition, string> = {
  good: "Feeling good",
  minor_issue: "Minor issue",
  injured: "Injured",
};

const CONDITION_ACTIVE_STYLE: Record<Condition, string> = {
  good:
    "bg-emerald-600 text-white ring-emerald-600 dark:bg-emerald-500 dark:ring-emerald-500",
  minor_issue:
    "bg-amber-500 text-white ring-amber-500 dark:bg-amber-500 dark:ring-amber-500",
  injured:
    "bg-rose-600 text-white ring-rose-600 dark:bg-rose-500 dark:ring-rose-500",
};

interface LessonRow {
  id: string;
  scheduled_at: string | null;
  duration_min: number | null;
  location: string | null;
  status: string;
  checkin_focus: string | null;
  checkin_condition: Condition | null;
  checkin_note: string | null;
  checkin_at: string | null;
}

interface CheckinRow {
  lesson_id: string;
  focus_request: string | null;
  condition: Condition | null;
  note: string | null;
}

interface LessonWithCheckin extends LessonRow {
  checkin: CheckinRow | null;
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Something went wrong.";
}

function friendlyError(err: unknown): string {
  const raw = getErrorMessage(err);
  switch (raw) {
    case "not_authorized":
      return "You can't check in to this lesson.";
    case "not_authenticated":
      return "Your session expired — please sign in again.";
    case "not_found":
      return "That lesson no longer exists.";
    case "lesson_started":
      return "This lesson has already started — check-in is closed.";
    default:
      return raw;
  }
}

function formatWhen(iso: string | null): string {
  if (!iso) return "Unscheduled";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unscheduled";
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function LessonCheckinCard({
  courseId,
  studentId,
}: {
  courseId: string;
  studentId: string;
}) {
  const aliveRef = useRef(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lessons, setLessons] = useState<LessonWithCheckin[]>([]);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nowIso = new Date().toISOString();
      // RLS already restricts to the caller's own lessons; the explicit
      // player_id filter keeps the query tight and self-documenting.
      const { data: lessonData, error: lessonErr } = await supabase
        .from("pickleball_lessons")
        .select(
          "id, scheduled_at, duration_min, location, status, checkin_focus, checkin_condition, checkin_note, checkin_at",
        )
        .eq("course_id", courseId)
        .eq("player_id", studentId)
        .eq("status", "scheduled")
        .gte("scheduled_at", nowIso)
        .order("scheduled_at", { ascending: true });

      if (!aliveRef.current) return;
      if (lessonErr) throw new Error(lessonErr.message);

      const lessonRows = (lessonData ?? []) as unknown as LessonRow[];

      // Pre-fill any existing check-in from the lesson's own check-in columns
      // (migration 0158 stores the check-in inline on pickleball_lessons, keyed
      // by checkin_at being non-null once the player has submitted).
      setLessons(
        lessonRows.map((l) => ({
          ...l,
          checkin:
            l.checkin_at != null
              ? {
                  lesson_id: l.id,
                  focus_request: l.checkin_focus,
                  condition: l.checkin_condition,
                  note: l.checkin_note,
                }
              : null,
        })),
      );
    } catch (err) {
      if (aliveRef.current) {
        setError(err instanceof Error ? err.message : "Couldn't load lessons.");
      }
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [courseId, studentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSubmitted = useCallback((lessonId: string, checkin: CheckinRow) => {
    setLessons((prev) =>
      prev.map((l) => (l.id === lessonId ? { ...l, checkin } : l)),
    );
  }, []);

  if (loading) {
    return (
      <div
        className="space-y-3 rounded-2xl bg-white/80 p-6 ring-1 ring-slate-200 dark:bg-slate-900/60 dark:ring-slate-800"
        data-course-id={courseId}
        data-student-id={studentId}
      >
        <Skeleton className="h-5 w-44 rounded" />
        <SkeletonRows count={2} />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-2xl bg-white/80 p-6 text-center ring-1 ring-slate-200 dark:bg-slate-900/60 dark:ring-slate-800"
        data-course-id={courseId}
        data-student-id={studentId}
      >
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
          Couldn't load your upcoming lessons
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 inline-flex min-h-[40px] items-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          Try again
        </button>
      </div>
    );
  }

  if (lessons.length === 0) {
    return (
      <div
        className="rounded-2xl bg-white/80 p-8 text-center ring-1 ring-slate-200 dark:bg-slate-900/60 dark:ring-slate-800"
        data-course-id={courseId}
        data-student-id={studentId}
      >
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
          No upcoming lessons
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          When your coach schedules your next session, you'll be able to check in
          here beforehand.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-course-id={courseId} data-student-id={studentId}>
      <div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Lesson check-in
        </h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Let your coach know how you're feeling before each session.
        </p>
      </div>
      <ol className="space-y-4">
        {lessons.map((lesson) => (
          <li key={lesson.id}>
            <CheckinForm lesson={lesson} onSubmitted={onSubmitted} />
          </li>
        ))}
      </ol>
    </div>
  );
}

// ─── Per-lesson check-in form ────────────────────────────────────────────────

function CheckinForm({
  lesson,
  onSubmitted,
}: {
  lesson: LessonWithCheckin;
  onSubmitted: (lessonId: string, checkin: CheckinRow) => void;
}) {
  const toast = useToast();
  const aliveRef = useRef(true);

  const existing = lesson.checkin;
  const [focus, setFocus] = useState(existing?.focus_request ?? "");
  const [condition, setCondition] = useState<Condition>(existing?.condition ?? "good");
  const [note, setNote] = useState(existing?.note ?? "");
  const [editing, setEditing] = useState(existing == null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const focusCount = focus.length;
  const overLimit = focusCount > FOCUS_LIMIT;

  const resetFromExisting = useCallback(() => {
    setFocus(existing?.focus_request ?? "");
    setCondition(existing?.condition ?? "good");
    setNote(existing?.note ?? "");
  }, [existing]);

  const submit = useCallback(async () => {
    if (overLimit || saving) return;
    setSaving(true);
    const wasInjured = condition === "injured";
    try {
      const { error: rpcErr } = await supabase.rpc("pk_submit_checkin", {
        p_lesson_id: lesson.id,
        p_focus: focus.trim() || null,
        p_condition: condition,
        p_note: note.trim() ? note : null,
      });
      if (rpcErr) throw new Error(rpcErr.message);
      if (!aliveRef.current) return;
      onSubmitted(lesson.id, {
        lesson_id: lesson.id,
        focus_request: focus.trim() || null,
        condition,
        note: note.trim() ? note : null,
      });
      setEditing(false);
      if (wasInjured) {
        toast.warning(
          "Check-in sent — your coach has been notified",
          "We've flagged that you're injured so your coach can adjust the session.",
        );
      } else {
        toast.success("Check-in sent", "Your coach can see how you're feeling.");
      }
    } catch (err) {
      if (!aliveRef.current) return;
      toast.error("Couldn't submit check-in", friendlyError(err));
    } finally {
      if (aliveRef.current) setSaving(false);
    }
  }, [overLimit, saving, condition, lesson.id, focus, note, onSubmitted, toast]);

  const summaryNote = useMemo(() => {
    const html = existing?.note?.trim();
    return html && html.length > 0 ? html : null;
  }, [existing]);

  return (
    <div className="rounded-2xl bg-white/90 p-4 ring-1 ring-slate-200 dark:bg-slate-900/70 dark:ring-slate-800">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-slate-900 dark:text-slate-100">
            {formatWhen(lesson.scheduled_at)}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400">
            {lesson.duration_min != null && <span>{lesson.duration_min} min</span>}
            {lesson.location && <span>· {lesson.location}</span>}
          </div>
        </div>
        {existing && !editing && (
          <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900">
            Checked in
          </span>
        )}
      </div>

      {/* Submitted summary (read mode) */}
      {existing && !editing ? (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500 dark:text-slate-400">Condition:</span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${
                CONDITION_ACTIVE_STYLE[existing.condition ?? "good"]
              }`}
            >
              {CONDITION_LABEL[existing.condition ?? "good"]}
            </span>
          </div>
          {existing.focus_request && (
            <div className="text-sm text-slate-700 dark:text-slate-200">
              <span className="text-slate-500 dark:text-slate-400">Focus: </span>
              {existing.focus_request}
            </div>
          )}
          {summaryNote && (
            <div
              className="prose prose-sm max-w-none text-slate-700 dark:prose-invert dark:text-slate-200"
              dangerouslySetInnerHTML={{ __html: summaryNote }}
            />
          )}
          {existing.condition === "injured" && (
            <p className="text-xs font-medium text-rose-600 dark:text-rose-400">
              Your coach has been notified about your injury.
            </p>
          )}
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mt-1 inline-flex min-h-[40px] items-center rounded-lg px-3 text-sm font-medium text-indigo-600 transition hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/40"
          >
            Edit check-in
          </button>
        </div>
      ) : (
        /* Edit / new form */
        <div className="mt-4 space-y-4">
          {/* Condition (segmented) */}
          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              How are you feeling?
            </legend>
            <div
              role="radiogroup"
              aria-label="How are you feeling?"
              className="inline-flex flex-wrap gap-2"
            >
              {CONDITIONS.map((c) => {
                const active = condition === c.value;
                return (
                  <button
                    key={c.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setCondition(c.value)}
                    className={`inline-flex min-h-[40px] items-center rounded-full px-4 text-sm font-medium ring-1 transition ${
                      active
                        ? CONDITION_ACTIVE_STYLE[c.value]
                        : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50 dark:bg-slate-800/60 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800"
                    }`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
            {condition === "injured" && (
              <p className="mt-2 text-xs font-medium text-rose-600 dark:text-rose-400">
                Submitting will immediately notify your coach that you're injured.
              </p>
            )}
          </fieldset>

          {/* Focus request */}
          <div>
            <label
              htmlFor={`focus-${lesson.id}`}
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >
              What would you like to focus on?
            </label>
            <input
              id={`focus-${lesson.id}`}
              type="text"
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              placeholder="e.g. third-shot drops, backhand consistency…"
              maxLength={FOCUS_LIMIT + 40}
              className="min-h-[40px] w-full rounded-lg bg-white px-3 text-sm text-slate-900 ring-1 ring-slate-200 transition placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800/60 dark:text-slate-100 dark:ring-slate-700"
            />
            <div
              className={`mt-1 text-right text-xs ${
                overLimit ? "text-rose-600 dark:text-rose-400" : "text-slate-400 dark:text-slate-500"
              }`}
            >
              {focusCount} / {FOCUS_LIMIT}
            </div>
          </div>

          {/* Optional note */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Anything else? <span className="font-normal normal-case">(optional)</span>
            </label>
            <MarkdownEditor
              value={note}
              onChange={setNote}
              placeholder="Add any detail your coach should know…"
              minHeight={100}
            />
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={saving || overLimit}
              className="inline-flex min-h-[40px] items-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              {saving ? "Sending…" : existing ? "Update check-in" : "Send check-in"}
            </button>
            {existing && (
              <button
                type="button"
                onClick={() => {
                  resetFromExisting();
                  setEditing(false);
                }}
                disabled={saving}
                className="inline-flex min-h-[40px] items-center rounded-lg px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
