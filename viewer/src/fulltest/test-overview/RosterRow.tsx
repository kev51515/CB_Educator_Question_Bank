/**
 * test-overview/RosterRow
 * =======================
 * One student's row in the live-test roster on TestOverviewPage. Renders the
 * three states — submitted (taken), in-progress, not-started — as a `<tr>` of
 * cells (Student / Status / Timing / Score / Actions) with their status pills,
 * proctoring signals, and admin action controls (Review / release, Message,
 * Pause·End·Reset). Pure presentational: all mutations are delegated to
 * callbacks so the page owns the data + RPCs.
 */
import {
  fmtAwaySecs,
  fmtIntegrity,
  fmtTime,
  flagLabel,
  pctOf,
  type LiveInfo,
  type RosterRow as RosterRowData,
} from "./helpers";
import { StatusPill, RowAction, ActionGroup } from "./StatusPill";

interface RosterRowProps {
  row: RosterRowData;
  live: LiveInfo | undefined;
  isAdmin: boolean;
  reviewLoadingId: string | null;
  rowBusy: string | null;
  pauseBusy: string | null;
  hasNewMessage: boolean;
  onReview: (row: RosterRowData) => void;
  onReplay: (runId: string) => void;
  /** Open this run's report exactly as the student sees it (QA / pre-release check). */
  onReport: (runId: string) => void;
  onToggleRelease: (row: RosterRowData) => void;
  onSetPause: (runId: string, paused: boolean, name: string) => void;
  onOpenChat: (runId: string, name: string) => void;
  onEnd: (row: RosterRowData, runId: string | undefined) => void;
  onReset: (row: RosterRowData) => void;
}

