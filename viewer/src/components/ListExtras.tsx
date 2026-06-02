import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";

/* ------------------------------------------------------------------ */
/*  CompactToggle                                                      */
/* ------------------------------------------------------------------ */

interface CompactToggleProps {
  compact: boolean;
  onToggle: () => void;
}

export function CompactToggle({ compact, onToggle }: CompactToggleProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label="Toggle compact mode"
      data-tooltip="Toggle compact mode"
      className="w-6 h-6 rounded inline-flex items-center justify-center text-ink-500 hover:bg-ink-100 transition-colors focus-ring"
    >
      {compact ? (
        /* Four dense horizontal lines — compact */
        <svg
          viewBox="0 0 16 16"
          className="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          aria-hidden
        >
          <line x1="2" y1="3" x2="14" y2="3" />
          <line x1="2" y1="6.33" x2="14" y2="6.33" />
          <line x1="2" y1="9.66" x2="14" y2="9.66" />
          <line x1="2" y1="13" x2="14" y2="13" />
        </svg>
      ) : (
        /* Three lines with dots — comfortable (list view) */
        <svg
          viewBox="0 0 16 16"
          className="w-3.5 h-3.5"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          aria-hidden
        >
          <circle cx="3" cy="4" r="1" stroke="none" />
          <line x1="6" y1="4" x2="14" y2="4" fill="none" />
          <circle cx="3" cy="8" r="1" stroke="none" />
          <line x1="6" y1="8" x2="14" y2="8" fill="none" />
          <circle cx="3" cy="12" r="1" stroke="none" />
          <line x1="6" y1="12" x2="14" y2="12" fill="none" />
        </svg>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  QuestionPreviewTooltip                                             */
/* ------------------------------------------------------------------ */

interface PreviewEntry {
  number?: number;
  difficulty: string;
  domain: string;
  skill: string;
  preview?: string;
  type: string;
}

export interface QuestionPreviewTooltipProps {
  entry: PreviewEntry;
  visible: boolean;
  position: { x: number; y: number };
}

function difficultyTextColor(d: string): string {
  switch (d) {
    case "Easy":
      return "text-emerald-600";
    case "Medium":
      return "text-amber-600";
    case "Hard":
      return "text-rose-600";
    default:
      return "text-ink-500";
  }
}

export function QuestionPreviewTooltip({
  entry,
  visible,
  position,
}: QuestionPreviewTooltipProps): JSX.Element | null {
  if (!visible) return null;

  const previewText =
    entry.preview && entry.preview.length > 200
      ? entry.preview.slice(0, 200) + "…"
      : entry.preview;

  return createPortal(
    <div
      role="tooltip"
      className="fixed bg-white dark:bg-ink-800 border border-ink-200 rounded-xl shadow-modal p-3 text-[12px] max-w-xs z-30 pointer-events-none"
      style={{
        left: position.x,
        top: position.y,
        transform: "translateX(-50%)",
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        {entry.number != null && (
          <span className="font-semibold text-ink-800 tabular-nums">
            <span className="text-ink-400 font-medium">#</span>
            {entry.number}
          </span>
        )}
        <span className={`font-medium ${difficultyTextColor(entry.difficulty)}`}>
          {entry.difficulty}
        </span>
        {entry.type === "spr" && (
          <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-ink-400 px-1 py-px rounded bg-ink-100">
            SPR
          </span>
        )}
      </div>
      <div className="text-ink-500 text-[11px] mb-1.5">
        {entry.domain}
        <span className="mx-1 text-ink-300">&middot;</span>
        {entry.skill}
      </div>
      {previewText && (
        <p className="text-ink-700 leading-snug">{previewText}</p>
      )}
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/*  useHoverPreview                                                    */
/* ------------------------------------------------------------------ */

const EMPTY_ENTRY: PreviewEntry = {
  difficulty: "",
  domain: "",
  skill: "",
  type: "",
};

export function useHoverPreview(delay = 400): {
  show: (entry: PreviewEntry, rect: DOMRect) => void;
  hide: () => void;
  props: QuestionPreviewTooltipProps;
} {
  const [state, setState] = useState<QuestionPreviewTooltipProps>({
    entry: EMPTY_ENTRY,
    visible: false,
    position: { x: 0, y: 0 },
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setState((prev) => (prev.visible ? { ...prev, visible: false } : prev));
  }, []);

  const show = useCallback(
    (entry: PreviewEntry, rect: DOMRect) => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const x = Math.max(
          160,
          Math.min(rect.left + rect.width / 2, window.innerWidth - 160),
        );
        const y = Math.min(rect.bottom + 8, window.innerHeight - 120);
        setState({ entry, visible: true, position: { x, y } });
      }, delay);
    },
    [delay],
  );

  return { show, hide, props: state };
}
