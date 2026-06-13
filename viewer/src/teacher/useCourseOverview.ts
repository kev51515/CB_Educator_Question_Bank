/**
 * useCourseOverview
 * =================
 * Aggregates the five "what's happening this week" signals the teacher needs
 * on the course landing page:
 *
 *   1. Roster size + new enrollments in the last 7 days.
 *   2. Active assignment count + how many are due within 7 days + how many
 *      are past due with at least one student missing a submission.
 *   3. Activity in the last 7 days (attempts started, submissions, new
 *      discussion replies) + the 5 most-recent discussion posts.
 *   4. Average effective score across submitted attempts in the last 30 days
 *      and the count of attempts still needing teacher attention.
 *
 * All shaped as one shot — five parallel Supabase queries via Promise.all,
 * each capped with `.limit()` so we never accidentally pull thousands of
 * rows. The page calls `refresh()` after a debounced click of the header
 * "Refresh" button.
 *
 * Why an aggregate hook instead of five independent ones: the Overview page
 * loads all of these at once on mount; coalescing them into a single
 * loading/error state keeps the skeleton + retry UX coherent. If a single
 * section fails non-fatally (e.g. discussion_posts blocked by RLS in some
 * future state) we degrade gracefully and surface zero rather than tank the
 * whole page.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface RecentPost {
  id: string;
  topicId: string;
  topicTitle: string;
  authorName: string;
  createdAt: string;
}

export interface CourseOverview {
  // Roster
  studentCount: number;
  newEnrollmentsLast7Days: number;

  // Assignments
  activeAssignmentCount: number;
  upcomingDueCount: number;
  overdueWithMissingSubmissions: number;

  // Recent activity (last 7 days)
  attemptsLast7: number;
  submissionsLast7: number;
  newReplies: number;
  recentPosts: RecentPost[];

  // Aggregate grade signal (last 30 days)
  avgEffectiveScore30Days: number | null;
  ungradedCount: number;
}

export interface UseCourseOverview {
  data: CourseOverview | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

interface MembershipRow {
  joined_at: string;
}

interface AssignmentLite {
  id: string;
  due_at: string | null;
  archived: boolean;
}

interface AttemptRow {
  id: string;
  assignment_id: string;
  student_id: string;
  started_at: string | null;
  submitted_at: string | null;
  graded_at: string | null;
  score_percent: number | string | null;
}

interface RecentPostRow {
  id: string;
  created_at: string;
  topic_id: string;
  author: { display_name: string | null } | null;
  topic: { title: string | null } | null;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const POST_LIMIT = 5;
// Generous query caps — well above any realistic single-course volume but
// they guard against pathological data states (a course with 50K stale
// attempts) from blowing past the Supabase response size limit.
const MAX_ATTEMPTS = 2000;
const MAX_POSTS = 500;
const MAX_MEMBERSHIPS = 1000;

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

export function useCourseOverview(courseId: string | undefined): UseCourseOverview {
  const [data, setData] = useState<CourseOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Guard against the classic stale-response race: if the consumer remounts
  // or the courseId changes while a fetch is in flight, the late response
  // would otherwise paint stale data.
  const tokenRef = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    if (!courseId) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    const token = ++tokenRef.current;
    setLoading(true);
    setError(null);

    const now = Date.now();
    const cutoff7 = new Date(now - SEVEN_DAYS_MS).toISOString();
    const cutoff30 = new Date(now - THIRTY_DAYS_MS).toISOString();

    try {
      // 1. Roster — every membership row; we'll derive both the total and
      //    the "joined this week" subcount client-side from one fetch.
      const rosterPromise = supabase
        .from("course_memberships")
        .select("joined_at")
        .eq("course_id", courseId)
        .limit(MAX_MEMBERSHIPS);

      // 2. Active assignments — id + due_at + archived. Caps at "active"
      //    (archived === false) but pulls due_at so we can bucket
      //    upcoming/overdue without a second round-trip.
      const assignmentsPromise = supabase
        .from("assignments")
        .select("id, due_at, archived")
        .eq("course_id", courseId)
        .eq("archived", false)
        .eq("hidden", false)
        .limit(500);

      // 3. Recent attempts — the last 30 days of attempt rows for this
      //    course. Pulled once and reused for the 7-day attempt count,
      //    7-day submission count, 30-day avg score, and ungraded count.
      const attemptsPromise = supabase
        .from("assignment_attempts")
        .select(
          "id, assignment_id, student_id, started_at, submitted_at, graded_at, score_percent, assignments!inner(course_id)",
        )
        .eq("assignments.course_id", courseId)
        .gte("started_at", cutoff30)
        .limit(MAX_ATTEMPTS);

      // 4. Recent discussion posts — joined to topic title + author name.
      //    Bounded to the last 7 days so the "new replies" count is honest;
      //    the top-5 list reuses the same fetch.
      const postsPromise = supabase
        .from("discussion_posts")
        .select(
          "id, created_at, topic_id, author:profiles!discussion_posts_author_id_fkey(display_name), topic:discussion_topics!inner(title, course_id)",
        )
        .eq("topic.course_id", courseId)
        .gte("created_at", cutoff7)
        .order("created_at", { ascending: false })
        .limit(MAX_POSTS);

      const [rosterRes, assignmentsRes, attemptsRes, postsRes] =
        await Promise.all([
          rosterPromise,
          assignmentsPromise,
          attemptsPromise,
          postsPromise,
        ]);

      if (tokenRef.current !== token) return;

      if (rosterRes.error) throw rosterRes.error;
      if (assignmentsRes.error) throw assignmentsRes.error;
      if (attemptsRes.error) throw attemptsRes.error;
      // Posts failure is non-fatal — fall back to zeros so the rest of the
      // overview still renders.
      const postsRows = postsRes.error
        ? []
        : ((postsRes.data ?? []) as unknown as RecentPostRow[]);

      // ── Roster ──────────────────────────────────────────────────────
      const memberships = (rosterRes.data ?? []) as unknown as MembershipRow[];
      const studentCount = memberships.length;
      const newEnrollmentsLast7Days = memberships.filter(
        (m) => new Date(m.joined_at).getTime() >= now - SEVEN_DAYS_MS,
      ).length;

      // ── Assignments ─────────────────────────────────────────────────
      const assignments = (assignmentsRes.data ?? []) as unknown as AssignmentLite[];
      const activeAssignmentCount = assignments.length;
      const upcomingDueCount = assignments.filter((a) => {
        if (!a.due_at) return false;
        const due = new Date(a.due_at).getTime();
        return due >= now && due <= now + SEVEN_DAYS_MS;
      }).length;

      // ── Attempts ────────────────────────────────────────────────────
      const attempts = (attemptsRes.data ?? []) as unknown as AttemptRow[];

      // Bucket attempts by assignment so we can compute "overdue assignments
      // with missing submissions" in one O(students × assignments) pass.
      const submittedByAssignment = new Map<string, Set<string>>();
      for (const a of attempts) {
        if (!a.submitted_at) continue;
        let set = submittedByAssignment.get(a.assignment_id);
        if (!set) {
          set = new Set<string>();
          submittedByAssignment.set(a.assignment_id, set);
        }
        set.add(a.student_id);
      }

      // "Overdue with missing submissions" = the assignment is past its due
      // date AND fewer than studentCount students have submitted. If we have
      // no roster (studentCount === 0), every overdue assignment is "missing"
      // by definition, but we report 0 because there's no one to chase.
      const overdueWithMissingSubmissions = assignments.filter((a) => {
        if (!a.due_at) return false;
        if (new Date(a.due_at).getTime() >= now) return false;
        if (studentCount === 0) return false;
        const submitted = submittedByAssignment.get(a.id)?.size ?? 0;
        return submitted < studentCount;
      }).length;

      let attemptsLast7 = 0;
      let submissionsLast7 = 0;
      let ungradedCount = 0;
      let scoreSum = 0;
      let scoreCount = 0;
      const cutoff7Ms = now - SEVEN_DAYS_MS;

      for (const a of attempts) {
        if (a.started_at) {
          const started = new Date(a.started_at).getTime();
          if (started >= cutoff7Ms) attemptsLast7 += 1;
        }
        if (a.submitted_at) {
          const submitted = new Date(a.submitted_at).getTime();
          if (submitted >= cutoff7Ms) submissionsLast7 += 1;

          // Ungraded = submitted but never graded. Mirrors the gradebook's
          // "ungraded" semantics (see CourseGradebook.tsx).
          if (!a.graded_at) ungradedCount += 1;

          const pct = toNumber(a.score_percent);
          if (pct !== null) {
            scoreSum += pct;
            scoreCount += 1;
          }
        }
      }

      const avgEffectiveScore30Days =
        scoreCount === 0 ? null : scoreSum / scoreCount;

      // ── Discussion posts ────────────────────────────────────────────
      const newReplies = postsRows.length;
      const recentPosts: RecentPost[] = postsRows.slice(0, POST_LIMIT).map((row) => ({
        id: row.id,
        topicId: row.topic_id,
        topicTitle: row.topic?.title ?? "(untitled topic)",
        authorName: row.author?.display_name ?? "Anonymous",
        createdAt: row.created_at,
      }));

      const next: CourseOverview = {
        studentCount,
        newEnrollmentsLast7Days,
        activeAssignmentCount,
        upcomingDueCount,
        overdueWithMissingSubmissions,
        attemptsLast7,
        submissionsLast7,
        newReplies,
        recentPosts,
        avgEffectiveScore30Days,
        ungradedCount,
      };

      if (tokenRef.current === token) {
        setData(next);
        setLoading(false);
      }
    } catch (err: unknown) {
      if (tokenRef.current !== token) return;
      setError(getErrorMessage(err, "Failed to load course overview."));
      setData(null);
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, refresh: load };
}