export function RosterRowView({
  row,
  live: lr,
  isAdmin,
  reviewLoadingId,
  rowBusy,
  pauseBusy,
  hasNewMessage,
  onReview,
  onReplay,
  onReport,
  onToggleRelease,
  onSetPause,
  onOpenChat,
  onEnd,
  onReset,
}: RosterRowProps): JSX.Element {
  const taken = row.run_id !== null;
  const released = row.results_released_at !== null;
  const pct = pctOf(row.score, row.total);
  const away = lr?.away_count ?? 0;
  const awaySecs = lr?.away_total_seconds ?? 0;
  const flagged = lr?.flagged ?? false;
  const flagReasons = lr?.flag_reasons ?? [];
  const integrity = fmtIntegrity(lr?.integrity);
  const name = row.student_name ?? "Student";
  const startedIso = lr?.started_at ?? null;
  const durationMin =
    taken && startedIso && row.submitted_at
      ? Math.max(
          0,
          Math.round(
            (new Date(row.submitted_at).getTime() - new Date(startedIso).getTime()) / 60000,
          ),
        )
      : null;

  return (
    <tr className="divide-x divide-slate-100 bg-white transition-colors hover:bg-slate-50/70 dark:divide-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/40">
      {/* Student */}
      <td className="py-3 px-3 align-middle">
        <span className="block max-w-[16rem] truncate text-sm font-medium text-slate-900 dark:text-slate-100">
          {name}
        </span>
      </td>

      {/* Status */}
      <td className="py-3 px-3 align-middle">
        <div className="flex flex-wrap items-center gap-1.5">
          {taken ? (
            <>
              <StatusPill
                tone={released ? "released" : "hidden"}
                label={released ? "Released" : "Hidden"}
              />
              {flagged && (
                <StatusPill
                  tone="alert"
                  label="Needs review"
                  title={
                    flagReasons.length
                      ? flagReasons.map(flagLabel).join(" · ")
                      : "Flagged for review — open Review to see the proctoring timeline"
                  }
                />
              )}
            </>
          ) : row.has_in_progress ? (
            <>
              <StatusPill
                tone={lr?.paused ? "paused" : "live"}
                pulse={!lr?.paused}
                label={lr?.paused ? "Paused" : "In progress"}
              />
              {flagged && (
                <StatusPill
                  tone="alert"
                  label="Needs review"
                  title={flagReasons.length ? flagReasons.map(flagLabel).join(" · ") : "Flagged for review"}
                />
              )}
              {away > 0 && (
                <StatusPill
                  tone="warn"
                  label={`Left tab ${away}×${awaySecs > 0 ? ` · ${fmtAwaySecs(awaySecs)}` : ""}`}
                  title="Times the student left the test tab"
                />
              )}
              {integrity && (
                <StatusPill tone="alert" label={integrity} title="Integrity signals during the test" />
              )}
            </>
          ) : (
            <StatusPill tone="idle" label="Not started" />
          )}
        </div>
      </td>

      {/* Timing */}
      <td className="py-3 px-3 align-middle">
        {taken ? (
          <div className="flex flex-col gap-0.5">
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-slate-600 dark:text-slate-300">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="text-slate-400 dark:text-slate-500">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              <span className="tabular-nums">{fmtTime(lr?.started_at ?? null)}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="text-slate-300 dark:text-slate-600">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
              <span className="tabular-nums">{fmtTime(row.submitted_at)}</span>
            </span>
            {durationMin != null && (
              <span className="pl-[18px] text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
                took {durationMin} min
              </span>
            )}
          </div>
        ) : row.has_in_progress ? (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {lr?.module_label ?? "In progress"}
            {lr?.current_question != null && ` · Q${lr.current_question}`}
            {lr?.answered != null &&
              lr?.module_questions != null &&
              ` · ${lr.answered}/${lr.module_questions} answered`}
            {lr?.started_at && ` · started ${fmtTime(lr.started_at)}`}
          </span>
        ) : (
          <span className="text-xs text-slate-400 dark:text-slate-500">Hasn't opened yet</span>
        )}
      </td>

      {/* Score */}
      <td className="py-3 px-3 align-middle">
        {taken && row.score != null && row.total != null ? (
          <span className="whitespace-nowrap text-sm tabular-nums text-slate-700 dark:text-slate-200">
            {row.score}/{row.total}
            {pct != null && (
              <span className="text-slate-400 dark:text-slate-500"> ({pct}%)</span>
            )}
          </span>
        ) : (
          <span className="text-sm text-slate-400 dark:text-slate-500">—</span>
        )}
      </td>

      {/* Actions — one right-aligned NOWRAP row so buttons line up across
          rows instead of wrapping into a ragged stack. The page column is
          wide (max-w-7xl); on narrow screens the table itself scrolls. */}
      <td className="py-3 px-3 align-middle">
        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
          {taken ? (
            <>
              <RowAction
                tone="primary"
                onClick={() => onReview(row)}
                disabled={reviewLoadingId === row.run_id}
                title="Open the grading review — answers, score, proctoring timeline"
              >
                {reviewLoadingId === row.run_id ? "…" : "Review"}
              </RowAction>
              {row.run_id && (
                <RowAction
                  onClick={() => onReport(row.run_id ?? "")}
                  title="See this student's report exactly as they see it once released"
                >
                  Student report
                </RowAction>
              )}
              {row.run_id && (
                <RowAction
                  onClick={() => onReplay(row.run_id ?? "")}
                  title="Replay this student's sitting — answers, highlights, notes and timing"
                >
                  Replay
                </RowAction>
              )}
              {isAdmin && (
                <RowAction
                  onClick={() => onToggleRelease(row)}
                  disabled={rowBusy === row.run_id}
                  title={
                    released
                      ? "Hide this student's results again"
                      : "Let this student see their score and answer review"
                  }
                >
                  {rowBusy === row.run_id ? "…" : released ? "Hide results" : "Release to student"}
                </RowAction>
              )}
            </>
          ) : row.has_in_progress ? (
            <>
              {lr?.run_id && (
                <RowAction
                  onClick={() => onReplay(lr.run_id ?? "")}
                  title="Replay this student's actions so far"
                >
                  Replay
                </RowAction>
              )}
              {isAdmin && lr?.run_id && (
                <RowAction
                  tone="primary"
                  className="relative"
                  onClick={() => onOpenChat(lr.run_id ?? "", name)}
                  title="Message this student (they can reply while paused)"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="mr-1 h-3.5 w-3.5">
                    <path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.4L3 21l2.1-5.7A8.4 8.4 0 1 1 21 11.5Z" />
                  </svg>
                  Message
                  {hasNewMessage && (
                    <span
                      aria-label="new message"
                      className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900"
                    />
                  )}
                </RowAction>
              )}
              {isAdmin && (
                <ActionGroup>
                  {lr?.run_id && (
                    <RowAction
                      className="rounded-none ring-0 shadow-none"
                      disabled={pauseBusy === lr.run_id}
                      onClick={() => onSetPause(lr.run_id ?? "", !lr.paused, name)}
                      title={lr.paused ? "Resume this student's timer" : "Freeze this student's timer"}
                    >
                      {pauseBusy === lr.run_id ? "…" : lr.paused ? "Resume" : "Pause"}
                    </RowAction>
                  )}
                  {lr?.run_id && (
                    <RowAction
                      tone="warn"
                      className="rounded-none ring-0 shadow-none"
                      onClick={() => onEnd(row, lr.run_id ?? undefined)}
                      title="End this student's test now — grades their answers as-is"
                    >
                      End
                    </RowAction>
                  )}
                  <RowAction
                    tone="danger"
                    className="rounded-none ring-0 shadow-none"
                    onClick={() => onReset(row)}
                    title="Wipe their attempt so they can start fresh (requires confirmation)"
                  >
                    Reset
                  </RowAction>
                </ActionGroup>
              )}
            </>
          ) : null}
        </div>
      </td>
    </tr>
  );
}
