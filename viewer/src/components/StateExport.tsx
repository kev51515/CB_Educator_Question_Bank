/**
 * StateExport
 * ===========
 * Export and import the full user state as a single JSON file.
 *
 * Reads every `sat:*` localStorage key into a single envelope, and writes
 * them back on import. Supports two import modes:
 *   • Merge   — union sets, overlay maps; never destroys existing data
 *   • Replace — wipe existing `sat:*` keys, then write the imported state
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IDENTITY } from "@/lib/designTokens";
import { useFocusTrap } from "@/hooks";
import type { Tag } from "./TagSystem";
import type { Annotation } from "./Annotations";
import type { QuestionFlag } from "./QuestionFlags";

/* ─── Types ─── */

export interface ExportedState {
  version: 1;
  exportedAt: string;
  bookmarks: string[];
  done: string[];
  selected: string[];
  notes: Record<string, string>;
  confidence: Record<string, number>;
  recent: string[];
  fontStep: number;
  printOrder: string[];
  tags: Tag[];
  questionTags: Record<string, string[]>;
  flags: Record<string, QuestionFlag[]>;
  annotations: Record<string, Annotation[]>;
  templates?: unknown[];
}

/* ─── Storage keys ─── */

const KEYS = {
  bookmarks: "sat:bookmarks",
  done: "sat:done",
  selected: "sat:selected",
  notes: "sat:notes",
  confidence: "sat:confidence",
  recent: "sat:recent",
  fontStep: "sat:font-step",
  printOrder: "sat:print-order",
  tags: "sat:tags",
  questionTags: "sat:question-tags",
  flags: "sat:flags",
  annotations: "sat:annotations",
  templates: "sat:qb-templates",
} as const;

/* ─── localStorage helpers (defensive) ─── */

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota or disabled — non-fatal */
  }
}

function readNumber(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

function writeNumber(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* non-fatal */
  }
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === "string") out.push(item);
  }
  return out;
}

function asRecord<T>(v: unknown, valueOk: (x: unknown) => x is T): Record<string, T> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, T> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (valueOk(val)) out[k] = val;
  }
  return out;
}

function isString(x: unknown): x is string {
  return typeof x === "string";
}

function isNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((v) => typeof v === "string");
}

/* ─── Gather ─── */

export function gatherState(): ExportedState {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    bookmarks: readJSON<string[]>(KEYS.bookmarks, []),
    done: readJSON<string[]>(KEYS.done, []),
    selected: readJSON<string[]>(KEYS.selected, []),
    notes: readJSON<Record<string, string>>(KEYS.notes, {}),
    confidence: readJSON<Record<string, number>>(KEYS.confidence, {}),
    recent: readJSON<string[]>(KEYS.recent, []),
    fontStep: readNumber(KEYS.fontStep, 0),
    printOrder: readJSON<string[]>(KEYS.printOrder, []),
    tags: readJSON<Tag[]>(KEYS.tags, []),
    questionTags: readJSON<Record<string, string[]>>(KEYS.questionTags, {}),
    flags: readJSON<Record<string, QuestionFlag[]>>(KEYS.flags, {}),
    annotations: readJSON<Record<string, Annotation[]>>(KEYS.annotations, {}),
    templates: readJSON<unknown[]>(KEYS.templates, []),
  };
}

/* ─── Apply (merge by default) ─── */

function uniqUnion(a: string[], b: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of a) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  for (const id of b) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

function mergeMap<T>(
  base: Record<string, T>,
  incoming: Record<string, T>,
): Record<string, T> {
  return { ...base, ...incoming };
}

