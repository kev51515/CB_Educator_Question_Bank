/**
 * Runner annotations — Bluebook-style highlights + a per-question note,
 * persisted in localStorage for the attempt (keyed by test slug).
 *
 * Highlights are RANGE-based: a highlight is a [start, end) character span
 * within a specific field (the passage or the stem), so only the exact text
 * the student selected is marked — never other occurrences of the same words.
 * Overlapping highlights in the same field are merged on add; a click removes
 * the one under the cursor.
 */
import { useCallback } from "react";
import { useLocalStorageJSON } from "@/hooks";

export type ChoiceLetter = "A" | "B" | "C" | "D";
/** A highlightable region: the passage, the stem, or one answer choice. */
export type AnnotField = "passage" | "stem" | `choice:${ChoiceLetter}`;

/** The 5 highlighter colors offered in the runner's highlighter bar. */
export type HighlightColor = "yellow" | "green" | "blue" | "pink" | "orange";

export const HIGHLIGHT_COLORS: readonly HighlightColor[] = [
  "yellow",
  "green",
  "blue",
  "pink",
  "orange",
];

export const DEFAULT_HIGHLIGHT_COLOR: HighlightColor = "yellow";

/**
 * Per-color rendering. `mark` is a TRANSLUCENT fill applied inline on the
 * <mark> — it reads on both light and dark backgrounds (over `text-inherit`),
 * sidestepping Tailwind's class-based dark mode for dynamic colors. `swatch`
 * is the solid color for the highlighter-bar buttons.
 */
export const HIGHLIGHT_FILL: Record<HighlightColor, { mark: string; swatch: string }> = {
  yellow: { mark: "rgba(250,204,21,0.45)", swatch: "#facc15" },
  green: { mark: "rgba(34,197,94,0.40)", swatch: "#22c55e" },
  blue: { mark: "rgba(59,130,246,0.42)", swatch: "#3b82f6" },
  pink: { mark: "rgba(236,72,153,0.38)", swatch: "#ec4899" },
  orange: { mark: "rgba(249,115,22,0.42)", swatch: "#f97316" },
};

/** Human label for tooltips / replay. */
export const HIGHLIGHT_LABEL: Record<HighlightColor, string> = {
  yellow: "Yellow",
  green: "Green",
  blue: "Blue",
  pink: "Pink",
  orange: "Orange",
};

export interface Highlight {
  field: AnnotField;
  start: number;
  end: number;
  color: HighlightColor;
  /**
   * "underline" renders as a colored underline instead of a translucent fill
   * (teacher review tool). Absent = classic fill highlight.
   */
  deco?: "underline";
}

/** Coerce a possibly-colorless (legacy) highlight to a valid color. */
export function coerceColor(c: unknown): HighlightColor {
  return typeof c === "string" && (HIGHLIGHT_COLORS as readonly string[]).includes(c)
    ? (c as HighlightColor)
    : DEFAULT_HIGHLIGHT_COLOR;
}

export interface QAnnotation {
  highlights: Highlight[];
  note: string;
}

export type AnnotationStore = Record<string, QAnnotation>;

export const EMPTY_ANNOTATION: QAnnotation = { highlights: [], note: "" };
const EMPTY = EMPTY_ANNOTATION;

// --- pure range helpers ------------------------------------------------------

interface Range {
  start: number;
  end: number;
}

/** Merge overlapping/adjacent ranges into a sorted, non-overlapping list. */
export function mergeRanges(ranges: Range[]): Range[] {
  const sorted = ranges
    .filter((r) => r.end > r.start)
    .slice()
    .sort((a, b) => a.start - b.start);
  const out: Range[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ start: r.start, end: r.end });
  }
  return out;
}

/** Remove `cut` from `r`, returning the 0–2 remaining pieces. */
export function subtractRange(r: Range, cut: Range): Range[] {
  if (cut.end <= r.start || cut.start >= r.end) return [r]; // no overlap
  const out: Range[] = [];
  if (cut.start > r.start) out.push({ start: r.start, end: cut.start }); // left remainder
  if (cut.end < r.end) out.push({ start: cut.end, end: r.end }); // right remainder
  return out; // fully covered → []
}

