/**
 * SelectionPopover — floating highlight palette that appears over an active
 * text selection inside an annotatable field (passage / stem / choices).
 *
 * This is the fix for "highlighting doesn't work": before, painting required
 * arming a color in the HighlighterBar FIRST — plain select-then-wait did
 * nothing, and touch devices (no reliable mouseup around selection handles)
 * couldn't paint at all. The popover watches `selectionchange` (debounced so
 * it doesn't flicker while handles are being dragged), so it works for mouse,
 * touch, and keyboard selection alike: select text → tap a color.
 *
 * Mounted by both the student runner (FullTestApp) and the teacher review
 * page. The parent owns capture: `onPick` fires with the chosen color (and
 * optional underline deco on the teacher surface); the parent calls
 * captureSelectionHighlight + stores + clears the selection, which hides the
 * popover on the next selectionchange.
 */
import { useEffect, useRef, useState } from "react";
import {
  HIGHLIGHT_COLORS,
  HIGHLIGHT_FILL,
  HIGHLIGHT_LABEL,
  isAnnotField,
  type HighlightColor,
} from "./annotations";

const SHOW_DEBOUNCE_MS = 350;
/** Underline tool ink — blue reads as classic annotation ink over any fill. */
const UNDERLINE_COLOR: HighlightColor = "blue";

export interface SelectionPopoverProps {
  enabled: boolean;
  /** Offer the underline tool (teacher review suite). */
  includeUnderline?: boolean;
  onPick: (color: HighlightColor, deco?: "underline") => void;
}

interface Anchor {
  top: number;
  left: number;
}

/** The selection's bounding rect IFF it sits inside one annotatable field. */
function annotatableSelectionRect(): DOMRect | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  if (sel.toString().trim().length < 1) return null;
  const range = sel.getRangeAt(0);
  const elOf = (n: Node): Element | null =>
    n.nodeType === Node.TEXT_NODE ? n.parentElement : (n as Element);
  const startField = elOf(range.startContainer)?.closest("[data-annot-field]");
  const endField = elOf(range.endContainer)?.closest("[data-annot-field]");
  if (!startField || startField !== endField) return null;
  if (!isAnnotField(startField.getAttribute("data-annot-field"))) return null;
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return rect;
}

export function SelectionPopover({ enabled, includeUnderline = false, onPick }: SelectionPopoverProps) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!enabled) {
      setAnchor(null);
      return;
    }
    const onSelectionChange = () => {
      window.clearTimeout(timerRef.current);
      // Hide instantly while the selection is in motion; (re)show after it
      // settles so the palette doesn't chase the drag.
      setAnchor(null);
      timerRef.current = window.setTimeout(() => {
        const rect = annotatableSelectionRect();
        if (!rect) return;
        setAnchor({
          top: Math.max(8, rect.top - 44),
          left: Math.min(Math.max(8, rect.left + rect.width / 2), window.innerWidth - 8),
        });
      }, SHOW_DEBOUNCE_MS);
    };
    // Scrolling under a fixed-position palette would detach it from the text;
    // hide and let the next settled selection re-anchor.
    const onScroll = () => setAnchor(null);
    document.addEventListener("selectionchange", onSelectionChange);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.clearTimeout(timerRef.current);
      document.removeEventListener("selectionchange", onSelectionChange);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [enabled]);

  if (!enabled || !anchor) return null;

  return (
    <div
      role="toolbar"
      aria-label="Highlight selection"
      // preventDefault on pointerdown so tapping a swatch doesn't collapse
      // the selection before the click handler reads it.
      onPointerDown={(e) => e.preventDefault()}
      className="fixed z-[60] -translate-x-1/2 flex items-center gap-1 rounded-full bg-white dark:bg-slate-900 px-2 py-1.5 shadow-lg ring-1 ring-slate-200 dark:ring-slate-700"
      style={{ top: anchor.top, left: anchor.left }}
    >
      {HIGHLIGHT_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          title={`Highlight ${HIGHLIGHT_LABEL[c].toLowerCase()}`}
          aria-label={`Highlight ${HIGHLIGHT_LABEL[c].toLowerCase()}`}
          onClick={() => {
            setAnchor(null);
            onPick(c);
          }}
          className="h-6 w-6 rounded-full ring-1 ring-black/10 hover:scale-110 motion-safe:transition-transform"
          style={{ backgroundColor: HIGHLIGHT_FILL[c].swatch }}
        />
      ))}
      {includeUnderline && (
        <>
          <span className="mx-0.5 h-4 w-px bg-slate-200 dark:bg-slate-700" aria-hidden />
          <button
            type="button"
            title="Underline"
            aria-label="Underline selection"
            onClick={() => {
              setAnchor(null);
              onPick(UNDERLINE_COLOR, "underline");
            }}
            className="h-6 w-6 rounded-full text-sm font-semibold leading-none text-blue-600 dark:text-blue-400 underline decoration-2 underline-offset-2 hover:scale-110 motion-safe:transition-transform"
          >
            U
          </button>
        </>
      )}
    </div>
  );
}
