/**
 * useStudentProfile
 * =================
 * Backing data hook for the teacher-facing per-student profile page
 * (`StudentProfilePage`). Given a course id (UUID or short_code) + a
 * student id, fires THREE parallel reads:
 *
 *   A. assignment_best_attempts joined to assignments scoped to the course
 *      → all "best" submitted attempts + effective_score for the row.
 *      We supplement with in-progress (submitted_at IS NULL) rows from
 *      assignment_attempts so a Section A row exists for "started, not
 *      submitted" too. Mirrors the gradebook's dual-fetch pattern.
 *   B. discussion_posts joined to discussion_topics scoped to the course,
 *      filtered to author_id = studentId.
 *   C. portfolio_submissions joined to portfolio_items → portfolio_templates
 *      where template.course_id = courseId AND submission.student_id =
 *      studentId.
 *
 * Each section reports its own loading/error so the page can render a
 * skeleton per section instead of gating the entire view on the slowest
 * fetch. The hook also resolves the student's profile row (display_name,
 * email, role) and the parent course row (id, short_code, name).
 *
 * RLS naturally guards every query: teachers only see attempts /
 * discussion_posts / portfolio_submissions inside courses they own or
 * co-teach. URL hacking to a foreign course just yields empty arrays —
 * the page renders the graceful "no activity yet" path.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { normalizeCourseType, type CourseType } from "./useTeacherClasses";

// --- Public types ----------------------------------------------------------

export interface StudentProfileHeader {
  /** Resolved profile row for the student. Null when RLS denied or the
   *  row no longer exists. */
  id: string;
  display_name: string | null;
  email: string;
  role: string | null;
}

export interface StudentProfileCourse {
  id: string;
  short_code: string;
  name: string;
  course_type: CourseType;
}

export interface StudentAttemptRow {
  attempt_id: string;
  assignment_id: string;
  assignment_title: string;
  /** When non-null this is the most recent state — submitted-and-graded,
   *  submitted-pending-grade, or in-progress (no submitted_at). */
  submitted_at: string | null;
  started_at: string | null;
  score_percent: number | null;
  /** COALESCE(score_override, score_percent). */
  effective_score: number | null;
  /** Raw status — "submitted", "in_progress", etc. Not all rows carry it
   *  (the in-progress fallback read does not select it). */
  status: string | null;
}

export interface StudentDiscussionPostRow {
  post_id: string;
  topic_id: string;
  topic_short_code: string | null;
  topic_title: string;
  body: string;
  created_at: string;
}

export interface StudentPortfolioSubmissionRow {
  submission_id: string;
  item_id: string;
  item_title: string;
  status: string;
  submitted_at: string | null;
  has_feedback: boolean;
}

export interface UseStudentProfile {
  header: StudentProfileHeader | null;
  course: StudentProfileCourse | null;
  headerLoading: boolean;
  headerError: string | null;
  /** True when the student profile row could not be loaded — used for the
   *  graceful "Student not found" empty state. */
  notFound: boolean;
  attempts: StudentAttemptRow[];
  attemptsLoading: boolean;
  attemptsError: string | null;
  posts: StudentDiscussionPostRow[];
  postsLoading: boolean;
  postsError: string | null;
  portfolio: StudentPortfolioSubmissionRow[];
  portfolioLoading: boolean;
  portfolioError: string | null;
  /** ISO timestamp of the most recent of any activity, or null when the
   *  student has no activity yet. */
  lastActivityAt: string | null;
  refresh: () => Promise<void>;
}

// --- Internal row shapes (server-side) -------------------------------------

interface CourseRow {
  id: string;
  short_code: string;
  name: string;
  course_type: string | null;
}

interface ProfileRow {
  id: string;
  display_name: string | null;
  email: string;
  role: string | null;
}

interface AssignmentLite {
  id: string;
  title: string;
}

interface BestAttemptRow {
  attempt_id: string;
  assignment_id: string;
  student_id: string;
  score_percent: number | string | null;
  effective_score: number | string | null;
  submitted_at: string | null;
  status: string | null;
}

interface InProgressAttemptRow {
  id: string;
  assignment_id: string;
  student_id: string;
  started_at: string | null;
  submitted_at: string | null;
}

