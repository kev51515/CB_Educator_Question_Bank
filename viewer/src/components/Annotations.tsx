/* Annotation colors — add to index.css:
.annotation-yellow { background: rgba(251, 191, 36, 0.3); border-radius: 2px; }
.annotation-green { background: rgba(52, 211, 153, 0.3); border-radius: 2px; }
.annotation-blue { background: rgba(96, 165, 250, 0.3); border-radius: 2px; }
.annotation-pink { background: rgba(244, 114, 182, 0.3); border-radius: 2px; }
*/

import { useCallback, useEffect, useState } from "react";

// ─────────────────────────────── types ───────────────────────────────

export interface Annotation {
  id: string;
  questionId: string;
  color: "yellow" | "green" | "blue" | "pink";
  text: string;
  startOffset: number;
  endOffset: number;
}

type AnnotationStore = Record<string, Annotation[]>;

// ─────────────────────────────── helpers ─────────────────────────────

function randomId(): string {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function readStore(key: string): AnnotationStore {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as AnnotationStore;
    }
    return {};
  } catch {
    return {};
  }
}

function writeStore(key: string, store: AnnotationStore): void {
  try {
    localStorage.setItem(key, JSON.stringify(store));
  } catch {
    /* quota or disabled — non-fatal */
  }
}

// ─────────────────────────── useAnnotations ──────────────────────────

export function useAnnotations(storageKey: string): {
  get: (questionId: string) => Annotation[];
  add: (questionId: string, annotation: Omit<Annotation, "id">) => void;
  remove: (questionId: string, annotationId: string) => void;
  clear: (questionId: string) => void;
  count: (questionId: string) => number;
} {
  const [store, setStore] = useState<AnnotationStore>(() => readStore(storageKey));

  // Persist on change
  useEffect(() => {
    writeStore(storageKey, store);
  }, [storageKey, store]);

  // Sync across tabs
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== storageKey) return;
      try {
        const next = e.newValue ? JSON.parse(e.newValue) : {};
        setStore(typeof next === "object" && next && !Array.isArray(next) ? next : {});
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [storageKey]);

  const get = useCallback(
    (questionId: string): Annotation[] => store[questionId] ?? [],
    [store],
  );

  const add = useCallback(
    (questionId: string, annotation: Omit<Annotation, "id">) => {
      setStore((prev) => {
        const list = [...(prev[questionId] ?? [])];
        list.push({ ...annotation, id: randomId() });
        return { ...prev, [questionId]: list };
      });
    },
    [],
  );

  const remove = useCallback(
    (questionId: string, annotationId: string) => {
      setStore((prev) => {
        const list = (prev[questionId] ?? []).filter((a) => a.id !== annotationId);
        const next = { ...prev };
        if (list.length > 0) {
          next[questionId] = list;
        } else {
          delete next[questionId];
        }
        return next;
      });
    },
    [],
  );

  const clear = useCallback(
    (questionId: string) => {
      setStore((prev) => {
        const next = { ...prev };
        delete next[questionId];
        return next;
      });
    },
    [],
  );

  const count = useCallback(
    (questionId: string): number => (store[questionId] ?? []).length,
    [store],
  );

  return { get, add, remove, clear, count };
}

// ──────────────────────── AnnotationToolbar ──────────────────────────

interface AnnotationToolbarProps {
  questionId: string;
  annotations: Annotation[];
  activeColor: Annotation["color"];
  onColorChange: (color: Annotation["color"]) => void;
  onCaptureSelection: () => void;
  onRemove: (annotationId: string) => void;
  onClearAll: () => void;
}

const COLORS: { value: Annotation["color"]; bg: string; ring: string }[] = [
  { value: "yellow", bg: "bg-amber-200", ring: "ring-amber-400" },
  { value: "green", bg: "bg-emerald-200", ring: "ring-emerald-400" },
  { value: "blue", bg: "bg-accent-200", ring: "ring-accent-400" },
  { value: "pink", bg: "bg-pink-200", ring: "ring-pink-400" },
];

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "…";
}

