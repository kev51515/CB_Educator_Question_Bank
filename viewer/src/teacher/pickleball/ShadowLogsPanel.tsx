/**
 * ShadowLogsPanel — coach shadowing logs (teacher view).
 *
 * For a 'pickleball_coach' course: pick a coach, record the sessions they
 * shadowed (observed) — mentor, date, optional lesson, takeaways — and toggle
 * each one's mentor sign-off. A signed-off shadow counts toward any "shadow"
 * auto-completing development step. Mirrors the DevelopmentPanel / HoursPanel
 * UX bar: coach selector, inline add form, optimistic sign-off toggle, skeleton
 * load, empty-state CTA, toast feedback.
 *
 *   export function ShadowLogsPanel({ courseId }: { courseId: string })
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useClassRoster } from "@/teacher/useClassRoster";
import { EmptyState, SkeletonRows, SmartDatePicker, useToast } from "@/components";

interface ShadowLog {
  id: string;
  course_id: string;
  coach_id: string;
  mentor_id: string | null;
  lesson_id: string | null;
  shadow_date: string;
  mentor_notes: string | null;
  signed_off: boolean;
  signed_off_at: string | null;
  created_at: string;
}

interface LessonRow {
  id: string;
  scheduled_at: string | null;
  player_id: string;
  status: string;
}

const RPC_ERROR_LABELS: Record<string, string> = {
  not_authenticated: "Please sign in again.",
  not_authorized: "You do not have permission to do that.",
  not_found: "That item no longer exists.",
  invalid_input: "Please check the fields and try again.",
};

function rpcMessage(err: unknown): string {
  const raw =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";
  for (const code of Object.keys(RPC_ERROR_LABELS)) {
    if (raw.includes(code)) return RPC_ERROR_LABELS[code];
  }
  return "Something went wrong. Please try again.";
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ShadowLogsPanel({ courseId }: { courseId: string }) {
  const toast = useToast();
  const { roster, loading: rosterLoading } = useClassRoster(courseId);
  const [selectedCoach, setSelectedCoach] = useState<string | null>(null);
  const [logs, setLogs] = useState<ShadowLog[]>([]);
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [loading, setLoading] = useState(false);
  const aliveRef = useRef(true);

  // Add form
  const [shadowDate, setShadowDate] = useState<string | null>(null);
  const [mentorId, setMentorId] = useState<string>("");
  const [lessonId, setLessonId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedCoach && roster.length > 0) {
      setSelectedCoach(roster[0].student_id);
    }
  }, [roster, selectedCoach]);

  // Load the course's lessons once (for the optional "shadowed which lesson"
  // link).
  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data } = await supabase
        .from("pickleball_lessons")
        .select("id, scheduled_at, player_id, status")
        .eq("course_id", courseId)
        .order("scheduled_at", { ascending: false })
        .limit(100);
      if (alive) setLessons((data ?? []) as LessonRow[]);
    })();
    return () => {
      alive = false;
    };
  }, [courseId]);

  const loadLogs = useCallback(async () => {
    if (!selectedCoach) {
      setLogs([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("pickleball_shadow_logs")
        .select("*")
        .eq("course_id", courseId)
        .eq("coach_id", selectedCoach)
        .order("shadow_date", { ascending: false });
      if (!aliveRef.current) return;
      if (error) {
        toast.error(error.message);
        setLogs([]);
        return;
      }
      setLogs((data ?? []) as ShadowLog[]);
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [courseId, selectedCoach, toast]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const coachName = useMemo(() => {
    const c = roster.find((r) => r.student_id === selectedCoach);
    return c?.display_name || c?.email || "this coach";
  }, [roster, selectedCoach]);

  const personName = useCallback(
    (id: string | null) => {
      if (!id) return null;
      const r = roster.find((x) => x.student_id === id);
      return r?.display_name || r?.email || null;
    },
    [roster],
  );

  const signedCount = logs.filter((l) => l.signed_off).length;

  async function addLog() {
    if (!selectedCoach || !shadowDate) return;
    setAdding(true);
    try {
      const { data, error } = await supabase.rpc("pk_add_shadow_log", {
        p_course_id: courseId,
        p_coach_id: selectedCoach,
        p_shadow_date: shadowDate.slice(0, 10),
        p_mentor_id: mentorId || null,
        p_lesson_id: lessonId || null,
        p_mentor_notes: notes.trim() || null,
      });
      if (error) {
        toast.error(rpcMessage(error));
        return;
      }
      if (aliveRef.current && data) {
        setLogs((prev) => [data as ShadowLog, ...prev]);
        setShadowDate(null);
        setMentorId("");
        setLessonId("");
        setNotes("");
        toast.success("Shadow session recorded.");
      }
    } finally {
      if (aliveRef.current) setAdding(false);
    }
  }

  async function toggleSignoff(log: ShadowLog) {
    const next = !log.signed_off;
    // Optimistic
    setLogs((prev) =>
      prev.map((l) =>
        l.id === log.id
          ? {
              ...l,
              signed_off: next,
              signed_off_at: next ? new Date().toISOString() : null,
            }
          : l,
      ),
    );
    const { data, error } = await supabase.rpc("pk_signoff_shadow_log", {
      p_id: log.id,
      p_signed_off: next,
    });
    if (error) {
      toast.error(rpcMessage(error));
      // Roll back
      setLogs((prev) => prev.map((l) => (l.id === log.id ? log : l)));
      return;
    }
    if (aliveRef.current && data) {
      setLogs((prev) => prev.map((l) => (l.id === log.id ? (data as ShadowLog) : l)));
      if (next) toast.success("Signed off.");
    }
  }

  return (
    <div className="space-y-4">
      {/* Coach selector */}
      <div className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 p-4">
        <label
          htmlFor="shadow-coach"
          className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5"
        >
          Coach
        </label>
        {rosterLoading ? (
          <SkeletonRows count={1} />
        ) : roster.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No coaches enrolled yet. Add coaches from the Coaches tab.
          </p>
        ) : (
          <select
            id="shadow-coach"
            value={selectedCoach ?? ""}
            onChange={(e) => setSelectedCoach(e.target.value)}
            className="min-h-[44px] w-full max-w-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm"
          >
            {roster.map((r) => (
              <option key={r.student_id} value={r.student_id}>
                {r.display_name || r.email}
              </option>
            ))}
          </select>
        )}
      </div>

      {selectedCoach && (
        <>
          {/* Add a shadow session */}
          <div className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Record a shadow session for {coachName}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <SmartDatePicker
                value={shadowDate}
                onChange={setShadowDate}
                label="Date shadowed"
              />
              <div>
                <label
                  htmlFor="shadow-mentor"
                  className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5"
                >
                  Mentor (optional)
                </label>
                <select
                  id="shadow-mentor"
                  value={mentorId}
                  onChange={(e) => setMentorId(e.target.value)}
                  className="min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm"
                >
                  <option value="">— No mentor —</option>
                  {roster
                    .filter((r) => r.student_id !== selectedCoach)
                    .map((r) => (
                      <option key={r.student_id} value={r.student_id}>
                        {r.display_name || r.email}
                      </option>
                    ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label
                  htmlFor="shadow-lesson"
                  className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5"
                >
                  Lesson observed (optional)
                </label>
                <select
                  id="shadow-lesson"
                  value={lessonId}
                  onChange={(e) => setLessonId(e.target.value)}
                  className="min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm"
                >
                  <option value="">— Not linked to a lesson —</option>
                  {lessons.map((l) => (
                    <option key={l.id} value={l.id}>
                      {formatDate(l.scheduled_at) || "Unscheduled"}
                      {personName(l.player_id)
                        ? ` · ${personName(l.player_id)}`
                        : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Takeaways / mentor notes (optional)"
              className="min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm"
            />
            <div>
              <button
                type="button"
                onClick={() => void addLog()}
                disabled={adding || !shadowDate}
                className="min-h-[44px] rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {adding ? "Recording…" : "Record session"}
              </button>
            </div>
          </div>

          {/* Sessions list */}
          <div className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Shadow sessions
              </h3>
              {logs.length > 0 && (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {signedCount} signed off · {logs.length} total
                </span>
              )}
            </div>

            {loading ? (
              <SkeletonRows count={3} />
            ) : logs.length === 0 ? (
              <EmptyState
                icon="check"
                title="No shadow sessions yet"
                body={`Record ${coachName}'s first shadowing session above.`}
              />
            ) : (
              <ul className="space-y-2">
                {logs.map((log) => {
                  const mentor = personName(log.mentor_id);
                  return (
                    <li
                      key={log.id}
                      className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 p-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                          {formatDate(log.shadow_date)}
                          {mentor && (
                            <span className="ml-2 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-normal text-slate-600 dark:text-slate-300">
                              with {mentor}
                            </span>
                          )}
                        </p>
                        {log.mentor_notes && (
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 whitespace-pre-wrap">
                            {log.mentor_notes}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => void toggleSignoff(log)}
                        aria-pressed={log.signed_off}
                        className={`shrink-0 inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 text-xs font-medium ${
                          log.signed_off
                            ? "bg-emerald-600 text-white hover:bg-emerald-700"
                            : "border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                        }`}
                      >
                        {log.signed_off && (
                          <svg
                            viewBox="0 0 24 24"
                            className="h-3.5 w-3.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={3}
                          >
                            <path
                              d="M5 13l4 4L19 7"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                        {log.signed_off ? "Signed off" : "Sign off"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