export function applyState(
  state: ExportedState,
): { applied: string[]; warnings: string[] } {
  const applied: string[] = [];
  const warnings: string[] = [];

  if (!state || typeof state !== "object") {
    warnings.push("Invalid state object");
    return { applied, warnings };
  }
  if (state.version !== 1) {
    warnings.push(`Unsupported version: ${String(state.version)}`);
    return { applied, warnings };
  }

  // Helper that wraps each section so a single corrupt section can't take
  // down the whole import.
  const safe = (label: string, fn: () => void): void => {
    try {
      fn();
      applied.push(label);
    } catch (err) {
      warnings.push(`${label}: ${err instanceof Error ? err.message : "failed"}`);
    }
  };

  safe("bookmarks", () => {
    const incoming = asStringArray(state.bookmarks);
    const current = readJSON<string[]>(KEYS.bookmarks, []);
    writeJSON(KEYS.bookmarks, uniqUnion(current, incoming));
  });

  safe("done", () => {
    const incoming = asStringArray(state.done);
    const current = readJSON<string[]>(KEYS.done, []);
    writeJSON(KEYS.done, uniqUnion(current, incoming));
  });

  safe("selected", () => {
    const incoming = asStringArray(state.selected);
    const current = readJSON<string[]>(KEYS.selected, []);
    writeJSON(KEYS.selected, uniqUnion(current, incoming));
  });

  safe("notes", () => {
    const incoming = asRecord<string>(state.notes, isString);
    const current = readJSON<Record<string, string>>(KEYS.notes, {});
    writeJSON(KEYS.notes, mergeMap(current, incoming));
  });

  safe("confidence", () => {
    const incoming = asRecord<number>(state.confidence, isNumber);
    const current = readJSON<Record<string, number>>(KEYS.confidence, {});
    writeJSON(KEYS.confidence, mergeMap(current, incoming));
  });

  safe("recent", () => {
    const incoming = asStringArray(state.recent);
    const current = readJSON<string[]>(KEYS.recent, []);
    // Recent: incoming first (more recently used), then dedup
    writeJSON(KEYS.recent, uniqUnion(incoming, current));
  });

  safe("fontStep", () => {
    if (isNumber(state.fontStep)) writeNumber(KEYS.fontStep, state.fontStep);
  });

  safe("printOrder", () => {
    const incoming = asStringArray(state.printOrder);
    const current = readJSON<string[]>(KEYS.printOrder, []);
    writeJSON(KEYS.printOrder, uniqUnion(current, incoming));
  });

  safe("tags", () => {
    const incoming = Array.isArray(state.tags) ? state.tags : [];
    const current = readJSON<Tag[]>(KEYS.tags, []);
    const seen = new Set(current.map((t) => t.id));
    const merged = [...current];
    for (const t of incoming) {
      if (
        t &&
        typeof t === "object" &&
        typeof (t as Tag).id === "string" &&
        typeof (t as Tag).name === "string" &&
        typeof (t as Tag).color === "string" &&
        !seen.has((t as Tag).id)
      ) {
        merged.push(t);
        seen.add((t as Tag).id);
      }
    }
    writeJSON(KEYS.tags, merged);
  });

  safe("questionTags", () => {
    const incoming = asRecord<string[]>(state.questionTags, isStringArray);
    const current = readJSON<Record<string, string[]>>(KEYS.questionTags, {});
    const merged: Record<string, string[]> = { ...current };
    for (const [qid, tagIds] of Object.entries(incoming)) {
      merged[qid] = uniqUnion(current[qid] ?? [], tagIds);
    }
    writeJSON(KEYS.questionTags, merged);
  });

  safe("flags", () => {
    const incoming = state.flags && typeof state.flags === "object" ? state.flags : {};
    const current = readJSON<Record<string, QuestionFlag[]>>(KEYS.flags, {});
    const merged: Record<string, QuestionFlag[]> = { ...current };
    for (const [qid, list] of Object.entries(incoming)) {
      if (!Array.isArray(list)) continue;
      merged[qid] = [...(current[qid] ?? []), ...list];
    }
    writeJSON(KEYS.flags, merged);
  });

  safe("annotations", () => {
    const incoming =
      state.annotations && typeof state.annotations === "object" ? state.annotations : {};
    const current = readJSON<Record<string, Annotation[]>>(KEYS.annotations, {});
    const merged: Record<string, Annotation[]> = { ...current };
    for (const [qid, list] of Object.entries(incoming)) {
      if (!Array.isArray(list)) continue;
      const seen = new Set((current[qid] ?? []).map((a) => a.id));
      const next = [...(current[qid] ?? [])];
      for (const a of list) {
        if (a && typeof a === "object" && typeof (a as Annotation).id === "string") {
          if (!seen.has((a as Annotation).id)) {
            next.push(a);
            seen.add((a as Annotation).id);
          }
        }
      }
      merged[qid] = next;
    }
    writeJSON(KEYS.annotations, merged);
  });

  if (state.templates !== undefined) {
    safe("templates", () => {
      if (Array.isArray(state.templates)) {
        const current = readJSON<unknown[]>(KEYS.templates, []);
        writeJSON(KEYS.templates, [...current, ...state.templates!]);
      }
    });
  }

  return { applied, warnings };
}

/* ─── Replace mode ─── */

function replaceState(state: ExportedState): { applied: string[]; warnings: string[] } {
  const warnings: string[] = [];
  if (!state || typeof state !== "object" || state.version !== 1) {
    warnings.push(`Unsupported version: ${String(state?.version)}`);
    return { applied: [], warnings };
  }

  // Clear all sat:* keys we know about, then overlay the incoming state.
  for (const key of Object.values(KEYS)) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* non-fatal */
    }
  }
  return applyState(state);
}

/* ─── Download ─── */

