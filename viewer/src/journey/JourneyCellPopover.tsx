/**
 * JourneyCellPopover
 * ==================
 * Student-side cell-detail content (decision 1A, docs/JOURNEY_VIEW.md):
 * kind line, title, state + score, points, due date, the distance-to-seal
 * bar (gold tick at 80%), and the real actions — Start / Review attempt /
 * Retake for the seal. Rendered inside JourneyGrid's anchored popover shell.
 */
import type { JourneyCell } from "./buildJourney";
import { MASTERY_LABEL, SEAL_THRESHOLD } from "./mastery";

interface JourneyCellPopoverProps {
  cell: JourneyCell;
  /** Navigate into the assignment / test (take or retake). */
  onOpen: () => void;
  /** Navigate to the best attempt's review — absent when no attempt. */
  onReview?: () => void;
}

function formatDue(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
  if (days < 0) return "past due";
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  if (days < 7)
    return `due ${d.toLocaleDateString(undefined, { weekday: "long" })}`;
  return `due ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

const STATE_CHIP: Record<string, string> = {
  sealed:
    "bg-amber-50 text-amber-800 ring-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800",
  proficient:
    "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-900",
  attempted:
    "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-900",
  done: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900",
  not_started:
    "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
};

const KIND_LABEL: Record<string, string> = {
  set: "Question Set",
  test: "Practice Test",
  fulltest: "Practice Test",
};

export function JourneyCellPopover({
  cell,
  onOpen,
  onReview,
}: JourneyCellPopoverProps): JSX.Element {
  const score = cell.score !== null ? Math.round(cell.score) : null;
  const due = formatDue(cell.dueAt);
  const submitted =
    cell.state !== "not_started" && cell.state !== "locked";
  const showSealTrack =
    score !== null && submitted && cell.state !== "sealed" && cell.kind !== "fulltest";

  const kindBits: string[] = [KIND_LABEL[cell.kind] ?? "Item"];
  if (cell.info?.questionCount) kindBits.push(`${cell.info.questionCount} Q`);
  if (cell.info?.timeLimitMinutes)
    kindBits.push(`${cell.info.timeLimitMinutes} min`);

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {kindBits.join(" · ")}
      </p>
      <h4 className="page-title mt-0.5 text-[15px] font-semibold text-slate-900 dark:text-slate-100">
        {cell.title}
      </h4>

      <div className="mt-2.5 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${
            STATE_CHIP[cell.state] ?? STATE_CHIP.not_started
          }`}
        >
          {MASTERY_LABEL[cell.state]}
          {score !== null ? ` · ${score}%` : ""}
        </span>
        {cell.possible > 0 && (
          <span className="tabular-nums">
            {cell.earned}/{cell.possible} pts
          </span>
        )}
        {due && (
          <span className="ml-auto text-slate-500 dark:text-slate-400">
            {due}
          </span>
        )}
      </div>

      {showSealTrack && score !== null && (
        <div className="mt-3">
          <div className="mb-1 flex items-baseline justify-between text-[11px]">
            <span className="text-slate-500 dark:text-slate-400 tabular-nums">
              {score}%
            </span>
            <span className="font-semibold text-amber-700 dark:text-amber-400">
              {SEAL_THRESHOLD - score} pts to the seal · {SEAL_THRESHOLD}%
            </span>
          </div>
          <div className="relative h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-visible">
            <div
              className="h-full rounded-full bg-indigo-600 dark:bg-indigo-500"
              style={{ width: `${Math.min(100, score)}%` }}
            />
            {/* gold tick at the seal threshold */}
            <div
              aria-hidden
              className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-amber-500"
              style={{ left: `${SEAL_THRESHOLD}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-3.5 flex gap-2">
        {onReview && submitted && (
          <button
            type="button"
            onClick={onReview}
            className="flex-1 min-h-[36px] rounded-lg px-3 text-xs font-semibold ring-1 ring-slate-300 dark:ring-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 motion-safe:transition-colors"
          >
            Review attempt
          </button>
        )}
        <button
          type="button"
          onClick={onOpen}
          className="flex-1 min-h-[36px] rounded-lg px-3 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white motion-safe:transition-colors"
        >
          {cell.state === "sealed" || cell.state === "done"
            ? "Open"
            : submitted
              ? "Retake for the seal"
              : "Start"}
        </button>
      </div>
    </div>
  );
}