/** Local character offset of (node, nodeOffset) within `el`'s text content. */
function localTextOffset(el: HTMLElement, node: Node, nodeOffset: number): number {
  if (node === el) {
    // Element-anchored selection: sum the text length of children before the index.
    let acc = 0;
    for (let i = 0; i < nodeOffset && i < el.childNodes.length; i++) {
      acc += el.childNodes[i].textContent?.length ?? 0;
    }
    return acc;
  }
  let offset = 0;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n = walker.nextNode();
  while (n) {
    if (n === node) return offset + nodeOffset;
    offset += n.textContent?.length ?? 0;
    n = walker.nextNode();
  }
  return offset;
}

/**
 * Absolute character offset of (node, nodeOffset) within the raw field text.
 *
 * Supports two render layouts:
 *  - Block layout (passage with tables, see passageRender): each prose block
 *    carries `data-annot-offset` (its absolute start in the raw passage); the
 *    offset is that base + the local text offset inside the block. Tables carry
 *    `data-annot-skip`; a selection inside one returns -1 (non-highlightable),
 *    because table cells intentionally drop the raw `|`/newline separators.
 *  - Flat layout (stem, or a single-block passage): walk the whole field.
 */
function offsetWithin(fieldEl: HTMLElement, node: Node, nodeOffset: number): number {
  const anchor =
    node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
  const skip = anchor?.closest("[data-annot-skip]");
  if (skip && fieldEl.contains(skip)) return -1;
  const block = anchor?.closest("[data-annot-offset]") as HTMLElement | null;
  if (block && fieldEl.contains(block)) {
    const base = Number(block.dataset.annotOffset ?? "0");
    return base + localTextOffset(block, node, nodeOffset);
  }
  return localTextOffset(fieldEl, node, nodeOffset);
}

function fieldElementOf(container: Node): HTMLElement | null {
  const el =
    container.nodeType === Node.TEXT_NODE
      ? container.parentElement
      : (container as Element);
  return (el?.closest("[data-annot-field]") as HTMLElement | null) ?? null;
}

const CHOICE_FIELD_RE = /^choice:[A-D]$/;
/** Is `f` a valid annotation field string? (passage | stem | choice:A..D) */
export function isAnnotField(f: string | null | undefined): f is AnnotField {
  return f === "passage" || f === "stem" || (typeof f === "string" && CHOICE_FIELD_RE.test(f));
}

/**
 * Read the current text selection and turn it into a Highlight, IFF it lies
 * entirely within one annotation field. Returns null otherwise (nothing
 * selected, collapsed, or spanning fields).
 */
export function captureSelectionHighlight(
  color: HighlightColor = DEFAULT_HIGHLIGHT_COLOR,
): Highlight | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  if ((sel.toString().trim().length ?? 0) < 1) return null;
  const range = sel.getRangeAt(0);

  const startField = fieldElementOf(range.startContainer);
  const endField = fieldElementOf(range.endContainer);
  if (!startField || startField !== endField) return null;

  const field = startField.getAttribute("data-annot-field");
  if (!isAnnotField(field)) return null;

  const start = offsetWithin(startField, range.startContainer, range.startOffset);
  const end = offsetWithin(startField, range.endContainer, range.endOffset);
  // -1 marks a selection anchored inside a non-highlightable block (e.g. a table).
  if (start < 0 || end < 0 || end <= start) return null;
  return { field, start, end, color };
}

/** Selected text of the current selection (for the replay event payload). */
export function currentSelectionText(): string {
  return window.getSelection()?.toString().trim().slice(0, 120) ?? "";
}

// --- pure store operations ----------------------------------------------------
// Shared by useRunnerAnnotations (localStorage) and the DB-backed teacher hook
// (teacherAnnotations.ts) so highlight merge semantics can never drift between
// the two. Each returns the SAME reference when nothing changed.

