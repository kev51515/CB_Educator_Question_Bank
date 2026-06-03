/**
 * useNeedsAttention
 * =================
 * Powers the cross-course "Needs your attention" triage rail above the
 * dashboard course grid. Maya's #1 audit finding was that she had to open
 * every course every morning to see what was waiting on her — this hook
 * answers that question with three small, independent queries:
 *
 *   1. To grade  — assignment attempts that have been `submitted_at` but not
 *                  yet `graded_at`. The graded_at column shipped in 0053; if
 *                  the live DB hasn't been migrated yet we fall back to a
 *                  pure submitted_at-NOT-NULL list and treat absence of
 *                  feedback_text as "ungraded".
 *   2. Past due  — assignments whose due_at is in the past. We deliberately
 *                  do NOT compute the per-student delta here (Maya can click
 *                  through for that); this keeps the query single-shot. The
 *                  v1 view just surfaces the assignments so she's aware.
 *   3. New replies — recent discussion posts whose author is NOT the signed
 *                  in teacher. Filtered client-side after fetch.
 *
 * Each section reloads independently via `refreshToGrade`, `refreshPastDue`,
 * `refreshReplies`, and there's a fan-out `refreshAll`. RLS does the
 * cross-course scoping — Maya only sees rows for courses she teaches/owns.
 *
 * No new migration. No new RPC. Direct queries only.
 *
 * Realtime
 * --------
 * Mirrors the pattern in `useNotifications`: a single Supabase Realtime
 * channel listens for inserts/updates on `assignment_attempts` and
 * `discussion_posts`. Events are debounced (300ms) and routed to the
 * appropriate section refetch only. A per-section throttle (5s minimum
 * gap) keeps the panel snappy under bursts. Newly-arrived ids are tracked
 * in `recentlyAdded*` sets so the UI can flash the row indigo for ~1.2s.
 * On channel reconnect (`SUBSCRIBED` after a prior close) we fan out a
 * full refresh to catch any events missed during the gap. RLS scopes
 * events to rows Maya could SELECT anyway.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

const FLASH_DURATION_MS = 1200;

// ─── Public row types ─────────────────────────────────────────────────────

export interface ToGradeItem {
  attemptId: string;
  submittedAt: string;
  scorePercent: number | null;
  studentName: string;
  courseShortCode: string;
  courseName: string;
  assignmentShortCode: string;
  assignmentTitle: string;
}

export interface PastDueItem {
  assignmentId: string;
  assignmentShortCode: string;
  assignmentTitle: string;
  dueAt: string;
  courseShortCode: string;
  courseName: string;
}

export interface NewReplyItem {
  postId: string;
  createdAt: string;
  bodyPreview: string;
  authorName: string;
  topicShortCode: string;
  topicTitle: string;
  courseShortCode: string;
  courseName: string;
}

export interface UseNeedsAttention {
  toGrade: ToGradeItem[];
  pastDue: PastDueItem[];
  replies: NewReplyItem[];
  loadingToGrade: boolean;
  loadingPastDue: boolean;
  loadingReplies: boolean;
  errorToGrade: string | null;
  errorPastDue: string | null;
  errorReplies: string | null;
  refreshAll: () => Promise<void>;
  refreshToGrade: () => Promise<void>;
  refreshPastDue: () => Promise<void>;
  refreshReplies: () => Promise<void>;
  /** Set of attempt ids that just arrived via realtime — flash briefly. */
  recentlyAddedToGrade: Set<string>;
  /** Set of post ids that just arrived via realtime — flash briefly. */
  recentlyAddedReplies: Set<string>;
}

// ─── Internal row shapes (what Supabase actually returns) ─────────────────

// Supabase joins are returned as either object (single FK) or array; we type
// permissively and pluck the first/only element defensively.
type EmbeddedOne<T> = T | T[] | null;

interface CourseEmbed {
  id: string;
  short_code: string;
  name: string;
  archived: boolean;
}

