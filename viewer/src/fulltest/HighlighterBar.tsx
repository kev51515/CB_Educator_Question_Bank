/**
 * HighlighterBar
 * ==============
 * Bluebook-style multi-color highlighter control for the full-test runner.
 *
 * UX: click a color swatch → that color becomes active and the passage/stem
 * cursor turns into a highlighter tip → drag over text to paint it. Clicking
 * the active swatch again turns the highlighter off. Click an existing mark to
 * remove it (handled in passageRender). "Clear" wipes the current question's
 * highlights.
 *
 * Surface-coupled to the runner — lives in fulltest/, imported directly.
 */
import {
  HIGHLIGHT_COLORS,
  HIGHLIGHT_FILL,
  HIGHLIGHT_LABEL,
  type HighlightColor,
} from "./annotations";

export interface HighlighterBarProps {
  /** Active highlighter color, or null when the highlighter is off. */
  active: HighlightColor | null;
  /** Toggle a color: picking the active color again turns the highlighter off. */
  onPick: (color: HighlightColor) => void;
  /** Clear all highlights on the current question. */
  onClear: () => void;
  /** Highlight count on the current question (drives the Clear label). */
  count: number;
}

/** A CSS cursor string — a highlighter-tip glyph tinted with `color`. */
export function highlighterCursor(color: HighlightColor): string {
  const fill = HIGHLIGHT_FILL[color].swatch;
  // 24×24 highlighter glyph; hotspot at the tip (bottom-left).
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${fill}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 11-6 6v3h3l6-6"/><path d="M22 6 18 2l-7 7 4 4 7-7Z" fill="${fill}" fill-opacity="0.5"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 2 22, crosshair`;
}

function HighlighterIcon(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m9 11-6 6v3h3l6-6M22 6 18 2l-7 7 4 4 7-7Z" />
    </svg>
  );
}

export function HighlighterBar({ active, onPick, onClear, count }: HighlighterBarProps): JSX.Element {
  return (
    <div className="flex items-center gap-1.5">
      <span
        aria-hidden
        title="Pick a color, then drag over the passage or question to highlight. Click a highlight to remove it."
        className={`mr-0.5 flex items-center gap-1 text-slate-500 dark:text-slate-400 ${
          active ? "text-amber-600 dark:text-amber-300" : ""
        }`}
      >
        <HighlighterIcon />
      </span>
      <div role="group" aria-label="Highlighter colors" className="flex items-center gap-1">
        {HIGHLIGHT_COLORS.map((c) => {
          const isActive = active === c;
          return (
            <button
              key={c}
              type="button"
              // Keep the text selection alive — a plain click would collapse it.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(c)}
              aria-pressed={isActive}
              aria-label={`${HIGHLIGHT_LABEL[c]} highlighter${isActive ? " (active)" : ""}`}
              title={`${HIGHLIGHT_LABEL[c]} highlighter`}
              style={{ backgroundColor: HIGHLIGHT_FILL[c].swatch }}
              className={[
                "h-5 w-5 rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 dark:focus-visible:ring-white",
                isActive
                  ? "ring-2 ring-offset-2 ring-slate-900 dark:ring-white dark:ring-offset-slate-900 scale-110"
                  : "ring-1 ring-black/10 hover:scale-110",
              ].join(" ")}
            />
          );
        })}
      </div>
      {active && (
        <span className="ml-1 hidden text-[11px] text-slate-500 dark:text-slate-400 sm:inline">
          Drag over text to highlight
        </span>
      )}
      {/* Always mounted (invisible when empty) so the first highlight doesn't
          shift the toolbar — no layout shift. */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClear}
        aria-hidden={count === 0}
        tabIndex={count === 0 ? -1 : 0}
        className={[
          "ml-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800",
          count > 0 ? "" : "invisible pointer-events-none",
        ].join(" ")}
      >
        Clear ({count})
      </button>
    </div>
  );
}

export default HighlighterBar;