/** Add `hl`, trimming overlaps (newest wins) and merging same-(color,deco) spans. */
export function storeAddHighlight(
  prev: AnnotationStore,
  qid: string,
  hl: Highlight,
): AnnotationStore {
  const cur = prev[qid] ?? EMPTY;
  // 1. Newest mark wins on overlap: subtract the new span from every existing
  //    highlight in the SAME field (any color/deco), splitting them.
  const trimmed: Highlight[] = cur.highlights.flatMap((h) =>
    h.field !== hl.field
      ? [h]
      : subtractRange({ start: h.start, end: h.end }, { start: hl.start, end: hl.end }).map(
          (r): Highlight => ({ ...h, start: r.start, end: r.end }),
        ),
  );
  // 2. Merge the new range with same-field, same-(color,deco) ranges only.
  const sameKind = trimmed.filter(
    (h) => h.field === hl.field && h.color === hl.color && h.deco === hl.deco,
  );
  const otherKind = trimmed.filter(
    (h) => !(h.field === hl.field && h.color === hl.color && h.deco === hl.deco),
  );
  const merged = mergeRanges([...sameKind, hl]).map(
    (r): Highlight => ({ ...hl, start: r.start, end: r.end }),
  );
  return { ...prev, [qid]: { ...cur, highlights: [...otherKind, ...merged] } };
}

export function storeRemoveHighlightAt(
  prev: AnnotationStore,
  qid: string,
  field: AnnotField,
  offset: number,
): AnnotationStore {
  const cur = prev[qid];
  if (!cur) return prev;
  const next = cur.highlights.filter(
    (h) => !(h.field === field && offset >= h.start && offset < h.end),
  );
  if (next.length === cur.highlights.length) return prev;
  return { ...prev, [qid]: { ...cur, highlights: next } };
}

export function storeClearHighlights(prev: AnnotationStore, qid: string): AnnotationStore {
  const cur = prev[qid];
  if (!cur || cur.highlights.length === 0) return prev;
  return { ...prev, [qid]: { ...cur, highlights: [] } };
}

export function storeSetNote(
  prev: AnnotationStore,
  qid: string,
  note: string,
): AnnotationStore {
  const cur = prev[qid] ?? EMPTY;
  return { ...prev, [qid]: { ...cur, note } };
}

// --- hook --------------------------------------------------------------------

export interface UseRunnerAnnotations {
  get: (questionId: string) => QAnnotation;
  addHighlight: (questionId: string, hl: Highlight) => void;
  removeHighlightAt: (questionId: string, field: AnnotField, offset: number) => void;
  clearHighlights: (questionId: string) => void;
  setNote: (questionId: string, note: string) => void;
  /** Seed a question's annotations from the server ONLY if absent locally —
   *  local (the freshest crash-survivor on this device) wins, like answers. */
  seed: (questionId: string, a: QAnnotation) => void;
}

export function useRunnerAnnotations(slug: string): UseRunnerAnnotations {
  const [store, setStore] = useLocalStorageJSON<AnnotationStore>(
    `fulltest:annot:${slug}`,
    {},
  );

  const get = useCallback(
    (qid: string): QAnnotation => store[qid] ?? EMPTY,
    [store],
  );

  const addHighlight = useCallback(
    (qid: string, hl: Highlight): void => {
      setStore((prev) => storeAddHighlight(prev, qid, hl));
    },
    [setStore],
  );

  const removeHighlightAt = useCallback(
    (qid: string, field: AnnotField, offset: number): void => {
      setStore((prev) => storeRemoveHighlightAt(prev, qid, field, offset));
    },
    [setStore],
  );

  const clearHighlights = useCallback(
    (qid: string): void => {
      setStore((prev) => storeClearHighlights(prev, qid));
    },
    [setStore],
  );

  const setNote = useCallback(
    (qid: string, note: string): void => {
      setStore((prev) => storeSetNote(prev, qid, note));
    },
    [setStore],
  );

  const seed = useCallback(
    (qid: string, a: QAnnotation): void => {
      setStore((prev) =>
        prev[qid] !== undefined
          ? prev
          : {
              ...prev,
              [qid]: {
                // Coerce legacy (colorless) saved highlights to the default color.
                highlights: a.highlights.map((h) => ({ ...h, color: coerceColor(h.color) })),
                note: a.note,
              },
            },
      );
    },
    [setStore],
  );

  return { get, addHighlight, removeHighlightAt, clearHighlights, setNote, seed };
}
