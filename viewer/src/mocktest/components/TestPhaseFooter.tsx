/**
 * TestPhaseFooter — bottom action bar: flag, prev, next/submit.
 *
 * Mobile (M19): buttons are h-10 on phone (≥40px tap target) and h-9 on
 * desktop. Submit and Next labels are ALWAYS visible — the previous
 * `hidden sm:inline` made the Submit text disappear on phones until the
 * last question, leaving Sophia without a Submit affordance.
 */
import type { TestQuestion } from "@/mocktest/types";

interface TestPhaseFooterProps {
  currentQuestion: TestQuestion;
  isFlagged: boolean;
  isFirst: boolean;
  isLast: boolean;
  onToggleFlag: (questionId: string) => void;
  onGoTo: (idx: number) => void;
  currentIdx: number;
  onSubmitClick: () => void;
}

const BTN_BASE =
  "h-10 sm:h-9 px-3 gap-1 inline-flex items-center justify-center rounded-md text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950";

export function TestPhaseFooter({
  currentQuestion,
  isFlagged,
  isFirst,
  isLast,
  onToggleFlag,
  onGoTo,
  currentIdx,
  onSubmitClick,
}: TestPhaseFooterProps) {
  return (
    <footer className="shrink-0 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur-sm px-4 py-2.5 flex items-center gap-2 z-10">
      <button
        type="button"
        onClick={() => onToggleFlag(currentQuestion.id)}
        aria-pressed={isFlagged}
        aria-label={isFlagged ? "Remove flag from this question" : "Flag this question for review"}
        className={[
          BTN_BASE,
          "font-medium border",
          isFlagged
            ? "text-amber-700 dark:text-amber-300 border-amber-400 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/40"
            : "text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:text-amber-700 hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40",
        ].join(" ")}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill={isFlagged ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
          <line x1="4" y1="22" x2="4" y2="15" />
        </svg>
        <span>{isFlagged ? "Flagged" : "Flag"}</span>
        <kbd className="hidden sm:inline font-mono opacity-50 text-[10px] ml-0.5">[F]</kbd>
      </button>
      <div className="flex-1" />
      {/*
        Sidebar Submit button only renders on lg+ via the aside. On phone /
        tablet the inline Submit here is the only Submit affordance until
        the last question — keep it visible.
      */}
      <button
        type="button"
        onClick={onSubmitClick}
        className={[
          BTN_BASE,
          "lg:hidden border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800",
        ].join(" ")}
      >
        Submit
      </button>
      <button
        type="button"
        className={[
          BTN_BASE,
          "border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed",
        ].join(" ")}
        disabled={isFirst}
        onClick={() => onGoTo(currentIdx - 1)}
        aria-label="Previous question"
      >
        <span aria-hidden="true">◀</span>
        <span>Prev</span>
      </button>
      <button
        type="button"
        className={[
          BTN_BASE,
          isLast
            ? "bg-emerald-600 hover:bg-emerald-700 text-white"
            : "border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800",
        ].join(" ")}
        onClick={() => (!isLast ? onGoTo(currentIdx + 1) : onSubmitClick())}
        aria-label={isLast ? "Submit test" : "Next question"}
      >
        <span>{isLast ? "Submit" : "Next"}</span>
        {!isLast && <span aria-hidden="true">▶</span>}
      </button>
    </footer>
  );
}
