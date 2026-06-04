/**
 * useRecentFeedback — most recently graded / commented assignment attempts
 * for the signed-in student. Used by RecentFeedbackWidget on the student
 * landing (AreaSelector, default limit 5) and by MyFeedbackPage which
 * passes a higher `limit` and grows it on "Load more".
 *
 * Source: assignment_attempts joined to assignments → courses. RLS already
 * limits attempts to the row owner (student_id = auth.uid()), so the only
 * filter we apply is the OR-clause that keeps "ungraded + no feedback"
 * rows out of the widget.
 *
 * Resilience: if migration 0056 hasn't been applied (pre-grading-persistence
 * databases), the OR-clause references missing columns and PostgREST 400s.
 * We swallow that into an empty array — Sophia hasn't opted in, no point
 * alarming her.
 *
 * Grader-name resolution: we batch a single `profiles` SELECT for every
 * unique grader_id across the rows, so we don't fan out to N+1 lookups for
 * what is at most one extra request per refresh.
 *
 * Pagination model: simple offset / limit. The page passes an initial limit
 * (e.g. 25) and calls `loadMore(addCount)` to bump the limit and re-fetch.
 * `hasMore` is true when the last fetch came back full (heuristic: when the
 * returned row count equals the requested limit there may be more). Cursor
 * pagination is overkill at the volumes a single student sees here.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

export interface RecentFeedbackItem {
  attemptId: string;
  assignmentId: string;
  assignmentTitle: string;
  assignmentShortCode: string;
  courseShortCode: string;
  courseName: string;
  /** COALESCE(score_override, score_percent) — the score the student sees. */
  effectiveScore: number | null;
  scorePercent: number | null;
  scoreOverride: number | null;
  /** First 120 chars of feedback_text (trimmed) or null. */
  feedbackPreview: string | null;
  /** Full feedback_text (trimmed) or null. Used by MyFeedbackPage. */
  feedbackText: string | null;
  gradedAt: string | null;
  graderDisplayName: string | null;
}

export interface UseRecentFeedback {
  items: RecentFeedbackItem[];
  loading: boolean;
  error: string | null;
  /** True when the previous fetch returned a full page (more may exist). */
  hasMore: boolean;
  /**
   * Bump the active limit by `addCount` and re-fetch. No-op while a fetch
   * is already in flight or when `hasMore` is false. Used by MyFeedbackPage's
   * "Load more" button for offset-style pagination.
   */
  loadMore: (addCount: number) => Promise<void>;
}

/** Default page size when no caller-supplied limit is provided. */
const DEFAULT_LIMIT = 5;
const PREVIEW_LENGTH = 120;

interface AttemptRow {
  id: string;
  score_percent: number | string | null;
  score_override: number | string | null;
  feedback_text: string | null;
  graded_at: string | null;
  grader_id: string | null;
  assignment: {
    id: string;
    short_code: string | null;
    title: string;
    course_id: string;
    course: {
      short_code: string | null;
      name: string;
    } | null;
  } | null;
}

function toNumberOrNull(value: number | string | null): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function buildPreview(text: string | null): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length <= PREVIEW_LENGTH) return trimmed;
  return `${trimmed.slice(0, PREVIEW_LENGTH).trimEnd()}…`;
}

export interface UseRecentFeedbackOptions {
  /** Page size. Default 5 to preserve the widget's behavior. */
  limit?: number;
}