interface AttemptRow {
  id: string;
  submitted_at: string | null;
  score_percent: number | string | null;
  feedback_text?: string | null;
  graded_at?: string | null;
  student: EmbeddedOne<{ id: string; display_name: string | null; email?: string | null }>;
  assignment: EmbeddedOne<{
    id: string;
    short_code: string;
    title: string;
    due_at: string | null;
    course_id: string;
    course: EmbeddedOne<CourseEmbed>;
  }>;
}

interface AssignmentRow {
  id: string;
  short_code: string;
  title: string;
  due_at: string | null;
  course_id: string;
  course: EmbeddedOne<CourseEmbed>;
}

interface PostRow {
  id: string;
  created_at: string;
  body: string;
  author_id: string;
  author: EmbeddedOne<{ display_name: string | null; email?: string | null }>;
  topic: EmbeddedOne<{
    id: string;
    short_code: string;
    title: string;
    course_id: string;
    course: EmbeddedOne<CourseEmbed>;
  }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function pickOne<T>(value: EmbeddedOne<T>): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Failed to load.";
}

function nameOf(p: { display_name: string | null; email?: string | null } | null): string {
  return p?.display_name ?? p?.email ?? "Unknown";
}

function toPercent(v: number | string | null): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

function previewOf(body: string): string {
  // Strip markdown-ish fluff for a single-line preview. Keep tight; the row
  // truncates with CSS too, so this is mostly a "no newlines / no HTML
  // markup" pass.
  const stripped = body
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/[#>*_`~-]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length > 140 ? `${stripped.slice(0, 140)}…` : stripped;
}

// Heuristic for the 0053 fallback path: if a query mentioning `graded_at`
// throws / errors with a missing-column message, we can re-issue without it
// and treat `feedback_text` as the gating signal.
function isMissingColumnError(message: string | undefined | null, column: string): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return m.includes(column) && (m.includes("does not exist") || m.includes("column"));
}

// ─── Hook ─────────────────────────────────────────────────────────────────

