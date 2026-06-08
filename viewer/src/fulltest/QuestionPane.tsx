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
import type { Letter, TestQuestion } from "./types";
import { mergeRanges, type AnnotField, type Highlight } from "./annotations";

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
}

/**
 * Render `text` with the given character ranges wrapped in a clickable
 * highlight <mark>. Only the selected spans are marked (range-based, NOT
 * text-match) so a mock test never lights up other occurrences. A plain click
 * on a mark removes it; a drag-select that ends on a mark does not.
 */
function renderField(
  text: string,
  field: AnnotField,
  ranges: Highlight[],
  onRemove?: (field: AnnotField, offset: number) => void,
): JSX.Element {
  const merged = mergeRanges(ranges.map((r) => ({ start: r.start, end: r.end })));
  if (merged.length === 0 || !text) return <>{text}</>;
  const out: JSX.Element[] = [];
  let pos = 0;
  merged.forEach((r, i) => {
    const s = Math.max(0, Math.min(r.start, text.length));
    const e = Math.max(s, Math.min(r.end, text.length));
    if (s > pos) out.push(<span key={`t${i}`}>{text.slice(pos, s)}</span>);
    out.push(
      <mark
        key={`m${i}`}
        onClick={() => {
          const sel = window.getSelection();
          if (!sel || sel.isCollapsed) onRemove?.(field, s);
        }}
        title="Click to remove highlight"
        // Background-only highlight: NO padding/margin so adding or removing it
        // never changes text width → no reflow/re-wrap (layout-shift-free).
        // box-decoration-clone keeps the rounded background tidy across line
        // breaks (paint-only). See the highlight layout-shift audit (2026-06-08).
        className="cursor-pointer rounded-sm bg-amber-200/70 text-inherit box-decoration-clone dark:bg-amber-300/40 dark:text-inherit"
      >
        {text.slice(s, e)}
      </mark>,
    );
    pos = e;
  });
  if (pos < text.length) out.push(<span key="tail">{text.slice(pos)}</span>);
  return <>{out}</>;
}

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
        <p
          data-annot-field="passage"
          className="whitespace-pre-wrap text-[17px] leading-relaxed text-slate-800 dark:text-slate-200"
          style={SERIF}
        >
          {renderField(question.passage, "passage", passageRanges, onRemoveHighlight)}
        </p>
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
}: {
  number: number;
  marked?: boolean;
  onToggleMark?: () => void;
  strikeMode?: boolean;
  onToggleStrikeMode?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-2 dark:border-slate-700">
      <div className="flex items-center gap-3">
        <span className="grid h-6 min-w-6 place-items-center rounded bg-slate-800 px-1.5 text-sm font-bold text-white dark:bg-slate-200 dark:text-slate-900">
          {number}
        </span>
        {onToggleMark && (
          <button
            type="button"
            onClick={onToggleMark}
            aria-pressed={marked}
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
              ? "border-blue-600 bg-blue-600 text-white dark:border-blue-400 dark:bg-blue-500"
              : "border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800",
          ].join(" ")}
        >
          <span className="line-through decoration-2">ABC</span>
        </button>
      )}
    </div>
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
}: Pick<
  QuestionPaneProps,
  "question" | "value" | "onChange" | "disabled" | "strikeMode" | "eliminated" | "onToggleEliminate" | "highlights" | "onRemoveHighlight" | "correctAnswer"