interface DiscussionPostJoinRow {
  id: string;
  topic_id: string;
  body: string;
  created_at: string;
  topic:
    | {
        id: string;
        short_code: string | null;
        title: string;
        course_id: string;
      }
    | null;
}

interface PortfolioSubmissionJoinRow {
  id: string;
  item_id: string;
  status: string;
  submitted_at: string | null;
  item:
    | {
        id: string;
        title: string;
        template_id: string;
      }
    | null;
  // Tiny embed: we use `count` to detect whether feedback exists at all.
  feedback: { count: number }[] | { count: number } | null;
}

// --- Helpers ---------------------------------------------------------------

function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return fallback;
}

function isShortCode(ref: string): boolean {
  return /^[A-Z0-9]{6}$/.test(ref);
}

function toNumber(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function pickFeedbackCount(
  embed: PortfolioSubmissionJoinRow["feedback"],
): number {
  if (!embed) return 0;
  if (Array.isArray(embed)) {
    return embed.reduce((acc, row) => acc + (row?.count ?? 0), 0);
  }
  return embed.count ?? 0;
}

function maxIso(values: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  let bestTime = -Infinity;
  for (const v of values) {
    if (!v) continue;
    const t = new Date(v).getTime();
    if (Number.isFinite(t) && t > bestTime) {
      bestTime = t;
      best = v;
    }
  }
  return best;
}

// --- Hook ------------------------------------------------------------------

export function useStudentProfile(
  courseRef: string | null | undefined,
  studentId: string | null | undefined,
): UseStudentProfile {
  const [header, setHeader] = useState<StudentProfileHeader | null>(null);
  const [course, setCourse] = useState<StudentProfileCourse | null>(null);
  const [headerLoading, setHeaderLoading] = useState(true);
  const [headerError, setHeaderError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [attempts, setAttempts] = useState<StudentAttemptRow[]>([]);
  const [attemptsLoading, setAttemptsLoading] = useState(true);
  const [attemptsError, setAttemptsError] = useState<string | null>(null);

  const [posts, setPosts] = useState<StudentDiscussionPostRow[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [postsError, setPostsError] = useState<string | null>(null);

  const [portfolio, setPortfolio] = useState<StudentPortfolioSubmissionRow[]>(
    [],
  );
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!courseRef || !studentId) {
      setHeader(null);
      setCourse(null);
      setHeaderLoading(false);
      setNotFound(true);
      setAttempts([]);
      setAttemptsLoading(false);
      setPosts([]);
      setPostsLoading(false);
      setPortfolio([]);
      setPortfolioLoading(false);
      return;
    }

    setHeaderLoading(true);
    setHeaderError(null);
    setNotFound(false);

    // 1) Resolve course + student profile sequentially-but-tiny — we need
    //    the resolved course UUID before kicking off the activity reads.
    let resolvedCourse: CourseRow | null = null;
    try {
      const lookupColumn = isShortCode(courseRef) ? "short_code" : "id";
      const courseRes = await supabase
        .from("courses")
        .select("id, short_code, name, course_type")
        .eq(lookupColumn, courseRef)
        .maybeSingle();
      if (courseRes.error) {
        setHeaderError(courseRes.error.message);
        setHeaderLoading(false);
        // Without a course id none of the activity reads can run usefully.
        setAttempts([]);
        setAttemptsLoading(false);
        setPosts([]);
        setPostsLoading(false);
        setPortfolio([]);
        setPortfolioLoading(false);
        return;
      }
      if (!courseRes.data) {
        setHeaderLoading(false);
        setNotFound(true);
        setAttempts([]);
        setAttemptsLoading(false);
        setPosts([]);
        setPostsLoading(false);
        setPortfolio([]);
        setPortfolioLoading(false);
        return;
      }
      resolvedCourse = courseRes.data as unknown as CourseRow;
      setCourse({
        id: resolvedCourse.id,
        short_code: resolvedCourse.short_code,
        name: resolvedCourse.name,
        course_type: normalizeCourseType(resolvedCourse.course_type),
      });
    } catch (err: unknown) {
      setHeaderError(getErrorMessage(err, "Failed to load course."));
      setHeaderLoading(false);
      return;
    }

    const courseId = resolvedCourse.id;

    // Profile load is in parallel with activity reads — we don't gate the
    // sections on the header coming back.
    const profilePromise = supabase
      .from("profiles")
      .select("id, display_name, email, role")
      .eq("id", studentId)
      .maybeSingle();

    // Reset section loading flags so the skeletons show.
    setAttemptsLoading(true);
    setAttemptsError(null);
    setPostsLoading(true);
    setPostsError(null);
    setPortfolioLoading(true);
    setPortfolioError(null);

    // 2) Section A: attempts (best + in-progress) for assignments in this
    //    course belonging to this student.
    const attemptsPromise = (async (): Promise<void> => {
      try {
        const asnRes = await supabase
          .from("assignments")
          .select("id, title")
          .eq("course_id", courseId)
          .eq("archived", false)
          .eq("hidden", false);
        if (asnRes.error) {
          setAttemptsError(asnRes.error.message);
          setAttempts([]);
          return;
        }
        const asnRows = (asnRes.data ?? []) as unknown as AssignmentLite[];
        const titleById = new Map<string, string>(
          asnRows.map((a) => [a.id, a.title]),
        );
        const assignmentIds = asnRows.map((a) => a.id);
        if (assignmentIds.length === 0) {
          setAttempts([]);
          return;
        }

        const [bestRes, inProgRes] = await Promise.all([
          supabase
            .from("assignment_best_attempts")
            .select(
              "attempt_id, assignment_id, student_id, score_percent, effective_score, submitted_at, status",
            )
            .in("assignment_id", assignmentIds)
            .eq("student_id", studentId),
          supabase
            .from("assignment_attempts")
            .select("id, assignment_id, student_id, started_at, submitted_at")
            .in("assignment_id", assignmentIds)
            .eq("student_id", studentId)
            .is("submitted_at", null),
        ]);

        if (bestRes.error) {
          setAttemptsError(bestRes.error.message);
          setAttempts([]);
          return;
        }
        // inProgRes failing is non-fatal — we just lose the "draft" rows.
        const bestRows = (bestRes.data ?? []) as unknown as BestAttemptRow[];
        const inProgRows =
          inProgRes.error
            ? []
            : ((inProgRes.data ?? []) as unknown as InProgressAttemptRow[]);

        const seenKey = new Set<string>();
        const merged: StudentAttemptRow[] = [];

        for (const r of bestRows) {
          const key = `${r.assignment_id}|${r.attempt_id}`;
          seenKey.add(key);
          merged.push({
            attempt_id: r.attempt_id,
            assignment_id: r.assignment_id,
            assignment_title:
              titleById.get(r.assignment_id) ?? "Untitled assignment",
            submitted_at: r.submitted_at,
            started_at: null,
            score_percent: toNumber(r.score_percent),
            effective_score: toNumber(r.effective_score),
            status: r.status,
          });
        }
        for (const r of inProgRows) {
          const key = `${r.assignment_id}|${r.id}`;
          if (seenKey.has(key)) continue;
          merged.push({
            attempt_id: r.id,
            assignment_id: r.assignment_id,
            assignment_title:
              titleById.get(r.assignment_id) ?? "Untitled assignment",
            submitted_at: r.submitted_at,
            started_at: r.started_at,
            score_percent: null,
            effective_score: null,
            status: "in_progress",
          });
        }

        // Newest activity first. Prefer submitted_at; fall back to
        // started_at for in-progress rows.
        merged.sort((a, b) => {
          const at = new Date(a.submitted_at ?? a.started_at ?? 0).getTime();
          const bt = new Date(b.submitted_at ?? b.started_at ?? 0).getTime();
          return bt - at;
        });
        setAttempts(merged);
      } catch (err: unknown) {
        setAttemptsError(getErrorMessage(err, "Failed to load attempts."));
        setAttempts([]);
      } finally {
        setAttemptsLoading(false);
      }
    })();

    // 3) Section B: discussion posts the student authored in this course.
    const postsPromise = (async (): Promise<void> => {
      try {
        const postsRes = await supabase
          .from("discussion_posts")
          .select(
            "id, topic_id, body, created_at, topic:discussion_topics!discussion_posts_topic_id_fkey(id, short_code, title, course_id)",
          )
          .eq("author_id", studentId)
          .order("created_at", { ascending: false });
        if (postsRes.error) {
          setPostsError(postsRes.error.message);
          setPosts([]);
          return;
        }
        const rows = (postsRes.data ?? []) as unknown as DiscussionPostJoinRow[];
        const mapped: StudentDiscussionPostRow[] = [];
        for (const r of rows) {
          if (!r.topic || r.topic.course_id !== courseId) continue;
          mapped.push({
            post_id: r.id,
            topic_id: r.topic.id,
            topic_short_code: r.topic.short_code ?? null,
            topic_title: r.topic.title,
            body: r.body,
            created_at: r.created_at,
          });
        }
        setPosts(mapped);
      } catch (err: unknown) {
        setPostsError(
          getErrorMessage(err, "Failed to load discussion posts."),
        );
        setPosts([]);
      } finally {
        setPostsLoading(false);
      }
    })();

    // 4) Section C: portfolio submissions on items in this course's template.
    const portfolioPromise = (async (): Promise<void> => {
      try {
        const tplRes = await supabase
          .from("portfolio_templates")
          .select("id")
          .eq("course_id", courseId)
          .maybeSingle();
        if (tplRes.error) {
          setPortfolioError(tplRes.error.message);
          setPortfolio([]);
          return;
        }
        const templateId = (tplRes.data as { id?: string } | null)?.id ?? null;
        if (!templateId) {
          setPortfolio([]);
          return;
        }

        const subsRes = await supabase
          .from("portfolio_submissions")
          .select(
            "id, item_id, status, submitted_at, item:portfolio_items!portfolio_submissions_item_id_fkey(id, title, template_id), feedback:portfolio_feedback(count)",
          )
          .eq("student_id", studentId)
          .order("submitted_at", { ascending: false, nullsFirst: false });
        if (subsRes.error) {
          setPortfolioError(subsRes.error.message);
          setPortfolio([]);
          return;
        }
        const rows = (subsRes.data ??
          []) as unknown as PortfolioSubmissionJoinRow[];
        const mapped: StudentPortfolioSubmissionRow[] = [];
        for (const r of rows) {
          if (!r.item || r.item.template_id !== templateId) continue;
          mapped.push({
            submission_id: r.id,
            item_id: r.item.id,
            item_title: r.item.title,
            status: r.status,
            submitted_at: r.submitted_at,
            has_feedback: pickFeedbackCount(r.feedback) > 0,
          });
        }
        setPortfolio(mapped);
      } catch (err: unknown) {
        setPortfolioError(
          getErrorMessage(err, "Failed to load portfolio submissions."),
        );
        setPortfolio([]);
      } finally {
        setPortfolioLoading(false);
      }
    })();

    // Finalize the header once the profile lookup lands. Activity loads
    // run in parallel and update independently.
    try {
      const profileRes = await profilePromise;
      if (profileRes.error) {
        setHeaderError(profileRes.error.message);
        setHeader(null);
      } else if (!profileRes.data) {
        setHeader(null);
        setNotFound(true);
      } else {
        const row = profileRes.data as unknown as ProfileRow;
        setHeader({
          id: row.id,
          display_name: row.display_name,
          email: row.email,
          role: row.role,
        });
      }
    } catch (err: unknown) {
      setHeaderError(getErrorMessage(err, "Failed to load student profile."));
      setHeader(null);
    } finally {
      setHeaderLoading(false);
    }

    await Promise.all([attemptsPromise, postsPromise, portfolioPromise]);
  }, [courseRef, studentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const lastActivityAt = maxIso([
    ...attempts.map((a) => a.submitted_at ?? a.started_at ?? null),
    ...posts.map((p) => p.created_at),
    ...portfolio.map((p) => p.submitted_at),
  ]);

  return {
    header,
    course,
    headerLoading,
    headerError,
    notFound,
    attempts,
    attemptsLoading,
    attemptsError,
    posts,
    postsLoading,
    postsError,
    portfolio,
    portfolioLoading,
    portfolioError,
    lastActivityAt,
    refresh,
  };
}