export function useNeedsAttention(teacherId: string | null): UseNeedsAttention {
  const [toGrade, setToGrade] = useState<ToGradeItem[]>([]);
  const [pastDue, setPastDue] = useState<PastDueItem[]>([]);
  const [replies, setReplies] = useState<NewReplyItem[]>([]);

  const [loadingToGrade, setLoadingToGrade] = useState<boolean>(true);
  const [loadingPastDue, setLoadingPastDue] = useState<boolean>(true);
  const [loadingReplies, setLoadingReplies] = useState<boolean>(true);

  const [errorToGrade, setErrorToGrade] = useState<string | null>(null);
  const [errorPastDue, setErrorPastDue] = useState<string | null>(null);
  const [errorReplies, setErrorReplies] = useState<string | null>(null);

  // Track ids that arrived via realtime so the UI can flash them briefly.
  const [recentlyAddedToGrade, setRecentlyAddedToGrade] = useState<Set<string>>(
    () => new Set<string>(),
  );
  const [recentlyAddedReplies, setRecentlyAddedReplies] = useState<Set<string>>(
    () => new Set<string>(),
  );

  // Mutable refs for the realtime machinery. We don't want these in deps
  // arrays — they're stable across renders by design.
  const previousToGradeIdsRef = useRef<Set<string>>(new Set<string>());
  const previousReplyIdsRef = useRef<Set<string>>(new Set<string>());
  const flashTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  // Mount/teacherId guard: after a sign-out → sign-in-as-other (or a
  // rapid teacherId prop change), in-flight awaits below could otherwise
  // commit the previous teacher's rows into the new render. Lane B
  // pattern from AssignmentRunner.
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // Schedule a flash for a newly-arrived id. Idempotent — re-scheduling
  // before the previous timer fires just resets the clock.
  const scheduleFlash = useCallback(
    (id: string, kind: "toGrade" | "replies"): void => {
      const existing = flashTimersRef.current.get(id);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        flashTimersRef.current.delete(id);
        if (kind === "toGrade") {
          setRecentlyAddedToGrade((prev) => {
            if (!prev.has(id)) return prev;
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        } else {
          setRecentlyAddedReplies((prev) => {
            if (!prev.has(id)) return prev;
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }
      }, FLASH_DURATION_MS);
      flashTimersRef.current.set(id, timer);
    },
    [],
  );

  // ── Query 1: ungraded submitted attempts ────────────────────────────────
  const refreshToGrade = useCallback(async (): Promise<void> => {
    if (!teacherId) {
      setToGrade([]);
      setLoadingToGrade(false);
      return;
    }
    setLoadingToGrade(true);
    setErrorToGrade(null);

    const selectClause =
      "id, submitted_at, score_percent, feedback_text, graded_at, " +
      "student:profiles!assignment_attempts_student_id_fkey(id, display_name, email), " +
      "assignment:assignments!inner(" +
      "id, short_code, title, due_at, course_id, " +
      "course:courses!assignments_course_id_fkey(id, short_code, name, archived)" +
      ")";

    try {
      // Primary path: filter on graded_at IS NULL (0053).
      let res = await supabase
        .from("assignment_attempts")
        .select(selectClause)
        .not("submitted_at", "is", null)
        .is("graded_at", null)
        .order("submitted_at", { ascending: false })
        .limit(50);

      // 0053 fallback: if `graded_at` doesn't exist on this DB, re-issue
      // without it and synthesize "ungraded" from absence of feedback_text.
      if (res.error && isMissingColumnError(res.error.message, "graded_at")) {
        const fallbackSelect = selectClause.replace(", graded_at", "");
        res = await supabase
          .from("assignment_attempts")
          .select(fallbackSelect)
          .not("submitted_at", "is", null)
          .order("submitted_at", { ascending: false })
          .limit(50);
      }

      // Mount-guard after both possible awaits: don't commit a previous
      // teacher's attempts into a new render.
      if (!aliveRef.current) return;

      if (res.error) {
        setErrorToGrade(res.error.message);
        setToGrade([]);
        return;
      }

      const rows = (res.data ?? []) as unknown as AttemptRow[];
      const mapped: ToGradeItem[] = [];
      for (const row of rows) {
        const submittedAt = row.submitted_at;
        if (!submittedAt) continue;
        // Fallback gate: only filter out rows that clearly have teacher
        // feedback when graded_at is unavailable.
        if (row.graded_at === undefined && row.feedback_text) continue;

        const assignment = pickOne(row.assignment);
        if (!assignment) continue;
        const course = pickOne(assignment.course);
        if (!course || course.archived) continue;
        const student = pickOne(row.student);

        mapped.push({
          attemptId: row.id,
          submittedAt,
          scorePercent: toPercent(row.score_percent),
          studentName: nameOf(student),
          courseShortCode: course.short_code,
          courseName: course.name,
          assignmentShortCode: assignment.short_code,
          assignmentTitle: assignment.title,
        });
      }
      // Diff against previous ids to flag newcomers for the flash effect.
      // First load (empty prior set) seeds without flashing.
      const previousIds = previousToGradeIdsRef.current;
      const nextIds = new Set(mapped.map((m) => m.attemptId));
      if (previousIds.size > 0) {
        const newcomers: string[] = [];
        for (const item of mapped) {
          if (!previousIds.has(item.attemptId)) newcomers.push(item.attemptId);
        }
        if (newcomers.length > 0) {
          setRecentlyAddedToGrade((prev) => {
            const next = new Set(prev);
            for (const id of newcomers) next.add(id);
            return next;
          });
          for (const id of newcomers) scheduleFlash(id, "toGrade");
        }
      }
      previousToGradeIdsRef.current = nextIds;
      setToGrade(mapped);
    } catch (err: unknown) {
      if (!aliveRef.current) return;
      setErrorToGrade(getErrorMessage(err));
      setToGrade([]);
    } finally {
      if (aliveRef.current) setLoadingToGrade(false);
    }
  }, [teacherId, scheduleFlash]);

  // ── Query 2: overdue assignments ────────────────────────────────────────
  const refreshPastDue = useCallback(async (): Promise<void> => {
    if (!teacherId) {
      setPastDue([]);
      setLoadingPastDue(false);
      return;
    }
    setLoadingPastDue(true);
    setErrorPastDue(null);

    try {
      const nowIso = new Date().toISOString();
      const res = await supabase
        .from("assignments")
        .select(
          "id, short_code, title, due_at, course_id, " +
            "course:courses!assignments_course_id_fkey(id, short_code, name, archived)",
        )
        .lt("due_at", nowIso)
        .eq("archived", false)
        .order("due_at", { ascending: false })
        .limit(40);

      // Mount-guard: bail out before any setState if this hook has
      // unmounted or teacherId has flipped.
      if (!aliveRef.current) return;
      if (res.error) {
        setErrorPastDue(res.error.message);
        setPastDue([]);
        return;
      }

      const rows = (res.data ?? []) as unknown as AssignmentRow[];
      const mapped: PastDueItem[] = [];
      for (const row of rows) {
        if (!row.due_at) continue;
        const course = pickOne(row.course);
        if (!course || course.archived) continue;
        mapped.push({
          assignmentId: row.id,
          assignmentShortCode: row.short_code,
          assignmentTitle: row.title,
          dueAt: row.due_at,
          courseShortCode: course.short_code,
          courseName: course.name,
        });
        if (mapped.length >= 10) break;
      }
      setPastDue(mapped);
    } catch (err: unknown) {
      if (!aliveRef.current) return;
      setErrorPastDue(getErrorMessage(err));
      setPastDue([]);
    } finally {
      if (aliveRef.current) setLoadingPastDue(false);
    }
  }, [teacherId]);

  // ── Query 3: new discussion replies ─────────────────────────────────────
  const refreshReplies = useCallback(async (): Promise<void> => {
    if (!teacherId) {
      setReplies([]);
      setLoadingReplies(false);
      return;
    }
    setLoadingReplies(true);
    setErrorReplies(null);

    try {
      const res = await supabase
        .from("discussion_posts")
        .select(
          "id, created_at, body, author_id, " +
            "author:profiles!discussion_posts_author_id_fkey(display_name, email), " +
            "topic:discussion_topics!inner(" +
            "id, short_code, title, course_id, " +
            "course:courses!discussion_topics_course_id_fkey(id, short_code, name, archived)" +
            ")",
        )
        .order("created_at", { ascending: false })
        .limit(20);

      // Mount-guard: previous-teacher replies must not land on the new
      // render after a fast user flip.
      if (!aliveRef.current) return;
      if (res.error) {
        setErrorReplies(res.error.message);
        setReplies([]);
        return;
      }

      const rows = (res.data ?? []) as unknown as PostRow[];
      const mapped: NewReplyItem[] = [];
      for (const row of rows) {
        // Skip the teacher's own posts — no point flagging her own work.
        if (row.author_id === teacherId) continue;
        const topic = pickOne(row.topic);
        if (!topic) continue;
        const course = pickOne(topic.course);
        if (!course || course.archived) continue;

        mapped.push({
          postId: row.id,
          createdAt: row.created_at,
          bodyPreview: previewOf(row.body),
          authorName: nameOf(pickOne(row.author)),
          topicShortCode: topic.short_code,
          topicTitle: topic.title,
          courseShortCode: course.short_code,
          courseName: course.name,
        });
      }
      // Diff against previous ids to flag newcomers for the flash effect.
      const prevReplyIds = previousReplyIdsRef.current;
      const nextReplyIds = new Set(mapped.map((m) => m.postId));
      if (prevReplyIds.size > 0) {
        const newcomers: string[] = [];
        for (const item of mapped) {
          if (!prevReplyIds.has(item.postId)) newcomers.push(item.postId);
        }
        if (newcomers.length > 0) {
          setRecentlyAddedReplies((prev) => {
            const next = new Set(prev);
            for (const id of newcomers) next.add(id);
            return next;
          });
          for (const id of newcomers) scheduleFlash(id, "replies");
        }
      }
      previousReplyIdsRef.current = nextReplyIds;
      setReplies(mapped);
    } catch (err: unknown) {
      if (!aliveRef.current) return;
      setErrorReplies(getErrorMessage(err));
      setReplies([]);
    } finally {
      if (aliveRef.current) setLoadingReplies(false);
    }
  }, [teacherId, scheduleFlash]);

  const refreshAll = useCallback(async (): Promise<void> => {
    await Promise.all([refreshToGrade(), refreshPastDue(), refreshReplies()]);
  }, [refreshToGrade, refreshPastDue, refreshReplies]);

  // Fan-out on teacherId change. Independent so a slow section never gates
  // the others.
  useEffect(() => {
    void refreshToGrade();
    void refreshPastDue();
    void refreshReplies();
  }, [refreshToGrade, refreshPastDue, refreshReplies]);

  // ── Realtime subscription ───────────────────────────────────────────────
  // Mirrors the useNotifications pattern: one Supabase channel per teacher,
  // with two postgres_changes listeners (assignment_attempts +
  // discussion_posts). Each event triggers a 300ms-debounced refresh of
  // ONLY the relevant section so a burst of events doesn't cascade. RLS
  // gates the events server-side — Maya only sees rows she'd already see
  // in a normal SELECT.
  //
  // Reconnection: on SUBSCRIBED we refresh all sections so any events
  // missed during the gap are recovered.
  //
  // Refresh callbacks are read off refs so their identity churning
  // (teacherId change, parent re-render, scheduleFlash recreation) does
  // NOT tear down + recreate the channel. Channel teardown opens a
  // subscription gap during which realtime events are silently dropped.
  const refreshToGradeRef = useRef(refreshToGrade);
  refreshToGradeRef.current = refreshToGrade;
  const refreshRepliesRef = useRef(refreshReplies);
  refreshRepliesRef.current = refreshReplies;
  const refreshAllRef = useRef(refreshAll);
  refreshAllRef.current = refreshAll;

  useEffect(() => {
    if (!teacherId) return;
    let toGradeTimer: ReturnType<typeof setTimeout> | null = null;
    let repliesTimer: ReturnType<typeof setTimeout> | null = null;
    const REALTIME_DEBOUNCE_MS = 300;

    const channel = supabase
      .channel(`needs-attention:${teacherId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "assignment_attempts" },
        () => {
          if (toGradeTimer) clearTimeout(toGradeTimer);
          toGradeTimer = setTimeout(() => {
            toGradeTimer = null;
            // Read latest fetcher off the ref — channel stays alive
            // across refresh callback identity flips.
            void refreshToGradeRef.current();
          }, REALTIME_DEBOUNCE_MS);
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "discussion_posts" },
        () => {
          if (repliesTimer) clearTimeout(repliesTimer);
          repliesTimer = setTimeout(() => {
            repliesTimer = null;
            void refreshRepliesRef.current();
          }, REALTIME_DEBOUNCE_MS);
        },
      )
      .subscribe((status) => {
        // On (re)connect, full-refresh to recover events missed during the
        // gap. supabase-js auto-reconnects, so this fires after any drop.
        if (status === "SUBSCRIBED") {
          void refreshAllRef.current();
        }
      });

    return () => {
      if (toGradeTimer) clearTimeout(toGradeTimer);
      if (repliesTimer) clearTimeout(repliesTimer);
      // Clear any pending flash timers on unmount so we don't leak.
      for (const t of flashTimersRef.current.values()) clearTimeout(t);
      flashTimersRef.current.clear();
      void supabase.removeChannel(channel);
    };
    // Depend ONLY on the stable channel-topic input (teacherId). Refresh
    // fns are accessed via refs above so callback identity flips don't
    // trigger a channel teardown → resubscribe gap.
  }, [teacherId]);

  return {
    toGrade,
    pastDue,
    replies,
    loadingToGrade,
    loadingPastDue,
    loadingReplies,
    errorToGrade,
    errorPastDue,
    errorReplies,
    refreshAll,
    refreshToGrade,
    refreshPastDue,
    refreshReplies,
    recentlyAddedToGrade,
    recentlyAddedReplies,
  };
}