>) {
  return (
    <div className="space-y-5">
      <p
        data-annot-field="stem"
        className="whitespace-pre-wrap text-[17px] font-medium leading-relaxed text-slate-900 dark:text-slate-100"
        style={SERIF}
      >
        {renderField(
          question.stem,
          "stem",
          (highlights ?? []).filter((h) => h.field === "stem"),
          onRemoveHighlight,
        )}
      </p>

      {question.type === "mcq" && question.choices && (
        <ul className="space-y-3">
          {LETTERS.map((letter) => {
            const text = question.choices![letter];
            if (text === undefined) return null;
            const selected = value === letter;
            const struck = eliminated?.has(letter) ?? false;
            const isKey = correctAnswer != null && correctAnswer === letter;
            return (
              <li key={letter} className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={disabled || struck}
                  onClick={() => onChange(selected ? null : letter)}
                  className={[
                    "flex flex-1 items-center gap-3.5 rounded-xl border-2 px-4 py-3 text-left transition",
                    isKey
                      ? "border-emerald-500 bg-emerald-50/70 dark:border-emerald-500 dark:bg-emerald-950/30"
                      : selected && !struck
                        ? "border-blue-600 bg-blue-50/70 dark:border-blue-400 dark:bg-blue-950/30"
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
                          : selected
                            ? "border-blue-600 bg-blue-600 text-white dark:border-blue-400 dark:bg-blue-400 dark:text-slate-900"
                            : "border-slate-400 text-slate-700 dark:border-slate-500 dark:text-slate-300",
                    ].join(" ")}
                  >
                    {letter}
                  </span>
                  <span
                    className={[
                      "text-[16px] leading-relaxed",
                      struck
                        ? "text-slate-400 line-through dark:text-slate-500"
                        : "text-slate-800 dark:text-slate-200",
                    ].join(" ")}
                    style={SERIF}
                  >
                    {text}
                  </span>
                  {isKey && (
                    <span className="ml-auto inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
                      ✓ Correct
                    </span>
                  )}
                </button>

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
                        ? "border-blue-600 text-blue-700 hover:bg-blue-50 dark:border-blue-400 dark:text-blue-300 dark:hover:bg-blue-950/40"
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
              </li>
            );
          })}
        </ul>
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
            className="w-48 rounded-lg border-2 border-slate-300 bg-white px-3.5 py-2.5 text-lg text-slate-900 shadow-sm focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-500/15 disabled:opacity-90 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
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
}: QuestionPaneProps) {
  const isRW = question.section === "reading-writing";
  const hasStimulus = Boolean(question.passage || question.figure);

  const questionSide = (
    <>
      <QHeader
        number={question.number}
        marked={marked}
        onToggleMark={onToggleMark}
        strikeMode={strikeMode}
        onToggleStrikeMode={question.type === "mcq" ? onToggleStrikeMode : undefined}
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
        />
      </div>
    </>
  );

  // ── Runner mode ──────────────────────────────────────────────────────────
  if (fullHeight) {
    if (isRW && hasStimulus) {
      // The split is driven by a CONTAINER query, not the viewport, so it
      // responds to the actual space the pane has — e.g. on the Review page the
      // class sidebar narrows this area, and we stack rather than cram two
      // columns. Narrow container: ONE scroll column, passage flowing into the
      // question+choices below it. Wide container (≥48rem): the Bluebook
      // two-column split with each pane scrolling independently.
      return (
        <div className="@container h-full">
          <div className="h-full overflow-y-auto @[48rem]:grid @[48rem]:grid-cols-2 @[48rem]:divide-x @[48rem]:divide-slate-200 @[48rem]:overflow-hidden dark:@[48rem]:divide-slate-800">
            <div className="border-b border-slate-200 px-6 py-7 @[48rem]:h-full @[48rem]:overflow-y-auto @[48rem]:border-b-0 lg:px-10 dark:border-slate-800">
              {/* Question number echoed atop the passage — only in the two-column
                  split. When stacked, the question header's number sits right
                  below the passage, so a second badge would be redundant. */}
              <div className="mb-3 hidden @[48rem]:block">
                <span className="grid h-6 w-fit min-w-6 place-items-center rounded bg-slate-800 px-1.5 text-sm font-bold text-white dark:bg-slate-200 dark:text-slate-900">
                  {question.number}
                </span>
              </div>
              <Stimulus question={question} highlights={highlights} onRemoveHighlight={onRemoveHighlight} />
            </div>
            <div className="px-6 py-7 @[48rem]:h-full @[48rem]:overflow-y-auto lg:px-10">
              <div className="mx-auto max-w-xl">{questionSide}</div>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="h-full overflow-y-auto px-6 py-7">
        <div className="mx-auto max-w-2xl space-y-6">
          {question.figure && <Stimulus question={question} highlights={highlights} onRemoveHighlight={onRemoveHighlight} />}
          {questionSide}
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
        <div>{questionSide}</div>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {question.figure && <Stimulus question={question} highlights={highlights} onRemoveHighlight={onRemoveHighlight} />}
      {questionSide}
    </div>
  );
}
