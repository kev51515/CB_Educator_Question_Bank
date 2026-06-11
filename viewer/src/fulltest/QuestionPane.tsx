/**
 * QuestionPane
 * ============
 * Renders ONE full-test question, Bluebook-style.
 *
 *  • Runner mode (`fullHeight`): fills the viewport between the fixed header and
 *    footer. Reading & Writing with a stimulus → a two-pane split (stimulus left
 *    / question right) where EACH pane scrolls independently, so moving between
 *    questions never shifts the surrounding chrome. Math / stimulus-less items →
 *    a single centred, scrollable column.
 *  • Review mode (no `fullHeight`): the original stacked card layout used by
 *    ResultView.
 *
 * Answer modes: `mcq` (four A–D choice rows) and `grid` (student-produced
 * response input). Figures are served PNGs and size-constrained so graphs/tables
 * never overflow their pane.
 */
import { useEffect, useRef, useState } from "react";
import { useUiTheme } from "@/lib/theme";
import type { Letter, TestQuestion } from "./types";
import type { AnnotField, Highlight } from "./annotations";
import type { ChoiceRationale } from "./testContent";
import { PassageBody, RichInline, renderText } from "./passageRender";

/** Per-choice class response stats for Review Mode (mcq). */
export type ChoiceStats = Partial<Record<Letter, { count: number; names: string[] }>>;

const LETTERS: Letter[] = ["A", "B", "C", "D"];

// Bluebook renders passages/questions in a serif face. Georgia is a close,
// zero-load match — applied only inside the test runner content.
const SERIF = { fontFamily: "Georgia, 'Times New Roman', 'Iowan Old Style', serif" } as const;

interface QuestionPaneProps {
  question: TestQuestion;
  value: string | null;
  onChange: (value: string | null) => void;
  /** read-only review mode disables inputs */
  disabled?: boolean;
  /** runner mode: fill height with independent-scroll panes (vs stacked card) */
  fullHeight?: boolean;
  marked?: boolean;
  onToggleMark?: () => void;
  /** Bluebook strikethrough tool */
  strikeMode?: boolean;
  onToggleStrikeMode?: () => void;
  eliminated?: Set<Letter>;
  onToggleEliminate?: (letter: Letter) => void;
  /** Student range highlights (runner) — marked exactly where selected. */
  highlights?: Highlight[];
  /** Remove the highlight covering `offset` in `field` (click-to-remove). */
  onRemoveHighlight?: (field: AnnotField, offset: number) => void;
  /** Review/answer-key mode: when set, marks the correct choice (mcq) or shows
   *  the canonical answer (grid). Purely additive — the runner never passes it. */
  correctAnswer?: string | null;
  /** Force the single-column stacked layout (passage over question) regardless
   *  of available width — a user toggle in Review/Preview. Default: auto
   *  (container-query) split when there's room. */
  forceStacked?: boolean;
  /** Review Mode: per-choice class response counts + names. When set, each mcq
   *  choice shows a clickable count pill (click → who chose it). */
  choiceStats?: ChoiceStats;
  /** Review Mode: per-choice rationale (which word is wrong + why). */
  rationale?: ChoiceRationale | null;
  /** When true, reveal the rationale under each choice (the "Explain" toggle). */
  showRationale?: boolean;
}

/**
 * Render `text` with the given character ranges wrapped in a clickable
 * highlight <mark>. Only the selected spans are marked (range-based, NOT
 * text-match) so a mock test never lights up other occurrences. A plain click
 * on a mark removes it; a drag-select that ends on a mark does not.
 */
function Figure({
  src,
  alt,
  variant,
}: {
  src: string;
  alt: string;
  variant: "stimulus" | "math";
}) {
  return (
    <img
      src={src}
      alt={alt}
      className={[
        "mx-auto block h-auto w-auto rounded-lg border border-slate-200 bg-white object-contain dark:border-slate-700",
        variant === "math" ? "max-h-[42vh] max-w-[460px]" : "max-h-[60vh] max-w-full",
      ].join(" ")}
    />
  );
}

