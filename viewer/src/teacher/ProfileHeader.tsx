import { ScoreTrajectorySparkline } from "./ScoreTrajectorySparkline";
import { formatRelative, type TrajectoryPoint } from "./studentProfileHelpers";

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

export function ProfileHeader({
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
