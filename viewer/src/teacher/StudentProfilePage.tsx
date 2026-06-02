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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { Skeleton, SkeletonRows } from "../components/Skeleton";
import { useToast } from "../components/Toast";
import {
  coursePeoplePath,
  courseAssignmentAttemptPath,
  courseDiscussionPath,
  coursePortfolioPath,
  ROUTES,
} from "../lib/routes";
import { useStudentProfile } from "./useStudentProfile";
import { useStudentNotes } from "./useStudentNotes";
import type {
  StudentAttemptRow,
  StudentDiscussionPostRow,
  StudentPortfolioSubmissionRow,
} from "./useStudentProfile";

// --- Small utilities -------------------------------------------------------

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return iso;
  const diffMs = then.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const minutes = Math.round(diffMs / 60_000);
  const hours = Math.round(diffMs / 3_600_000);
  const days = Math.round(diffMs / 86_400_000);
  if (abs < 60_000) return "just now";
  try {
    const fmt = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    if (abs < 3_600_000) return fmt.format(minutes, "minute");
    if (abs < 86_400_000) return fmt.format(hours, "hour");
    if (abs < 30 * 86_400_000) return fmt.format(days, "day");
    return then.toLocaleDateString();
  } catch {
    return then.toLocaleString();
  }
}

function formatScore(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return `${Math.round(value)}%`;
}

function getInitials(displayName: string | null, email: string): string {
  const source = displayName?.trim() || email.split("@")[0] || "?";
  const parts = source.split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return "?";
  return parts.map((p) => p.charAt(0).toUpperCase()).join("");
}