function Stimulus({
  question,
  highlights,
  onRemoveHighlight,
}: {
  question: TestQuestion;
  highlights?: Highlight[];
  onRemoveHighlight?: (field: AnnotField, offset: number) => void;
}) {
  const isMath = question.section === "math";
  // Ivy: drop the inline Georgia override so the `font-passage` class
  // (Literata) takes effect. Classic keeps the inline serif verbatim.
  const serifStyle = useUiTheme() === "ivy" ? {} : SERIF;
  const passageRanges = (highlights ?? []).filter((h) => h.field === "passage");
  return (
    <div className="space-y-4">
      {question.figure && (
        <Figure
          src={question.figure}
          alt={question.passage_alt ?? "Figure for this question"}
          variant={isMath ? "math" : "stimulus"}
        />
      )}
      {question.passage && (
        // Set the source text apart from the question with a subtle card +
        // left accent rule. The block renderer handles prose vs. tables and
        // keeps the highlight character-offset model intact.
        <div className="rounded-xl border border-slate-200/80 border-l-2 border-l-slate-300 bg-slate-50/50 px-5 py-4 dark:border-slate-700/70 dark:border-l-slate-600 dark:bg-slate-800/20">
          <PassageBody
            passage={question.passage}
            ranges={passageRanges}
            serif={serifStyle}
            onRemoveHighlight={onRemoveHighlight}
          />
        </div>
      )}
    </div>
  );
}

