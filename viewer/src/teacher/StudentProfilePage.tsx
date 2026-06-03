/**
 * StudentProfilePage
 * ==================
 * Teacher-facing per-student "what has this student done in this course"
 * view, mounted at /courses/:courseId/people/:studentId. Linked from:
 *   - ClassRoster row name
 *   - CourseGradebook student-name cell
 *
 * Three collapsible sections — Attempts, Discussion posts, Portfolio
 * submissions — each fed by an independent fetch in `useStudentProfile`,
 * so the slowest section never blocks the others.
 *
 * The all-empty case collapses to one centered "No activity yet" message
 * rather than three noisy empty cards.
 *
 * RLS contract: every read is naturally scoped to the teacher's courses.
 * URL hacking to a student outside the teacher's reach yields a clean
 * "Student not found" state — never a stack trace.
 */
import { useEffect, useMemo, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { Skeleton } from "../components/Skeleton";
import { useToast } from "../components/Toast";
import { coursePeoplePath, ROUTES } from "../lib/routes";
import { useStudentProfile } from "./useStudentProfile";
import type { StudentAttemptRow } from "./useStudentProfile";
import { getInitials, type TrajectoryPoint } from "./studentProfileHelpers";
import { ProfileHeader } from "./ProfileHeader";
import { Section } from "./StudentProfileSection";
import { PrivateNotesSection } from "./PrivateNotesSection";
import { StudentTestReportPanel } from "./StudentTestReportPanel";
import { StudentTestRunsPanel } from "./StudentTestRunsPanel";
import { AttemptsBody } from "./AttemptsBody";
import { PostsBody } from "./PostsBody";
import { PortfolioBody } from "./PortfolioBody";

// --- Page ------------------------------------------------------------------

export function StudentProfilePage(): JSX.Element {
  const params = useParams<{ courseId: string; studentId: string }>();
  const courseRef = params.courseId ?? "";
  const studentId = params.studentId ?? "";
  const navigate = useNavigate();
  const toast = useToast();
  const {
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
  } = useStudentProfile(courseRef, studentId);

  // Route back to the roster — prefer the short_code in the URL once we
  // know it, else fall back to the raw URL param.
  const rosterHref = useMemo(
    () => coursePeoplePath(course?.short_code ?? courseRef),
    [course?.short_code, courseRef],
  );

  const linkCourseRef = course?.short_code ?? courseRef;

  // Top-level error: course lookup failed entirely (not RLS-denied — that
  // would land in `notFound`). Toast once and let the page render an
  // empty header so the user still has a back button.
  const headerErrorToastedRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      headerError &&
      !headerLoading &&
      headerErrorToastedRef.current !== headerError
    ) {
      headerErrorToastedRef.current = headerError;
      toast.error("Couldn't load profile", headerError);
    }
  }, [headerError, headerLoading, toast]);

  const initials = getInitials(
    header?.display_name ?? null,
    header?.email ?? "",
  );

  const allEmpty =
    !attemptsLoading &&
    !postsLoading &&
    !portfolioLoading &&
    attempts.length === 0 &&
    posts.length === 0 &&
    portfolio.length === 0;

  // Derive the score-trajectory sparkline points from the attempts the hook
  // already returned — no additional fetch required. We only consider rows
  // that have both a submitted_at timestamp and a non-null effective_score
  // (skip in-progress rows and rows still awaiting a manual override). The
  // series is sorted ascending by submitted_at and capped at the most
  // recent 15 attempts to keep the header compact.
  const trajectory = useMemo<TrajectoryPoint[]>(() => {
    const eligible = attempts.filter(
      (a): a is StudentAttemptRow & {
        submitted_at: string;
        effective_score: number;
      } => a.submitted_at !== null && a.effective_score !== null,
    );
    eligible.sort(
      (a, b) =>
        new Date(a.submitted_at).getTime() -
        new Date(b.submitted_at).getTime(),
    );
    const recent = eligible.slice(-15);
    return recent.map((a, i) => ({
      x: i,
      y: a.effective_score,
      date: a.submitted_at,
    }));
  }, [attempts]);

  const trajectoryLatestAt =
    trajectory.length > 0 ? trajectory[trajectory.length - 1].date : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 space-y-4">
      <nav className="flex items-center gap-2 text-sm">
        <button
          type="button"
          onClick={() => navigate(rosterHref)}
          className="inline-flex items-center gap-1 rounded-md min-h-[40px] px-2 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          <span aria-hidden>←</span>
          <span>Back to roster</span>
        </button>
      </nav>

      {headerLoading ? (
        <div
          aria-busy="true"
          aria-label="Loading student"
          className="rounded-2xl bg-white/85 dark:bg-slate-900/70 ring-1 ring-slate-200 dark:ring-slate-800 p-5"
        >
          <div className="flex items-start gap-4">
            <Skeleton className="h-14 w-14 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-48 rounded" />
              <Skeleton className="h-3 w-64 rounded" />
              <Skeleton className="h-3 w-40 rounded" />
            </div>
          </div>
        </div>
      ) : notFound || !header ? (
        <div className="rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900">
          <EmptyState
            title="Student not found"
            body="This student isn't in the course, or you don't have access to their profile."
            cta={{
              label: "Back to roster",
              onClick: () => navigate(rosterHref),
            }}
          />
        </div>
      ) : (
        <>
          <ProfileHeader
            initials={initials}
            displayName={header.display_name}
            email={header.email}
            role={header.role}
            courseName={course?.name ?? "Course"}
            lastActivityAt={lastActivityAt}
            trajectory={trajectory}
            trajectoryLatestAt={trajectoryLatestAt}
            onSendMessage={
              header.id
                ? () =>
                    navigate(
                      `${ROUTES.INBOX}?compose=${encodeURIComponent(header.id)}`,
                    )
                : undefined
            }
          />

          {/* Teacher-private notes — always available, even when the student
              has zero activity yet (that's often exactly when Maya wants to
              note "needs early outreach"). */}
          <PrivateNotesSection
            courseId={course?.id ?? null}
            studentId={header.id}
          />

          {/* Full-length test coaching report — score trajectory + weak domains. */}
          <StudentTestReportPanel studentId={header.id} />

          {/* Full-length test results — review + release-to-student control. */}
          <StudentTestRunsPanel studentId={header.id} />

          {allEmpty ? (
            <div className="rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900">
              <EmptyState
                title="No activity yet"
                body="When this student starts an assignment, posts in a discussion, or submits a portfolio item, it'll show up here."
              />
            </div>
          ) : (
            <>
              <Section
                id="attempts"
                title="Attempts"
                count={attemptsLoading ? null : attempts.length}
                defaultOpen={attempts.length > 0 || attemptsLoading}
              >
                <AttemptsBody
                  rows={attempts}
                  loading={attemptsLoading}
                  error={attemptsError}
                  courseRef={linkCourseRef}
                />
              </Section>

              <Section
                id="discussion-posts"
                title="Discussion posts"
                count={postsLoading ? null : posts.length}
                defaultOpen={posts.length > 0 || postsLoading}
              >
                <PostsBody
                  rows={posts}
                  loading={postsLoading}
                  error={postsError}
                  courseRef={linkCourseRef}
                />
              </Section>

              <Section
                id="portfolio-submissions"
                title="Portfolio submissions"
                count={portfolioLoading ? null : portfolio.length}
                defaultOpen={portfolio.length > 0 || portfolioLoading}
              >
                <PortfolioBody
                  rows={portfolio}
                  loading={portfolioLoading}
                  error={portfolioError}
                  courseRef={linkCourseRef}
                />
              </Section>
            </>
          )}
        </>
      )}
    </div>
  );
}
