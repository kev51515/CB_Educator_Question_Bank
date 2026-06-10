/**
 * BriefingsPanel — Pickleball PLAYER-track teacher panel (Increment 3).
 *
 * Lists this course's UPCOMING lessons (scheduled_at >= today, status =
 * 'scheduled'). Each lesson expands to a BRIEFING CARD built from the
 * pk_lesson_briefing aggregate RPC:
 *   - player snapshot (name + intake fields)
 *   - the lesson plan
 *   - top-2 weakest skills (from the player's latest assessment scores)
 *   - last recap summary
 *   - homework open / done counts
 *   - the player's pre-lesson check-in (focus + condition badge; red if injured)
 *   - flag chips (first lesson / injury / minor)
 *
 * Plus a COACH-PRIVATE notes section per player (pickleball_player_notes):
 * list + add / edit / delete via MarkdownEditor. These notes are NEVER shown to
 * the player — the UI says so.
 *
 * Optimistic UI + toast feedback; Skeleton while loading; empty state with CTA.
 *
 * Prop contract (do not change):
 *   export function BriefingsPanel({ courseId }: { courseId: string })
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/lib/profile";
import { MarkdownEditor, SkeletonRows, useToast } from "@/components";
import { ConfirmDialog } from "@/teacher/ConfirmDialog";
import { skillLabel } from "@/lib/pickleballSkills";

// ─── Types ──────────────────────────────────────────────────────────────────

type LessonStatus = "scheduled" | "completed" | "recapped" | "cancelled";
type CheckinCondition = "good" | "minor_issue" | "injured";

interface UpcomingLesson {
  id: string;
  player_id: string;
  scheduled_at: string | null;
  duration_min: number | null;
  location: string | null;
  status: LessonStatus;
  player_name: string;
}

interface WeakSkill {
  slug: string;
  score: number;
}

interface Briefing {
  lesson: {
    id: string;
    scheduled_at: string | null;
    duration_min: number | null;
    location: string | null;
    status: LessonStatus;
    plan_md: string | null;
  };
  player: {
    id: string;
    name: string;
    goal: string | null;
    skill_level: string | null;
    dupr: number | null;
    dominant_hand: string | null;
    years_played: number | null;
  };
  weak_skills: WeakSkill[];
  last_recap: { recap_md: string | null; at: string } | null;
  homework: { open_count: number; done_count: number };
  checkin: {
    focus: string | null;
    condition: CheckinCondition | null;
    note: string | null;
    at: string;
  } | null;
  flags: string[];
}

interface NoteRow {
  id: string;
  course_id: string;
  player_id: string;
  author_id: string;
  body: string;
  created_at: string;
  updated_at: string | null;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const CONDITION_STYLE: Record<CheckinCondition, string> = {
  good: "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900",
  minor_issue:
    "bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900",
  injured:
    "bg-red-100 text-red-700 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900",
};

const CONDITION_LABEL: Record<CheckinCondition, string> = {
  good: "Feeling good",
  minor_issue: "Minor issue",
  injured: "Injured",
};

const FLAG_LABEL: Record<string, string> = {
  first_lesson: "First lesson",
  injury: "Injury reported",
  minor: "Minor (under 18)",
};

const FLAG_STYLE: Record<string, string> = {
  first_lesson:
    "bg-sky-100 text-sky-700 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900",
  injury:
    "bg-red-100 text-red-700 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900",
  minor:
    "bg-violet-100 text-violet-700 ring-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Something went wrong.";
}

function friendlyError(err: unknown): string {
  const raw = getErrorMessage(err);
  switch (raw) {
    case "not_authorized":
      return "You don't have permission to manage briefings for this course.";
    case "not_authenticated":
      return "Your session expired — please sign in again.";
    case "not_found":
      return "That lesson no longer exists.";
    case "invalid_input":
      return "Please check the fields and try again.";
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

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Component ──────────────────────────────────────────────────────────────

export function BriefingsPanel({ courseId }: { courseId: string }) {
  const toast = useToast();
  const { profile } = useProfile();
  const aliveRef = useRef(true);

  const [loading, setLoading] = useState(true);
  const [lessons, setLessons] = useState<UpcomingLesson[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const [lessonsRes, rosterRes] = await Promise.all([
        supabase
          .from("pickleball_lessons")
          .select("id, player_id, scheduled_at, duration_min, location, status")
          .eq("course_id", courseId)
          .eq("status", "scheduled")
          .gte("scheduled_at", todayStart.toISOString())
          .order("scheduled_at", { ascending: true }),
        supabase
          .from("course_memberships")
          .select(
            "student_id, student:profiles!course_memberships_student_id_fkey(display_name, email)",
          )
          .eq("course_id", courseId),
      ]);

      if (!aliveRef.current) return;
      if (lessonsRes.error) throw new Error(lessonsRes.error.message);
      if (rosterRes.error) throw new Error(rosterRes.error.message);

      const rosterRows = (rosterRes.data ?? []) as unknown as {
        student_id: string;
        student: { display_name: string | null; email: string | null } | null;
      }[];
      const nameById = new Map<string, string>();
      for (const r of rosterRows) {
        nameById.set(
          r.student_id,
          r.student?.display_name || r.student?.email || "Player",
        );
      }

      const rows = (lessonsRes.data ?? []) as unknown as Omit<
        UpcomingLesson,
        "player_name"
      >[];
      setLessons(
        rows.map((l) => ({
          ...l,
          player_name: nameById.get(l.player_id) ?? "Player",
        })),
      );
    } catch (err) {
      if (aliveRef.current) toast.error("Couldn't load briefings", friendlyError(err));
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [courseId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasLessons = useMemo(() => lessons.length > 0, [lessons]);

  return (
    <div className="space-y-4" data-course-id={courseId}>
      <div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Lesson briefings
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          What to know before each upcoming session — plus your private coaching notes.
        </p>
      </div>

      {loading ? (
        <div className="rounded-2xl bg-white/80 p-4 ring-1 ring-slate-200 dark:bg-slate-900/60 dark:ring-slate-800">
          <SkeletonRows count={4} />
        </div>
      ) : !hasLessons ? (
        <div className="rounded-2xl bg-white/80 p-8 text-center ring-1 ring-slate-200 dark:bg-slate-900/60 dark:ring-slate-800">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
            No upcoming lessons
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Schedule a session in the Lessons tab — its briefing will appear here.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {lessons.map((lesson) => (
            <BriefingRow
              key={lesson.id}
              lesson={lesson}
              courseId={courseId}
              authorId={profile?.id ?? null}
              expanded={expandedId === lesson.id}
              onToggle={() =>
                setExpandedId((cur) => (cur === lesson.id ? null : lesson.id))
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Briefing row ─────────────────────────────────────────────────────────────

interface BriefingRowProps {
  lesson: UpcomingLesson;
  courseId: string;
  authorId: string | null;
  expanded: boolean;
  onToggle: () => void;
}

function BriefingRow({ lesson, courseId, authorId, expanded, onToggle }: BriefingRowProps) {
  const toast = useToast();
  const aliveRef = useRef(true);

  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // Lazy-load the briefing the first time the row expands.
  useEffect(() => {
    if (!expanded || loaded || briefingLoading) return;
    let alive = true;
    setBriefingLoading(true);
    void (async () => {
      try {
        const { data, error } = await supabase.rpc("pk_lesson_briefing", {
          p_lesson_id: lesson.id,
        });
        if (error) throw new Error(error.message);
        if (!alive) return;
        setBriefing(data as unknown as Briefing);
        setLoaded(true);
      } catch (err) {
        if (alive) toast.error("Couldn't load briefing", friendlyError(err));
      } finally {
        if (alive) setBriefingLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [expanded, loaded, briefingLoading, lesson.id, toast]);

  return (
    <li className="overflow-hidden rounded-2xl bg-white/90 ring-1 ring-slate-200 dark:bg-slate-900/70 dark:ring-slate-800">
      {/* Summary row */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <ChevronIcon open={expanded} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-slate-900 dark:text-slate-100">
            {lesson.player_name}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400">
            <span>{formatWhen(lesson.scheduled_at)}</span>
            {lesson.duration_min != null && <span>· {lesson.duration_min} min</span>}
            {lesson.location && <span>· {lesson.location}</span>}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-200 px-4 py-4 dark:border-slate-800">
          {briefingLoading && !briefing ? (
            <SkeletonRows count={3} />
          ) : briefing ? (
            <BriefingCard briefing={briefing} />
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Couldn't load this briefing.
            </p>
          )}

          {/* Coach-private notes */}
          <PrivateNotes
            courseId={courseId}
            playerId={lesson.player_id}
            authorId={authorId}
          />
        </div>
      )}
    </li>
  );
}

