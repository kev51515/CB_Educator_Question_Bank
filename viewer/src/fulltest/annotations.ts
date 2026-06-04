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

export type AnnotField = "passage" | "stem";

export interface Highlight {
  field: AnnotField;
  start: number;
  end: number;
}

export interface QAnnotation {
  highlights: Highlight[];
  note: string;
}

type AnnotationStore = Record<string, QAnnotation>;

const EMPTY: QAnnotation = { highlights: [], note: "" };

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

/** Character offset of (node, nodeOffset) within `fieldEl`'s text content. */
function offsetWithin(fieldEl: HTMLElement, node: Node, nodeOffset: number): number {
  if (node === fieldEl) {
    // Element-anchored selection: sum the text length of children before the index.
    let acc = 0;
    for (let i = 0; i < nodeOffset && i < fieldEl.childNodes.length; i++) {
      acc += fieldEl.childNodes[i].textContent?.length ?? 0;
    }
    return acc;
  }
  let offset = 0;
  const walker = document.createTreeWalker(fieldEl, NodeFilter.SHOW_TEXT);
  let n = walker.nextNode();
  while (n) {
    if (n === node) return offset + nodeOffset;
    offset += n.textContent?.length ?? 0;
    n = walker.nextNode();
  }
  return offset;
}

function fieldElementOf(container: Node): HTMLElement | null {
  const el =
    container.nodeType === Node.TEXT_NODE
      ? container.parentElement
      : (container as Element);
  return (el?.closest("[data-annot-field]") as HTMLElement | null) ?? null;
}

/**
 * Read the current text selection and turn it into a Highlight, IFF it lies
 * entirely within one annotation field. Returns null otherwise (nothing
 * selected, collapsed, or spanning fields).
 */
export function captureSelectionHighlight(): Highlight | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  if ((sel.toString().trim().length ?? 0) < 1) return null;
  const range = sel.getRangeAt(0);

  const startField = fieldElementOf(range.startContainer);
  const endField = fieldElementOf(range.endContainer);
  if (!startField || startField !== endField) return null;

  const field = startField.getAttribute("data-annot-field");
  if (field !== "passage" && field !== "stem") return null;

  const start = offsetWithin(startField, range.startContainer, range.startOffset);
  const end = offsetWithin(startField, range.endContainer, range.endOffset);
  if (end <= start) return null;
  return { field, start, end };
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
      setStore((prev) => {
        const cur = prev[qid] ?? EMPTY;
        const others = cur.highlights.filter((h) => h.field !== hl.field);
        const sameField = cur.highlights.filter((h) => h.field === hl.field);
        const merged = mergeRanges([...sameField, hl]).map(
          (r): Highlight => ({ field: hl.field, start: r.start, end: r.end }),
        );
        return { ...prev, [qid]: { ...cur, highlights: [...others, ...merged] } };
      });
    },
    [setStore],
  );

  const removeHighlightAt = useCallback(
    (qid: string, field: AnnotField, offset: number): void => {
      setStore((prev) => {
        const cur = prev[qid];
        if (!cur) return prev;
        const next = cur.highlights.filter(
          (h) => !(h.field === field && offset >= h.start && offset < h.end),
        );
        if (next.length === cur.highlights.length) return prev;
        return { ...prev, [qid]: { ...cur, highlights: next } };
      });
    },
    [setStore],
  );

  const clearHighlights = useCallback(
    (qid: string): void => {
      setStore((prev) => {
        const cur = prev[qid];
        if (!cur || cur.highlights.length === 0) return prev;
        return { ...prev, [qid]: { ...cur, highlights: [] } };
      });
    },
    [setStore],
  );

  const setNote = useCallback(
    (qid: string, note: string): void => {
      setStore((prev) => {
        const cur = prev[qid] ?? EMPTY;
        return { ...prev, [qid]: { ...cur, note } };
      });
    },
    [setStore],
  );

  const seed = useCallback(
    (qid: string, a: QAnnotation): void => {
      setStore((prev) =>
        prev[qid] !== undefined
          ? prev
          : { ...prev, [qid]: { highlights: a.highlights, note: a.note } },
      );
    },
    [setStore],
  );

  return { get, addHighlight, removeHighlightAt, clearHighlights, setNote, seed };
}
