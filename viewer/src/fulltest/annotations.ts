/**
 * Runner annotations — per-question highlights + a note, persisted in
 * localStorage for the attempt (Bluebook-style study tools). Keyed by test slug
 * so they don't bleed across tests; survive navigation, exit/resume, and reload.
 */
import { useCallback } from "react";
import { useLocalStorageJSON } from "../hooks";

export interface QAnnotation {
  /** Highlighted substrings of the passage/stem (all occurrences get marked). */
  highlights: string[];
  /** Free-text note the student jots for this question. */
  note: string;
}

type AnnotationStore = Record<string, QAnnotation>;

const EMPTY: QAnnotation = { highlights: [], note: "" };

export interface UseRunnerAnnotations {
  get: (questionId: string) => QAnnotation;
  addHighlight: (questionId: string, text: string) => void;
  clearHighlights: (questionId: string) => void;
  setNote: (questionId: string, note: string) => void;
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
    (qid: string, text: string): void => {
      const t = text.replace(/\s+/g, " ").trim();
      if (t.length < 2) return; // ignore trivial / accidental selections
      setStore((prev) => {
        const cur = prev[qid] ?? EMPTY;
        if (cur.highlights.includes(t)) return prev;
        return { ...prev, [qid]: { ...cur, highlights: [...cur.highlights, t] } };
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

  return { get, addHighlight, clearHighlights, setNote };
}