// ─── Briefing card (read-only aggregate) ──────────────────────────────────────

function BriefingCard({ briefing }: { briefing: Briefing }) {
  const { player, weak_skills, last_recap, homework, checkin, flags, lesson } = briefing;

  return (
    <div className="space-y-4">
      {/* Flags */}
      {flags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {flags.map((f) => (
            <span
              key={f}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${
                FLAG_STYLE[f] ??
                "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700"
              }`}
            >
              {FLAG_LABEL[f] ?? f}
            </span>
          ))}
        </div>
      )}

      {/* Player snapshot */}
      <section>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Player
        </h4>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-700 dark:text-slate-200">
          <span className="font-medium">{player.name}</span>
          {player.goal && <span className="text-slate-500 dark:text-slate-400">Goal: {player.goal}</span>}
          {player.skill_level && (
            <span className="text-slate-500 dark:text-slate-400">Level: {player.skill_level}</span>
          )}
          {player.dupr != null && (
            <span className="text-slate-500 dark:text-slate-400">DUPR {player.dupr}</span>
          )}
          {player.dominant_hand && (
            <span className="text-slate-500 dark:text-slate-400">{player.dominant_hand}-handed</span>
          )}
          {player.years_played != null && (
            <span className="text-slate-500 dark:text-slate-400">{player.years_played} yr played</span>
          )}
        </div>
      </section>

      {/* Weak skills */}
      <section>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Focus areas (weakest skills)
        </h4>
        {weak_skills.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {weak_skills.map((w) => (
              <span
                key={w.slug}
                className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900"
              >
                {skillLabel(w.slug)}
                <span className="opacity-70">{w.score}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No assessment scores yet.
          </p>
        )}
      </section>

      {/* Check-in */}
      <section>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Player check-in
        </h4>
        {checkin ? (
          <div className="space-y-1.5 text-sm text-slate-700 dark:text-slate-200">
            <div className="flex flex-wrap items-center gap-2">
              {checkin.condition && (
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${CONDITION_STYLE[checkin.condition]}`}
                >
                  {CONDITION_LABEL[checkin.condition]}
                </span>
              )}
              <span className="text-xs text-slate-400">{formatDate(checkin.at)}</span>
            </div>
            {checkin.focus && (
              <p>
                <span className="text-slate-500 dark:text-slate-400">Wants to work on: </span>
                {checkin.focus}
              </p>
            )}
            {checkin.note && (
              <p className="text-slate-600 dark:text-slate-300">{checkin.note}</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No check-in submitted yet.
          </p>
        )}
      </section>

      {/* Homework */}
      <section>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Homework
        </h4>
        <div className="flex flex-wrap gap-x-4 text-sm text-slate-700 dark:text-slate-200">
          <span>
            <span className="font-medium">{homework.open_count}</span>{" "}
            <span className="text-slate-500 dark:text-slate-400">open</span>
          </span>
          <span>
            <span className="font-medium">{homework.done_count}</span>{" "}
            <span className="text-slate-500 dark:text-slate-400">done</span>
          </span>
        </div>
      </section>

      {/* Last recap */}
      {last_recap?.recap_md && (
        <section>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Last recap{last_recap.at ? ` · ${formatDate(last_recap.at)}` : ""}
          </h4>
          <div
            className="prose prose-sm max-w-none dark:prose-invert"
            // Trusted: authored by the educator via MarkdownEditor.
            dangerouslySetInnerHTML={{ __html: last_recap.recap_md }}
          />
        </section>
      )}

      {/* This session's plan */}
      {lesson.plan_md && (
        <section>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            This session's plan
          </h4>
          <div
            className="prose prose-sm max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: lesson.plan_md }}
          />
        </section>
      )}
    </div>
  );
}

// ─── Coach-private notes ──────────────────────────────────────────────────────

interface PrivateNotesProps {
  courseId: string;
  playerId: string;
  authorId: string | null;
}

function PrivateNotes({ courseId, playerId, authorId }: PrivateNotesProps) {
  const toast = useToast();
  const aliveRef = useRef(true);

  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<NoteRow[]>([]);

  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const [pendingDelete, setPendingDelete] = useState<NoteRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("pickleball_player_notes")
        .select("id, course_id, player_id, author_id, body, created_at, updated_at")
        .eq("course_id", courseId)
        .eq("player_id", playerId)
        .order("created_at", { ascending: false });
      if (!aliveRef.current) return;
      if (error) throw new Error(error.message);
      setNotes((data ?? []) as unknown as NoteRow[]);
    } catch (err) {
      if (aliveRef.current) toast.error("Couldn't load notes", friendlyError(err));
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [courseId, playerId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const onAdd = useCallback(async () => {
    const body = draft.trim();
    if (!body) {
      toast.error("Note is empty", "Write something before saving.");
      return;
    }
    if (!authorId) {
      toast.error("Couldn't add note", "Your session expired — please sign in again.");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("pickleball_player_notes")
        .insert({
          course_id: courseId,
          player_id: playerId,
          author_id: authorId,
          body,
        })
        .select("id, course_id, player_id, author_id, body, created_at, updated_at")
        .single();
      if (error) throw new Error(error.message);
      if (!aliveRef.current) return;
      setNotes((prev) => [data as unknown as NoteRow, ...prev]);
      setDraft("");
      setComposerOpen(false);
      toast.success("Note added");
    } catch (err) {
      if (aliveRef.current) toast.error("Couldn't add note", friendlyError(err));
    } finally {
      if (aliveRef.current) setSaving(false);
    }
  }, [draft, authorId, courseId, playerId, toast]);

  const onSaveEdit = useCallback(
    async (noteId: string) => {
      const body = editDraft.trim();
      if (!body) {
        toast.error("Note is empty", "Write something before saving.");
        return;
      }
      const prev = notes;
      // Optimistic update.
      setNotes((cur) =>
        cur.map((n) => (n.id === noteId ? { ...n, body } : n)),
      );
      setEditingId(null);
      try {
        const { error } = await supabase
          .from("pickleball_player_notes")
          .update({ body })
          .eq("id", noteId);
        if (error) throw new Error(error.message);
        toast.success("Note saved");
      } catch (err) {
        if (!aliveRef.current) return;
        setNotes(prev);
        toast.error("Couldn't save note", friendlyError(err));
      }
    },
    [editDraft, notes, toast],
  );

  const onConfirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setDeleting(true);
    // Optimistic removal.
    setNotes((prev) => prev.filter((n) => n.id !== target.id));
    try {
      const { error } = await supabase
        .from("pickleball_player_notes")
        .delete()
        .eq("id", target.id);
      if (error) throw new Error(error.message);
      toast.success("Note deleted");
    } catch (err) {
      if (aliveRef.current) {
        setNotes((prev) =>
          [target, ...prev].sort(
            (a, b) => +new Date(b.created_at) - +new Date(a.created_at),
          ),
        );
        toast.error("Couldn't delete note", friendlyError(err));
      }
    } finally {
      if (aliveRef.current) {
        setDeleting(false);
        setPendingDelete(null);
      }
    }
  }, [pendingDelete, toast]);

  return (
    <section className="mt-5 border-t border-dashed border-slate-200 pt-4 dark:border-slate-700">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Coach notes
          </h4>
          <p className="text-xs text-slate-400">Private — never shown to the player.</p>
        </div>
        <button
          type="button"
          onClick={() => setComposerOpen((o) => !o)}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-slate-700 ring-1 ring-slate-300 transition hover:bg-slate-50 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800"
        >
          <PlusIcon />
          {composerOpen ? "Close" : "Add note"}
        </button>
      </div>

      {composerOpen && (
        <div className="mb-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200 dark:bg-slate-800/50 dark:ring-slate-700">
          <MarkdownEditor
            value={draft}
            onChange={setDraft}
            placeholder="Private observation — e.g. struggles with backhand dinks under pressure…"
            minHeight={90}
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setDraft("");
                setComposerOpen(false);
              }}
              className="min-h-[36px] rounded-lg px-3 text-sm font-medium text-slate-600 ring-1 ring-slate-300 transition hover:bg-white dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void onAdd()}
              disabled={saving}
              className="min-h-[36px] rounded-lg bg-slate-900 px-3.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              {saving ? "Saving…" : "Save note"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <SkeletonRows count={2} />
      ) : notes.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No notes yet — add a private observation about this player.
        </p>
      ) : (
        <ul className="space-y-2">
          {notes.map((note) => (
            <li
              key={note.id}
              className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200 dark:bg-slate-800/50 dark:ring-slate-700"
            >
              {editingId === note.id ? (
                <div>
                  <MarkdownEditor
                    value={editDraft}
                    onChange={setEditDraft}
                    placeholder="Edit note…"
                    minHeight={90}
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="min-h-[36px] rounded-lg px-3 text-sm font-medium text-slate-600 ring-1 ring-slate-300 transition hover:bg-white dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void onSaveEdit(note.id)}
                      className="min-h-[36px] rounded-lg bg-slate-900 px-3.5 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div
                      className="prose prose-sm max-w-none dark:prose-invert"
                      // Trusted: authored by an educator via MarkdownEditor.
                      dangerouslySetInnerHTML={{ __html: note.body }}
                    />
                    <p className="mt-1 text-xs text-slate-400">
                      {formatDate(note.updated_at ?? note.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(note.id);
                        setEditDraft(note.body);
                      }}
                      aria-label="Edit note"
                      className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                    >
                      <PencilIcon />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(note)}
                      aria-label="Delete note"
                      className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete note?"
          body="This private coaching note will be permanently removed."
          confirmLabel={deleting ? "Deleting…" : "Delete"}
          destructive
          busy={deleting}
          onConfirm={() => void onConfirmDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </section>
  );
}

// ─── Icons (inline SVG — no emoji) ──────────────────────────────────────────

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
    >
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