function QHeader({
  number,
  marked,
  onToggleMark,
  strikeMode,
  onToggleStrikeMode,
  /** Display class for the number badge — lets the R&W fullHeight layout hide
   *  it (`hidden @[48rem]:grid`) when stacked, since the nav strip shows it. */
  numberClassName = "grid",
  /** Display class for the whole header row — lets review (no controls) hide
   *  the otherwise-empty header when stacked. */
  containerClassName = "flex",
}: {
  number: number;
  marked?: boolean;
  onToggleMark?: () => void;
  strikeMode?: boolean;
  onToggleStrikeMode?: () => void;
  numberClassName?: string;
  containerClassName?: string;
}) {
  return (
    <div className={`items-center justify-between gap-3 pb-2 ${containerClassName}`}>
      <div className="flex items-center gap-3">
        <span className={`h-6 min-w-6 place-items-center rounded bg-slate-800 px-1.5 text-sm font-bold text-white dark:bg-slate-200 dark:text-slate-900 ${numberClassName}`}>
          {number}
        </span>
        {onToggleMark && (
          <button
            type="button"
            onClick={onToggleMark}
            aria-pressed={marked}
            aria-label={`Mark question ${number} for review`}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-600 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill={marked ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
              className={marked ? "text-amber-500" : ""}
              aria-hidden
            >
              <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" />
            </svg>
            Mark for Review
          </button>
        )}
      </div>
      {onToggleStrikeMode && (
        <button
          type="button"
          onClick={onToggleStrikeMode}
          aria-pressed={strikeMode}
          aria-label="Cross out answer choices"
          title="Cross out answer choices"
          className={[
            "rounded-md border px-2 py-1 text-sm font-bold tracking-tight transition",
            strikeMode
              ? "border-runner-600 bg-runner-600 text-white dark:border-runner-400 dark:bg-runner-500"
              : "border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800",
          ].join(" ")}
        >
          <span className="line-through decoration-2">ABC</span>
        </button>
      )}
    </div>
  );
}

/**
 * Review Mode: a pill on a choice showing how many students picked it; click to
 * reveal their names in a small popover (closes on outside-click / Esc). Count
 * of 0 renders muted + non-interactive. The correct choice's pill is emerald.
 */
function ChoiceCountPill({
  count,
  names,
  isKey,
  letter,
}: {
  count: number;
  names: string[];
  isKey: boolean;
  letter: Letter;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        disabled={count === 0}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={
          count === 0
            ? `No students chose choice ${letter}`
            : `${count} student${count === 1 ? "" : "s"} chose choice ${letter} — show names`
        }
        title={count === 0 ? "No one chose this" : "Show who chose this"}
        className={[
          "inline-flex min-w-[2.75rem] items-center justify-center rounded-full px-2.5 py-2.5 text-sm font-semibold tabular-nums transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-indigo-500 sm:min-w-[2.25rem] sm:py-1",
          isKey
            ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-300 dark:ring-emerald-800"
            : count > 0
              ? "bg-slate-100 text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700"
              : "bg-transparent text-slate-300 ring-1 ring-slate-200 dark:text-slate-600 dark:ring-slate-800",
          count === 0 ? "cursor-default" : "cursor-pointer",
        ].join(" ")}
      >
        {count}
      </button>
      {open && count > 0 && (
        <div
          role="dialog"
          aria-label={`Students who chose choice ${letter}`}
          className="absolute right-0 top-full z-30 mt-1.5 max-h-60 w-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 text-left shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          <p className="px-1.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Chose {letter} · {count}
          </p>
          <ul className="space-y-0.5">
            {names.map((n, i) => (
              <li
                key={`${n}-${i}`}
                className="truncate rounded px-1.5 py-1 text-xs text-slate-700 dark:text-slate-200"
              >
                {n}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Render a choice's text with the "wrong" phrase highlighted in light red.
 *  Background-only (no padding/weight change) so toggling adds no layout shift.
 *  Falls back to plain rich text when the phrase isn't a literal substring. */
function HighlightedChoiceText({ text, wrong }: { text: string; wrong: string }) {
  // Don't split LaTeX ($…$) — slicing the delimiters would break KaTeX. Math
  // choices fall back to plain render; the reason beneath still explains.
  const idx = text.includes("$") ? -1 : text.toLowerCase().indexOf(wrong.toLowerCase());
  if (idx < 0) return <RichInline text={text} />;
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + wrong.length);
  const after = text.slice(idx + wrong.length);
  return (
    <>
      {before && <RichInline text={before} />}
      <mark className="rounded-sm bg-rose-200/70 text-rose-900 box-decoration-clone dark:bg-rose-500/40 dark:text-rose-50">
        {match}
      </mark>
      {after && <RichInline text={after} />}
    </>
  );
}

function Prompt({
  question,
  value,
  onChange,
  disabled,
  strikeMode,
  eliminated,
  onToggleEliminate,
  highlights,
  onRemoveHighlight,
  correctAnswer,
  choiceStats,
  rationale,
  showRationale,
}: Pick<
  QuestionPaneProps,
  "question" | "value" | "onChange" | "disabled" | "strikeMode" | "eliminated" | "onToggleEliminate" | "highlights" | "onRemoveHighlight" | "correctAnswer" | "choiceStats" | "rationale" | "showRationale"
>) {
  const rationaleEmpty =
    showRationale && (!rationale || Object.keys(rationale).length === 0);
  // Ivy: drop the inline Georgia override so `font-passage` (Literata) applies.
  const serifStyle = useUiTheme() === "ivy" ? {} : SERIF;
  // Track the mousedown point so a drag-select to highlight choice text doesn't
  // register as a click that toggles the answer (see the choice row onClick).
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  return (
    <div className="space-y-5">
      <p
        data-annot-field="stem"
        className="whitespace-pre-wrap font-passage text-[17px] font-medium leading-relaxed text-slate-900 dark:text-slate-100"
        style={serifStyle}
      >
        {renderText(
          question.stem,
          0,
          "stem",
          (highlights ?? []).filter((h) => h.field === "stem"),
          onRemoveHighlight,
        )}
      </p>

      {question.type === "mcq" && question.choices && (
        <>
          {rationaleEmpty && (
            <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
              No explanation has been added for this question yet.
            </p>
          )}
          <ul className="space-y-3">
            {LETTERS.map((letter) => {
              const text = question.choices![letter];
              if (text === undefined) return null;
              const selected = value === letter;
              const struck = eliminated?.has(letter) ?? false;
              const isKey = correctAnswer != null && correctAnswer === letter;
              // Review mode (correctAnswer set): every non-correct choice reads
              // as a light-red "wrong" option.
              const isWrong = correctAnswer != null && !isKey;
              const r = showRationale ? rationale?.[letter] : undefined;
              const wrong = isWrong ? r?.wrong : undefined;
              return (
                <li key={letter} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    {/* A <div role=button> (not a real <button>) so the choice
                        text inside stays selectable — native button text can't
                        be highlighted. The drag-vs-click guard below keeps a
                        highlight drag from toggling the answer. */}
                    <div
                      role="button"
                      tabIndex={disabled || struck ? -1 : 0}
                      aria-pressed={selected}
                      aria-disabled={disabled || struck}
                      onMouseDown={(e) => { dragRef.current = { x: e.clientX, y: e.clientY }; }}
                      onClick={(e) => {
                        const d = dragRef.current; dragRef.current = null;
                        // A drag (text selection to highlight) must not toggle the answer.
                        if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return;
                        const sel = window.getSelection();
                        if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) return;
                        if (disabled || struck) return;
                        onChange(selected ? null : letter);
                      }}
                      onKeyDown={(e) => {
                        if ((e.key === "Enter" || e.key === " ") && !(disabled || struck)) {
                          e.preventDefault();
                          onChange(selected ? null : letter);
                        }
                      }}
                      className={[
                        "flex flex-1 items-center gap-3.5 rounded-xl border-2 px-4 py-3 text-left transition",
                        isKey
                          ? "border-emerald-500 bg-emerald-50/70 dark:border-emerald-500 dark:bg-emerald-950/30"
                          : isWrong
                            ? "border-rose-200 bg-rose-50/60 dark:border-rose-900/70 dark:bg-rose-950/20"
                            : selected && !struck
                              ? "border-runner-600 bg-runner-50/70 dark:border-runner-400 dark:bg-blue-950/30"
                              : "border-slate-300 bg-white hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600",
                        struck ? "opacity-50" : "",
                        disabled ? "cursor-default" : "",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 text-sm font-bold",
                          struck
                            ? "border-slate-400 text-slate-400 line-through dark:border-slate-600 dark:text-slate-500"
                            : isKey
                              ? "border-emerald-500 bg-emerald-500 text-white"
                              : isWrong
                                ? "border-rose-300 text-rose-500 dark:border-rose-800 dark:text-rose-400"
                                : selected
                                  ? "border-runner-600 bg-runner-600 text-white dark:border-runner-400 dark:bg-runner-400 dark:text-slate-900"
                                  : "border-slate-400 text-slate-700 dark:border-slate-500 dark:text-slate-300",
                        ].join(" ")}
                      >
                        {letter}
                      </span>
                      <span
                        data-annot-field={`choice:${letter}`}
                        className={[
                          "select-text font-passage text-[16px] leading-relaxed",
                          struck
                            ? "text-slate-400 line-through dark:text-slate-500"
                            : "text-slate-800 dark:text-slate-200",
                        ].join(" ")}
                        style={serifStyle}
                      >
                        {wrong ? (
                          <HighlightedChoiceText text={text} wrong={wrong} />
                        ) : (
                          renderText(
                            text,
                            0,
                            `choice:${letter}`,
                            (highlights ?? []).filter((h) => h.field === `choice:${letter}`),
                            onRemoveHighlight,
                          )
                        )}
                      </span>
                      {isKey && (
                        <span className="ml-auto inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
                          ✓ Correct
                        </span>
                      )}
                    </div>

                    {choiceStats && (
                      <ChoiceCountPill
                        letter={letter}
                        isKey={isKey}
                        count={choiceStats[letter]?.count ?? 0}
                        names={choiceStats[letter]?.names ?? []}
                      />
                    )}

                    {strikeMode && onToggleEliminate && !disabled && (
                      <button
                        type="button"
                        onClick={() => onToggleEliminate(letter)}
                        aria-pressed={struck}
                        aria-label={struck ? `Restore choice ${letter}` : `Cross out choice ${letter}`}
                        title={struck ? `Restore choice ${letter}` : `Cross out choice ${letter}`}
                        className={[
                          "grid h-9 w-9 shrink-0 place-items-center rounded-full border text-xs font-bold transition",
                          struck
                            ? "border-runner-600 text-runner-700 hover:bg-runner-50 dark:border-runner-400 dark:text-runner-300 dark:hover:bg-blue-950/40"
                            : "border-slate-300 text-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800",
                        ].join(" ")}
                      >
                        {struck ? (
                          "Undo"
                        ) : (
                          <span className="line-through decoration-2">{letter}</span>
                        )}
                      </button>
                    )}
                  </div>

                  {r?.reason && (
                    <p
                      className={[
                        "pl-10 pr-2 text-[13px] leading-snug",
                        isKey
                          ? "text-emerald-700 dark:text-emerald-300"
                          : "text-rose-700 dark:text-rose-300",
                      ].join(" ")}
                    >
                      {r.reason}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {question.type === "grid" && (
        <div className="space-y-2">
          <label
            htmlFor={`grid-${question.id}`}
            className="block text-sm font-medium text-slate-600 dark:text-slate-300"
          >
            Your answer
          </label>
          <input
            id={`grid-${question.id}`}
            type="text"
            inputMode="text"
            autoComplete="off"
            disabled={disabled}
            value={value ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              onChange(v.trim() === "" ? null : v);
            }}
            placeholder="e.g. 7, 3/5, or 4.75"
            className="w-48 rounded-lg border-2 border-slate-300 bg-white px-3.5 py-2.5 text-lg text-slate-900 shadow-sm focus:border-runner-600 focus:outline-none focus:ring-4 focus:ring-runner-500/15 disabled:opacity-90 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Student-produced response. Enter a number; fractions (3/5) and
            decimals (4.75) are accepted. Negative values are allowed.
          </p>
          {correctAnswer != null && (
            <p className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900">
              <span className="font-semibold">✓ Answer:</span> {correctAnswer}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function QuestionPane({
  question,
  value,
  onChange,
  disabled,
  fullHeight,
  marked,
  onToggleMark,
  strikeMode,
  onToggleStrikeMode,
  eliminated,
  onToggleEliminate,
  highlights,
  onRemoveHighlight,
  correctAnswer,
  forceStacked,
  choiceStats,
  rationale,
  showRationale,
}: QuestionPaneProps) {
  const isRW = question.section === "reading-writing";
  const hasStimulus = Boolean(question.passage || question.figure);
  const ivy = useUiTheme() === "ivy";

  const questionSide = (header?: { numberClassName?: string; containerClassName?: string }) => (
    <>
      <QHeader
        number={question.number}
        marked={marked}
        onToggleMark={onToggleMark}
        strikeMode={strikeMode}
        onToggleStrikeMode={question.type === "mcq" ? onToggleStrikeMode : undefined}
        numberClassName={header?.numberClassName}
        containerClassName={header?.containerClassName}
      />
      <div className="mt-5">
        <Prompt
          question={question}
          value={value}
          onChange={onChange}
          disabled={disabled}
          strikeMode={strikeMode}
          eliminated={eliminated}
          onToggleEliminate={onToggleEliminate}
          highlights={highlights}
          onRemoveHighlight={onRemoveHighlight}
          correctAnswer={correctAnswer}
          choiceStats={choiceStats}
          rationale={rationale}
          showRationale={showRationale}
        />
      </div>
    </>
  );

  // ── Runner mode ──────────────────────────────────────────────────────────
  if (fullHeight) {
    if (isRW && hasStimulus) {
      const numberBadge = (
        <span className="grid h-6 w-fit min-w-6 place-items-center rounded bg-slate-800 px-1.5 text-sm font-bold text-white dark:bg-slate-200 dark:text-slate-900">
          {question.number}
        </span>
      );

      // User-forced stacked: ONE wide single column (number → passage →
      // question). Spans ~95% of the width (centred) rather than a narrow
      // reading column — this mode is meant for PROJECTING to a class, so
      // visibility/size beats line-length. Single in-body number (atop passage).
      if (forceStacked) {
        return (
          <div className="h-full overflow-y-auto py-7">
            <div className="mx-auto w-[95%] space-y-5">
              <div>{numberBadge}</div>
              <Stimulus question={question} highlights={highlights} onRemoveHighlight={onRemoveHighlight} />
              <div className="pt-5">
                {questionSide({ numberClassName: "hidden", containerClassName: disabled ? "hidden" : "flex" })}
              </div>
            </div>
          </div>
        );
      }

      // Auto: a CONTAINER query (not the viewport) drives the split, so it
      // responds to the actual space the pane has — e.g. on the Review page the
      // class sidebar narrows this area, so it stacks rather than cramming two
      // columns. Narrow container: ONE scroll column, passage flowing into the
      // question below it. Wide (≥48rem): the Bluebook two-column split, each
      // pane scrolling independently.
      return (
        <div className="@container h-full">
          <div className="h-full overflow-y-auto @[48rem]:grid @[48rem]:grid-cols-2 @[48rem]:divide-x @[48rem]:divide-slate-200 @[48rem]:overflow-hidden dark:@[48rem]:divide-slate-800">
            <div className="px-6 py-7 @[48rem]:h-full @[48rem]:overflow-y-auto lg:px-10">
              {/* Number atop the passage — always shown so the passage is
                  labelled. Split also shows it above the choices; stacked drops
                  the in-column one (this is the single in-body number). */}
              {ivy ? (
                // Ivy: cap the reading measure for comfortable line lengths.
                <div className="mx-auto max-w-[38rem]">
                  <div className="mb-3">{numberBadge}</div>
                  <Stimulus question={question} highlights={highlights} onRemoveHighlight={onRemoveHighlight} />
                </div>
              ) : (
                <>
                  <div className="mb-3">{numberBadge}</div>
                  <Stimulus question={question} highlights={highlights} onRemoveHighlight={onRemoveHighlight} />
                </>
              )}
            </div>
            <div className="px-6 py-7 @[48rem]:h-full @[48rem]:overflow-y-auto lg:px-10">
              <div className="mx-auto max-w-xl">
                {questionSide({
                  numberClassName: "hidden @[48rem]:grid",
                  containerClassName: disabled ? "hidden @[48rem]:flex" : "flex",
                })}
              </div>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="h-full overflow-y-auto px-6 py-7">
        <div className="mx-auto max-w-2xl space-y-6">
          {question.figure && <Stimulus question={question} highlights={highlights} onRemoveHighlight={onRemoveHighlight} />}
          {questionSide()}
        </div>
      </div>
    );
  }

  // ── Review mode (stacked card) ───────────────────────────────────────────
  if (isRW && hasStimulus) {
    return (
      <div className="grid gap-6 md:grid-cols-2">
        <div className="md:border-r md:border-slate-200 md:pr-6 dark:md:border-slate-700">
          <Stimulus question={question} highlights={highlights} onRemoveHighlight={onRemoveHighlight} />
        </div>
        <div>{questionSide()}</div>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {question.figure && <Stimulus question={question} highlights={highlights} onRemoveHighlight={onRemoveHighlight} />}
      {questionSide()}
    </div>
  );
}