function previewBody(body: string, max = 140): string {
  const flat = body.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max)}…`;
}

function attemptStatusLabel(row: StudentAttemptRow): {
  label: string;
  toneClass: string;
} {
  if (row.submitted_at === null) {
    return {
      label: "In progress",
      toneClass:
        "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    };
  }
  if (row.status === "graded" || row.effective_score !== null) {
    return {
      label: "Graded",
      toneClass:
        "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
    };
  }
  return {
    label: "Submitted",
    toneClass:
      "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200",
  };
}

// --- Score trajectory sparkline --------------------------------------------
//
// Tiny inline SVG sparkline showing the student's effective-score trajectory
// across their most recent (up to 15) graded attempts. Lives in the profile
// header, just under the role chip. Pure SVG, no chart library, no new deps.
//
// Scale: y is 0..100 (effective_score is already a percent). The last
// segment is colored by score band (emerald ≥80 / indigo 70-79 /
// amber 50-69 / rose <50) so the eye snaps to the trend's destination.

interface TrajectoryPoint {
  /** Index in the sorted-ascending series (used as the x coordinate). */
  x: number;
  /** Effective score 0..100. */
  y: number;
  /** Submitted-at ISO date for the hover <title>. */
  date: string;
}

const SPARK_W = 280;
const SPARK_H = 60;
const SPARK_PAD_X = 6;
const SPARK_PAD_Y = 8;

function bandClass(score: number): string {
  if (score >= 80) return "text-emerald-500 dark:text-emerald-400";
  if (score >= 70) return "text-indigo-500 dark:text-indigo-400";
  if (score >= 50) return "text-amber-500 dark:text-amber-400";
  return "text-rose-500 dark:text-rose-400";
}

function bandFillClass(score: number): string {
  if (score >= 80) return "fill-emerald-600 dark:fill-emerald-400";
  if (score >= 70) return "fill-indigo-600 dark:fill-indigo-400";
  if (score >= 50) return "fill-amber-600 dark:fill-amber-400";
  return "fill-rose-600 dark:fill-rose-400";
}

function projectSparkX(index: number, total: number): number {
  if (total <= 1) return SPARK_W / 2;
  const range = SPARK_W - SPARK_PAD_X * 2;
  return SPARK_PAD_X + (index / (total - 1)) * range;
}

function projectSparkY(score: number): number {
  const clamped = Math.max(0, Math.min(100, score));
  const range = SPARK_H - SPARK_PAD_Y * 2;
  // y inverted: high score → small y
  return SPARK_PAD_Y + (1 - clamped / 100) * range;
}

function formatSparkDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

interface ScoreTrajectorySparklineProps {
  points: ReadonlyArray<TrajectoryPoint>;
  /** ISO of the most recent point — surfaced in the caption beneath the chart. */
  latestAt: string;
}

function ScoreTrajectorySparkline({
  points,
  latestAt,
}: ScoreTrajectorySparklineProps): JSX.Element | null {
  if (points.length === 0) return null;

  // Single-point case: render a dot + helper copy, skip the chart.
  if (points.length === 1) {
    const only = points[0];
    return (
      <div className="mt-3 max-w-[280px]">
        <div className="flex items-center gap-2">
          <svg
            width={SPARK_W}
            height={SPARK_H}
            viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
            className="block"
            aria-hidden
          >
            {/* gridlines */}
            <line
              x1={SPARK_PAD_X}
              x2={SPARK_W - SPARK_PAD_X}
              y1={projectSparkY(0)}
              y2={projectSparkY(0)}
              stroke="currentColor"
              strokeWidth={1}
              className="text-slate-200 dark:text-slate-700"
            />
            <line
              x1={SPARK_PAD_X}
              x2={SPARK_W - SPARK_PAD_X}
              y1={projectSparkY(50)}
              y2={projectSparkY(50)}
              stroke="currentColor"
              strokeDasharray="3 4"
              strokeWidth={1}
              className="text-slate-200 dark:text-slate-700"
            />
            <line
              x1={SPARK_PAD_X}
              x2={SPARK_W - SPARK_PAD_X}
              y1={projectSparkY(100)}
              y2={projectSparkY(100)}
              stroke="currentColor"
              strokeWidth={1}
              className="text-slate-200 dark:text-slate-700"
            />
            <circle
              cx={projectSparkX(0, 1)}
              cy={projectSparkY(only.y)}
              r={4}
              className={bandFillClass(only.y)}
              stroke="white"
              strokeWidth={1.5}
            >
              <title>
                {formatSparkDate(only.date)}: {Math.round(only.y)}%
              </title>
            </circle>
          </svg>
        </div>
        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
          Only one data point — need 2 attempts to see a trajectory
        </p>
      </div>
    );
  }

  const last = points[points.length - 1];
  const lineColor = bandClass(last.y);

  const pathD = points
    .map((p, i) => {
      const x = projectSparkX(p.x, points.length).toFixed(2);
      const y = projectSparkY(p.y).toFixed(2);
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  return (
    <div className="mt-3 max-w-[280px]">
      <svg
        role="img"
        aria-label={`Score trajectory across the last ${points.length} graded attempts`}
        width={SPARK_W}
        height={SPARK_H}
        viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
        className="block motion-safe:transition-opacity"
      >
        {/* Subtle gridlines at 0%, 50%, 100% */}
        <line
          x1={SPARK_PAD_X}
          x2={SPARK_W - SPARK_PAD_X}
          y1={projectSparkY(100)}
          y2={projectSparkY(100)}
          stroke="currentColor"
          strokeWidth={1}
          className="text-slate-200 dark:text-slate-700"
        />
        <line
          x1={SPARK_PAD_X}
          x2={SPARK_W - SPARK_PAD_X}
          y1={projectSparkY(50)}
          y2={projectSparkY(50)}
          stroke="currentColor"
          strokeDasharray="3 4"
          strokeWidth={1}
          className="text-slate-200 dark:text-slate-700"
        />
        <line
          x1={SPARK_PAD_X}
          x2={SPARK_W - SPARK_PAD_X}
          y1={projectSparkY(0)}
          y2={projectSparkY(0)}
          stroke="currentColor"
          strokeWidth={1}
          className="text-slate-200 dark:text-slate-700"
        />

        {/* Trajectory polyline, colored by the latest point's band */}
        <path
          d={pathD}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={lineColor}
          vectorEffect="non-scaling-stroke"
        />

        {/* Per-attempt dots with accessible tooltips */}
        {points.map((p, i) => {
          const isLast = i === points.length - 1;
          const cx = projectSparkX(p.x, points.length);
          const cy = projectSparkY(p.y);
          return (
            <circle
              key={`${p.date}-${i}`}
              cx={cx}
              cy={cy}
              r={isLast ? 4 : 2.5}
              className={
                isLast ? bandFillClass(p.y) : "fill-slate-400 dark:fill-slate-500"
              }
              stroke="white"
              strokeWidth={1.25}
            >
              <title>
                {formatSparkDate(p.date)}: {Math.round(p.y)}%
              </title>
            </circle>
          );
        })}
      </svg>
      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
        Last {points.length} attempt{points.length === 1 ? "" : "s"} · most recent{" "}
        <time dateTime={latestAt}>{formatRelative(latestAt)}</time>
      </p>
    </div>
  );
}

// --- Header ----------------------------------------------------------------

interface HeaderProps {
  initials: string;
  displayName: string | null;
  email: string;
  role: string | null;
  courseName: string;
  lastActivityAt: string | null;
  /** Pre-computed score-trajectory points, ascending by submittedAt.
   *  Empty array hides the sparkline; length 1 shows a single-point hint;
   *  length ≥ 2 shows the polyline. */
  trajectory: ReadonlyArray<TrajectoryPoint>;
  /** ISO of the most recent point in `trajectory`. Unused when empty. */
  trajectoryLatestAt: string | null;
  /** When provided, renders a "Send message" CTA that defers to the inbox
   *  compose-param consumer wired in Round 12. */
  onSendMessage?: () => void;
}

function ProfileHeader({
  initials,
  displayName,
  email,
  role,
  courseName,
  lastActivityAt,
  trajectory,
  trajectoryLatestAt,
  onSendMessage,
}: HeaderProps): JSX.Element {
  return (
    <header className="rounded-2xl bg-white/85 dark:bg-slate-900/70 ring-1 ring-slate-200 dark:ring-slate-800 p-5">
      <div className="flex items-start gap-4">
        <div
          aria-hidden
          className="flex-none flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-lg font-semibold ring-1 ring-indigo-200 dark:ring-indigo-900"
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 truncate">
            {displayName ?? email}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <span className="truncate">{email}</span>
            {role && (
              <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-600 dark:text-slate-300">
                {role}
              </span>
            )}
          </div>
          {trajectory.length > 0 && trajectoryLatestAt && (
            <ScoreTrajectorySparkline
              points={trajectory}
              latestAt={trajectoryLatestAt}
            />
          )}
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-medium text-slate-600 dark:text-slate-300">
              {courseName}
            </span>
            {lastActivityAt && (
              <>
                {" "}
                · Last activity{" "}
                <time dateTime={lastActivityAt}>
                  {formatRelative(lastActivityAt)}
                </time>
              </>
            )}
          </p>
        </div>
        {onSendMessage && (
          <button
            type="button"
            onClick={onSendMessage}
            className="flex-none inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-2 min-h-[40px] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
            title={`Open a direct message thread with ${displayName ?? email}`}
          >
            <svg
              width={16}
              height={16}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="m3 7 9 6 9-6" />
            </svg>
            Send message
          </button>
        )}
      </div>
    </header>
  );
}

// --- Section shell ---------------------------------------------------------

interface SectionProps {
  id: string;
  title: string;
  count: number | null;
  defaultOpen: boolean;
  children: React.ReactNode;
}

function Section({
  id,
  title,
  count,
  defaultOpen,
  children,
}: SectionProps): JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  const headerId = `${id}-header`;
  const panelId = `${id}-panel`;
  return (
    <section
      aria-labelledby={headerId}
      className="rounded-2xl bg-white/85 dark:bg-slate-900/70 ring-1 ring-slate-200 dark:ring-slate-800 overflow-hidden"
    >
      <button
        type="button"
        id={headerId}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 py-3 min-h-[44px] text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
            {title}
          </span>
          {count !== null && (
            <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
              {count}
            </span>
          )}
        </div>
        <span
          aria-hidden
          className={`text-slate-400 transition-transform ${
            open ? "rotate-90" : ""
          }`}
        >
          ›
        </span>
      </button>
      {open && (
        <div id={panelId} className="px-5 pb-5">
          {children}
        </div>
      )}
    </section>
  );
}

// --- Private notes section --------------------------------------------------
//
// Lives between the header and the activity sections. Visible only to
// teachers (the whole page is teacher-only). Mirrors the Section shell's
// collapsible visual language but renders a richer header (lock icon +
// "Private — only visible to you" tagline) and a MarkdownEditor body
// with autosave on blur + a 2s debounce after typing pauses.
//
// Default-open rule: open when a note exists (so Maya/Daniel see what
// they wrote last time); closed when empty (so we don't push them into
// writing notes they don't want to). When empty + collapsed, the header
// label flips to "Add a private note about this student" so the
// affordance stays discoverable.

const NOTE_DEBOUNCE_MS = 2_000;

function PrivateNotesSection({
  courseId,
  studentId,
}: {
  courseId: string | null;
  studentId: string | null;
}): JSX.Element {
  const toast = useToast();
  const { note, loading, error, saving, save } = useStudentNotes(
    courseId,
    studentId,
  );

  // Local editor state — seeded from the server row but typed-into freely.
  // Tracks the last *saved* value separately so save() is a no-op when
  // the user blurs without typing.
  const [bodyHtml, setBodyHtml] = useState<string>("");
  const lastSavedRef = useRef<string>("");
  const debounceTimerRef = useRef<number | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  // Open by default when a saved note exists. Empty -> collapsed so we
  // don't pressure the teacher to fill it in.
  const [open, setOpen] = useState<boolean>(false);
  // Track whether we've initialized from the server fetch yet so user-typed
  // edits don't get clobbered by a late-arriving fetch.
  const initializedRef = useRef<boolean>(false);

  useEffect(() => {
    if (loading) return;
    if (initializedRef.current) return;
    const initial = note?.body ?? "";
    setBodyHtml(initial);
    lastSavedRef.current = initial;
    if (note?.updated_at) setLastSavedAt(note.updated_at);
    setOpen(initial.length > 0);
    initializedRef.current = true;
  }, [loading, note]);

  // When the student/course changes (e.g. the teacher navigates to a
  // different student profile), reset our init flag so we re-seed from
  // the freshly-fetched note.
  useEffect(() => {
    initializedRef.current = false;
    setBodyHtml("");
    lastSavedRef.current = "";
    setLastSavedAt(null);
    setOpen(false);
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, [courseId, studentId]);

  // Surface load errors via toast (one-shot — error string identity is
  // stable across renders until the next fetch).
  useEffect(() => {
    if (error) toast.error("Notes problem", error);
  }, [error, toast]);

  const persist = useCallback(
    async (html: string): Promise<void> => {
      if (html === lastSavedRef.current) return;
      const previous = lastSavedRef.current;
      lastSavedRef.current = html; // optimistic
      try {
        await save(html);
        setLastSavedAt(new Date().toISOString());
      } catch (err: unknown) {
        // useStudentNotes already exposed an error; roll back the optimistic ref
        lastSavedRef.current = previous;
        toast.error(
          "Couldn't save note",
          err instanceof Error ? err.message : undefined,
        );
      }
    },
    [save, toast],
  );

  const onChange = useCallback(
    (html: string) => {
      setBodyHtml(html);
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = window.setTimeout(() => {
        void persist(html);
      }, NOTE_DEBOUNCE_MS);
    },
    [persist],
  );

  const flush = useCallback(async (): Promise<void> => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (bodyHtml === lastSavedRef.current) return;
    await persist(bodyHtml);
  }, [bodyHtml, persist]);

  // Clean up any pending debounce on unmount so we don't fire a save after
  // the component is gone.
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const hasContent = lastSavedRef.current.length > 0 || bodyHtml.length > 0;
  const collapsedLabel = hasContent
    ? "Your private notes"
    : "Add a private note about this student";

  const headerId = "private-notes-header";
  const panelId = "private-notes-panel";

  return (
    <section
      aria-labelledby={headerId}
      className="rounded-2xl bg-white/85 dark:bg-slate-900/70 ring-1 ring-slate-200 dark:ring-slate-800 overflow-hidden"
    >
      <button
        type="button"
        id={headerId}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 py-3 min-h-[44px] text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <div className="flex items-center gap-2">
          <svg
            width={14}
            height={14}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className="text-slate-500 dark:text-slate-400"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
            {open ? "Your private notes" : collapsedLabel}
          </span>
          <span
            title="Private — only visible to you"
            className="hidden sm:inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300"
          >
            Private — only you
          </span>
        </div>
        <span
          aria-hidden
          className={`text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
        >
          ›
        </span>
      </button>
      {open && (
        <div id={panelId} className="px-5 pb-5">
          {loading ? (
            <Skeleton className="h-24 w-full rounded-md" />
          ) : (
            <>
              <div onBlur={() => void flush()}>
                <MarkdownEditor
                  value={bodyHtml}
                  onChange={onChange}
                  placeholder="What should you remember about this student? Conferences, pacing, family context, what's working…"
                  minHeight={140}
                />
              </div>
              <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <svg
                  width={11}
                  height={11}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span>Only you can see this. Not shared with the student or other teachers.</span>
                <span aria-hidden>·</span>
                <span>
                  {saving
                    ? "Saving…"
                    : lastSavedAt
                      ? `Saved ${formatRelative(lastSavedAt)}`
                      : "Not saved yet"}
                </span>
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}

// --- Section bodies --------------------------------------------------------

function AttemptsBody({
  rows,
  loading,
  error,
  courseRef,
}: {
  rows: StudentAttemptRow[];
  loading: boolean;
  error: string | null;
  courseRef: string;
}): JSX.Element {
  if (loading) return <SkeletonRows count={3} rowClassName="h-10" />;
  if (error) {
    return (
      <p
        role="alert"
        className="rounded-md bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-sm text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-900"
      >
        {error}
      </p>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        No attempts yet.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {rows.map((row) => {
        const status = attemptStatusLabel(row);
        const score = formatScore(row.effective_score ?? row.score_percent);
        const isSubmitted = row.submitted_at !== null;
        const linkLabel = status.label === "Graded" ? "Review" : "Open";
        return (
          <li
            key={`${row.assignment_id}|${row.attempt_id}`}
            className="flex items-center gap-3 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                {row.assignment_title}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isSubmitted ? (
                  <>
                    Submitted{" "}
                    <time dateTime={row.submitted_at ?? undefined}>
                      {formatRelative(row.submitted_at)}
                    </time>
                  </>
                ) : (
                  <>
                    Started{" "}
                    <time dateTime={row.started_at ?? undefined}>
                      {formatRelative(row.started_at)}
                    </time>
                  </>
                )}
              </p>
            </div>
            <span
              className={`hidden sm:inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${status.toneClass}`}
            >
              {status.label}
            </span>
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 w-12 text-right">
              {score}
            </span>
            <Link
              to={courseAssignmentAttemptPath(
                courseRef,
                row.assignment_id,
                row.attempt_id,
              )}
              className="inline-flex items-center justify-center rounded-md min-h-[40px] px-3 text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              {linkLabel}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function PostsBody({
  rows,
  loading,
  error,
  courseRef,
}: {
  rows: StudentDiscussionPostRow[];
  loading: boolean;
  error: string | null;
  courseRef: string;
}): JSX.Element {
  if (loading) return <SkeletonRows count={3} rowClassName="h-12" />;
  if (error) {
    return (
      <p
        role="alert"
        className="rounded-md bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-sm text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-900"
      >
        {error}
      </p>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        No posts yet in this course.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {rows.map((row) => (
        <li key={row.post_id} className="py-3">
          <Link
            to={courseDiscussionPath(
              courseRef,
              row.topic_short_code ?? row.topic_id,
            )}
            className="block rounded-md p-2 -m-2 hover:bg-slate-50 dark:hover:bg-slate-800/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
              {row.topic_title}
            </p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
              {previewBody(row.body)}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              <time dateTime={row.created_at}>
                {formatRelative(row.created_at)}
              </time>
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function PortfolioBody({
  rows,
  loading,
  error,
  courseRef,
}: {
  rows: StudentPortfolioSubmissionRow[];
  loading: boolean;
  error: string | null;
  courseRef: string;
}): JSX.Element {
  if (loading) return <SkeletonRows count={3} rowClassName="h-10" />;
  if (error) {
    return (
      <p
        role="alert"
        className="rounded-md bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-sm text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-900"
      >
        {error}
      </p>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        No portfolio submissions yet.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {rows.map((row) => (
        <li
          key={row.submission_id}
          className="flex items-center gap-3 py-3"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
              {row.item_title}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {row.submitted_at ? (
                <>
                  Submitted{" "}
                  <time dateTime={row.submitted_at}>
                    {formatRelative(row.submitted_at)}
                  </time>
                </>
              ) : (
                "Not submitted yet"
              )}
            </p>
          </div>
          <span className="hidden sm:inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 capitalize">
            {row.status.replace(/_/g, " ")}
          </span>
          {row.has_feedback && (
            <span
              title="Has teacher feedback"
              className="inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-[11px] font-medium"
            >
              Feedback
            </span>
          )}
          <Link
            to={`${coursePortfolioPath(courseRef)}?submission=${encodeURIComponent(row.submission_id)}`}
            className="inline-flex items-center justify-center rounded-md min-h-[40px] px-3 text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            Open
          </Link>
        </li>
      ))}
    </ul>
  );
}

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