export function AnnotationToolbar({
  questionId: _questionId,
  annotations,
  activeColor,
  onColorChange,
  onCaptureSelection,
  onRemove,
  onClearAll,
}: AnnotationToolbarProps): JSX.Element {
  void _questionId; // included for future use; no-op to satisfy noUnusedParameters
  const hasSelection =
    typeof window !== "undefined" &&
    (window.getSelection()?.toString().trim().length ?? 0) > 0;

  // We re-render on selectionchange so the button enable/disable stays fresh.
  const [, setTick] = useState(0);
  useEffect(() => {
    const handler = () => setTick((t) => t + 1);
    document.addEventListener("selectionchange", handler);
    return () => document.removeEventListener("selectionchange", handler);
  }, []);

  return (
    <div className="mt-2 mb-4 print:hidden">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Color swatches */}
        <div className="flex items-center gap-1.5">
          {COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => onColorChange(c.value)}
              title={`${c.value} highlight`}
              aria-label={`${c.value} highlight`}
              aria-pressed={activeColor === c.value}
              className={
                "w-3 h-3 rounded-full transition-shadow " +
                c.bg +
                (activeColor === c.value ? ` ring-2 ${c.ring} ring-offset-1` : "")
              }
            />
          ))}
        </div>

        {/* Capture button */}
        <button
          type="button"
          onClick={onCaptureSelection}
          disabled={!hasSelection}
          className="px-2.5 py-1 text-[11px] font-medium rounded-md border border-ink-200 text-ink-700 hover:bg-ink-50 hover:border-ink-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-ring"
        >
          Highlight selection
        </button>

        {/* Clear all */}
        {annotations.length > 0 && (
          <button
            type="button"
            onClick={onClearAll}
            className="text-[11px] text-ink-500 hover:text-red-600 transition-colors ml-1"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Annotation list */}
      {annotations.length > 0 && (
        <ul className="mt-2 space-y-1">
          {annotations.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-2 text-[11px] text-ink-600 leading-snug"
            >
              <span
                className={
                  "w-2 h-2 rounded-full shrink-0 " +
                  (COLORS.find((c) => c.value === a.color)?.bg ?? "bg-ink-200")
                }
                aria-hidden
              />
              <span className="truncate min-w-0">{truncate(a.text, 30)}</span>
              <button
                type="button"
                onClick={() => onRemove(a.id)}
                className="shrink-0 text-ink-400 hover:text-red-600 transition-colors"
                title="Remove highlight"
                aria-label={`Remove highlight: ${truncate(a.text, 20)}`}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ───────────────────────── applyAnnotations ──────────────────────────

/**
 * Takes raw HTML and an array of annotations. Returns HTML with `<mark>` tags
 * wrapping the annotated text ranges. Each `<mark>` gets a class based on the
 * color: `annotation-yellow`, `annotation-green`, `annotation-blue`,
 * `annotation-pink`.
 *
 * Offsets are character positions in the **text content** (i.e., with HTML tags
 * stripped). The function walks the HTML, tracking a running text-content
 * offset, and injects `<mark>` open/close tags at the correct positions.
 */
export function applyAnnotations(
  html: string,
  annotations: Annotation[],
): string {
  if (annotations.length === 0) return html;

  // Sort annotations by startOffset ascending, then by endOffset descending
  // so that wider ranges come first when they share a start position.
  const sorted = [...annotations].sort(
    (a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset,
  );

  // Build a list of insert-points in the text-content coordinate space.
  type InsertPoint = { textOffset: number; tag: string; priority: number };
  const inserts: InsertPoint[] = [];
  for (const ann of sorted) {
    const cls = `annotation-${ann.color}`;
    inserts.push({
      textOffset: ann.startOffset,
      tag: `<mark class="${cls}">`,
      priority: 0, // opens first
    });
    inserts.push({
      textOffset: ann.endOffset,
      tag: "</mark>",
      priority: 1, // closes after opens at same offset
    });
  }
  // Sort: by textOffset, then closes before opens at same offset
  inserts.sort(
    (a, b) => a.textOffset - b.textOffset || b.priority - a.priority,
  );

  // Walk the HTML character by character, tracking the running text offset.
  let result = "";
  let textPos = 0;
  let insertIdx = 0;
  let i = 0;

  const flush = () => {
    while (insertIdx < inserts.length && inserts[insertIdx].textOffset <= textPos) {
      if (inserts[insertIdx].textOffset === textPos) {
        result += inserts[insertIdx].tag;
        insertIdx++;
      } else {
        break;
      }
    }
  };

  while (i < html.length) {
    // Skip HTML tags without advancing textPos
    if (html[i] === "<") {
      // Flush any insert-points that should appear before this tag
      flush();
      const closeIdx = html.indexOf(">", i);
      if (closeIdx === -1) {
        result += html.slice(i);
        break;
      }
      result += html.slice(i, closeIdx + 1);
      i = closeIdx + 1;
      continue;
    }

    // Handle HTML entities (e.g., &amp;) — count as one text character
    if (html[i] === "&") {
      flush();
      const semiIdx = html.indexOf(";", i);
      if (semiIdx !== -1 && semiIdx - i < 10) {
        result += html.slice(i, semiIdx + 1);
        textPos++;
        i = semiIdx + 1;
        flush();
        continue;
      }
    }

    // Regular text character
    flush();
    result += html[i];
    textPos++;
    i++;
    flush();
  }

  // Flush remaining tags (e.g., annotations that end at the very end of the text)
  while (insertIdx < inserts.length) {
    result += inserts[insertIdx].tag;
    insertIdx++;
  }

  return result;
}