export function useRecentFeedback(
  studentId: string | null,
  opts?: UseRecentFeedbackOptions,
): UseRecentFeedback {
  const initialLimit =
    typeof opts?.limit === "number" && opts.limit > 0 ? opts.limit : DEFAULT_LIMIT;

  const [items, setItems] = useState<RecentFeedbackItem[]>([]);
  const [loading, setLoading] = useState<boolean>(studentId !== null);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(false);
  // `activeLimit` is the current ceiling fed to PostgREST. Bumped by
  // `loadMore`. Tracked in a ref alongside state so a fast double-click
  // can't queue two fetches with stale limits.
  const [activeLimit, setActiveLimit] = useState<number>(initialLimit);
  const limitRef = useRef<number>(initialLimit);
  const inFlightRef = useRef<boolean>(false);

  const fetchPage = useCallback(
    async (limit: number): Promise<void> => {
      if (!studentId) {
        setItems([]);
        setLoading(false);
        setError(null);
        setHasMore(false);
        return;
      }
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setLoading(true);
      setError(null);
      try {
        const { data, error: queryError } = await supabase
          .from("assignment_attempts")
          .select(
            `
              id, score_percent, score_override, feedback_text, graded_at, grader_id,
              assignment:assignments!inner(
                id, short_code, title, course_id,
                course:courses!course_id(short_code, name)
              )
            `,
          )
          .eq("student_id", studentId)
          .or("graded_at.not.is.null,feedback_text.not.is.null")
          .order("graded_at", { ascending: false, nullsFirst: false })
          .limit(limit);

        if (queryError) {
          // Pre-0056 schemas don't have these columns — silently degrade so
          // the widget collapses to nothing rather than nagging the student
          // with an error that isn't theirs to fix.
          setItems([]);
          setError(null);
          setHasMore(false);
          return;
        }

        const rows = (data ?? []) as unknown as AttemptRow[];
        if (rows.length === 0) {
          setItems([]);
          setHasMore(false);
          return;
        }

        // Batched grader lookup: one SELECT for all distinct grader ids.
        const graderIds = Array.from(
          new Set(
            rows
              .map((row) => row.grader_id)
              .filter(
                (id): id is string => typeof id === "string" && id.length > 0,
              ),
          ),
        );
        const graderNames = new Map<string, string>();
        if (graderIds.length > 0) {
          const { data: profileRows, error: profileError } = await supabase
            .from("profiles")
            .select("id, display_name")
            .in("id", graderIds);
          if (!profileError && profileRows) {
            for (const row of profileRows as Array<{
              id: string;
              display_name: string | null;
            }>) {
              if (row.display_name && row.display_name.trim().length > 0) {
                graderNames.set(row.id, row.display_name);
              }
            }
          }
        }

        const mapped: RecentFeedbackItem[] = rows.map((row) => {
          const assignment = row.assignment;
          const course = assignment?.course ?? null;
          const scorePercent = toNumberOrNull(row.score_percent);
          const scoreOverride = toNumberOrNull(row.score_override);
          const effectiveScore =
            scoreOverride !== null ? scoreOverride : scorePercent;
          const trimmedFeedback =
            row.feedback_text && row.feedback_text.trim().length > 0
              ? row.feedback_text.trim()
              : null;
          return {
            attemptId: row.id,
            assignmentId: assignment?.id ?? "",
            assignmentTitle: assignment?.title ?? "Assignment",
            assignmentShortCode: assignment?.short_code ?? "",
            courseShortCode: course?.short_code ?? "",
            courseName: course?.name ?? "",
            effectiveScore,
            scorePercent,
            scoreOverride,
            feedbackPreview: buildPreview(row.feedback_text),
            feedbackText: trimmedFeedback,
            gradedAt: row.graded_at,
            graderDisplayName: row.grader_id
              ? graderNames.get(row.grader_id) ?? null
              : null,
          };
        });
        setItems(mapped);
        // Heuristic: a full page might have more behind it. Cheap, correct
        // when limit > total only off by one fetch.
        setHasMore(rows.length >= limit);
      } catch {
        // Network / unexpected — same silent-degrade policy. The widget
        // collapses; the student is none the wiser.
        setItems([]);
        setError(null);
        setHasMore(false);
      } finally {
        inFlightRef.current = false;
        setLoading(false);
      }
    },
    [studentId],
  );

  // Re-fetch whenever the student or the active limit changes. Splitting
  // limit out of the callback identity lets `loadMore` simply bump state and
  // let this effect drive the actual query.
  useEffect(() => {
    void fetchPage(activeLimit);
  }, [fetchPage, activeLimit]);

  // Reset pagination when the student changes (sign-out / sign-in).
  useEffect(() => {
    limitRef.current = initialLimit;
    setActiveLimit(initialLimit);
  }, [studentId, initialLimit]);

  const loadMore = useCallback(
    async (addCount: number): Promise<void> => {
      if (!studentId) return;
      if (inFlightRef.current) return;
      if (!Number.isFinite(addCount) || addCount <= 0) return;
      const next = limitRef.current + Math.floor(addCount);
      limitRef.current = next;
      setActiveLimit(next);
    },
    [studentId],
  );

  return { items, loading, error, hasMore, loadMore };
}