export function downloadStateJson(filename?: string): void {
  const state = gatherState();
  const json = JSON.stringify(state, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const name =
    filename ?? `sat-state-${new Date().toISOString().slice(0, 10)}.json`;
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Give the download a tick to start before revoking the URL.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/* ─── Summary helpers ─── */

function summarizeState(state: ExportedState): string {
  const parts: string[] = [];
  if (state.bookmarks.length) parts.push(`${state.bookmarks.length} bookmarks`);
  if (state.done.length) parts.push(`${state.done.length} done`);
  if (state.selected.length) parts.push(`${state.selected.length} selected`);
  if (state.tags.length) parts.push(`${state.tags.length} tags`);
  const noteCount = Object.keys(state.notes).length;
  if (noteCount) parts.push(`${noteCount} notes`);
  const annCount = Object.values(state.annotations).reduce(
    (sum, list) => sum + (Array.isArray(list) ? list.length : 0),
    0,
  );
  if (annCount) parts.push(`${annCount} annotations`);
  const flagCount = Object.values(state.flags).reduce(
    (sum, list) => sum + (Array.isArray(list) ? list.length : 0),
    0,
  );
  if (flagCount) parts.push(`${flagCount} flags`);
  return parts.length ? parts.join(", ") : "no data";
}

/* ─── StateExportPanel modal ─── */

interface StateExportPanelProps {
  open: boolean;
  onClose: () => void;
  onApplied: (summary: string) => void;
}

export function StateExportPanel({
  open,
  onClose,
  onApplied,
}: StateExportPanelProps): JSX.Element | null {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [incoming, setIncoming] = useState<ExportedState | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  useFocusTrap(dialogRef, open);

  // Escape to close.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Reset import preview when the dialog opens/closes.
  useEffect(() => {
    if (!open) {
      setIncoming(null);
      setParseError(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [open]);

  const currentSummary = useMemo(() => {
    if (!open) return "";
    try {
      return summarizeState(gatherState());
    } catch {
      return "no data";
    }
  }, [open]);

  const handleDownload = useCallback(() => {
    try {
      downloadStateJson();
      onApplied("Downloaded backup");
    } catch {
      onApplied("Download failed");
    }
  }, [onApplied]);

  const handleFile = useCallback((file: File) => {
    setParseError(null);
    setIncoming(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? "");
        const parsed = JSON.parse(text) as ExportedState;
        if (!parsed || parsed.version !== 1) {
          setParseError("Unsupported file version");
          return;
        }
        setIncoming(parsed);
      } catch {
        setParseError("Could not parse JSON");
      }
    };
    reader.onerror = () => setParseError("Could not read file");
    reader.readAsText(file);
  }, []);

  const handleMerge = useCallback(() => {
    if (!incoming) return;
    const result = applyState(incoming);
    const msg = `Merged ${result.applied.length} sections${
      result.warnings.length ? ` (${result.warnings.length} warnings)` : ""
    }`;
    onApplied(msg);
    onClose();
  }, [incoming, onApplied, onClose]);

  const handleReplace = useCallback(() => {
    if (!incoming) return;
    const ok =
      typeof window !== "undefined" && typeof window.confirm === "function"
        ? window.confirm(
            "Replace all existing state with the imported file? This cannot be undone.",
          )
        : true;
    if (!ok) return;
    const result = replaceState(incoming);
    const msg = `Replaced state (${result.applied.length} sections${
      result.warnings.length ? `, ${result.warnings.length} warnings` : ""
    })`;
    onApplied(msg);
    onClose();
  }, [incoming, onApplied, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-10 bg-ink-800/25 backdrop-blur-md flex items-center justify-center p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="state-export-title"
    >
      <div
        ref={dialogRef}
        className={"bg-white rounded-2xl shadow-modal border border-ink-100 border-t-[3px] " + IDENTITY.status.topBorder + " w-full max-w-md p-7"}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2
            id="state-export-title"
            className="text-[15px] font-semibold tracking-tight"
          >
            Backup &amp; restore
          </h2>
          <button
            data-close
            data-autofocus
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full text-ink-400 hover:text-ink-700 hover:bg-ink-100 transition-colors flex items-center justify-center focus-ring"
            aria-label="Close"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-4 h-4"
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
        </div>

        {/* Export section */}
        <section className="mb-6">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-500 mb-2">
            Export
          </h3>
          <p className="text-[12.5px] text-ink-600 mb-3">{currentSummary}</p>
          <button
            type="button"
            onClick={handleDownload}
            className="px-3 py-1.5 rounded-md text-[12px] bg-ink-800 text-white hover:bg-ink-900 transition focus-ring"
          >
            Download backup
          </button>
        </section>

        {/* Import section */}
        <section>
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-500 mb-2">
            Import
          </h3>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
            className="block text-[12px] text-ink-700 mb-3"
            aria-label="Choose backup file"
          />

          {parseError && (
            <p
              className="text-[12px] text-red-600 mb-3"
              role="alert"
            >
              {parseError}
            </p>
          )}

          {incoming && (
            <>
              <p className="text-[12.5px] text-ink-600 mb-3">
                This file has {summarizeState(incoming)}.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleMerge}
                  className="px-3 py-1.5 rounded-md text-[12px] bg-ink-100 text-ink-800 hover:bg-ink-200 transition focus-ring"
                >
                  Merge
                </button>
                <button
                  type="button"
                  onClick={handleReplace}
                  className="px-3 py-1.5 rounded-md text-[12px] bg-red-600 text-white hover:bg-red-700 transition focus-ring"
                >
                  Replace all
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
