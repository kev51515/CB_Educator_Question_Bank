/**
 * test-overview/RosterRow
 * =======================
 * One student's row in the live-test roster on TestOverviewPage. Renders the
 * three states — submitted (taken), in-progress, not-started — with their
 * status pills, proctoring signals, and admin action controls (Review /
 * release, Message, Pause·End·Reset). Pure presentational: all mutations are
 * delegated to callbacks so the page owns the data + RPCs.
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

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 bg-white dark:bg-slate-900 transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{name}</p>
        {taken ? (
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            started {fmtTime(lr?.started_at ?? null)} → submitted {fmtTime(row.submitted_at)}
            {row.score != null &&
              row.total != null &&
              ` · ${row.score}/${row.total}${pct != null ? ` (${pct}%)` : ""}`}
          </p>
        ) : row.has_in_progress ? (
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {lr?.module_label ?? "In progress"}
            {lr?.current_question != null && ` · Q${lr.current_question}`}
            {lr?.answered != null &&
              lr?.module_questions != null &&
              ` · ${lr.answered}/${lr.module_questions} answered`}
            {lr?.started_at && ` · started ${fmtTime(lr.started_at)}`}
          </p>
        ) : (
          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
            Hasn't opened the test yet
          </p>
        )}
      </div>

      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
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
            <div className="inline-flex items-center gap-1">
              <RowAction
                tone="primary"
                onClick={() => onReview(row)}
                disabled={reviewLoadingId === row.run_id}
              >
                {reviewLoadingId === row.run_id ? "…" : "Review"}
              </RowAction>
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
            </div>
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
                    className="rounded-none"
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
                    className="rounded-none"
                    onClick={() => onEnd(row, lr.run_id ?? undefined)}
                    title="End this student's test now — grades their answers as-is"
                  >
                    End
                  </RowAction>
                )}
                <RowAction
                  tone="danger"
                  className="rounded-none"
                  onClick={() => onReset(row)}
                  title="Wipe their attempt so they can start fresh (requires confirmation)"
                >
                  Reset
                </RowAction>
              </ActionGroup>
            )}
          </>
        ) : (
          <StatusPill tone="idle" label="Not started" />
        )}
      </div>
    </li>
  );
}
