import { useCallback, useEffect, useRef, useState } from "react";
import type { Question } from "@/types";
import { IDENTITY } from "../lib/designTokens";
import { useFocusTrap } from "../hooks";

// ─────────────────────────────── types ───────────────────────────────

export interface ChoiceNote {
  questionId: string;
  choiceId: string;
  text: string;
}

type ChoiceNotesStore = Record<string, Record<string, string>>;

const LETTERS = ["A", "B", "C", "D", "E"];

// ─────────────────────────────── helpers ─────────────────────────────

function readStore(key: string): ChoiceNotesStore {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as ChoiceNotesStore;
    }
    return {};
  } catch {
    return {};
  }
}

function writeStore(key: string, store: ChoiceNotesStore): void {
  try {
    localStorage.setItem(key, JSON.stringify(store));
  } catch {
    /* quota or disabled — non-fatal */
  }
}

// ─────────────────────────── useChoiceNotes ──────────────────────────

export function useChoiceNotes(storageKey: string): {
  get: (questionId: string, choiceId: string) => string;
  set: (questionId: string, choiceId: string, text: string) => void;
  getAll: (questionId: string) => Record<string, string>;
} {
  const [store, setStore] = useState<ChoiceNotesStore>(() =>
    readStore(storageKey),
  );

  // Persist on change.
  useEffect(() => {
    writeStore(storageKey, store);
  }, [storageKey, store]);

  // Cross-tab sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== storageKey) return;
      try {
        const next: unknown = e.newValue ? JSON.parse(e.newValue) : {};
        if (next && typeof next === "object" && !Array.isArray(next)) {
          setStore(next as ChoiceNotesStore);
        } else {
          setStore({});
        }
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [storageKey]);

  const get = useCallback(
    (questionId: string, choiceId: string): string => {
      const perQuestion = store[questionId];
      if (!perQuestion) return "";
      return perQuestion[choiceId] ?? "";
    },
    [store],
  );

  const set = useCallback(
    (questionId: string, choiceId: string, text: string) => {
      setStore((prev) => {
        const perQuestion = { ...(prev[questionId] ?? {}) };
        const trimmed = text;
        if (trimmed.length === 0) {
          delete perQuestion[choiceId];
        } else {
          perQuestion[choiceId] = trimmed;
        }
        const next = { ...prev };
        if (Object.keys(perQuestion).length > 0) {
          next[questionId] = perQuestion;
        } else {
          delete next[questionId];
        }
        return next;
      });
    },
    [],
  );

  const getAll = useCallback(
    (questionId: string): Record<string, string> => {
      return { ...(store[questionId] ?? {}) };
    },
    [store],
  );

  return { get, set, getAll };
}

// ─────────────────────── ChoiceAnalysisPanel ─────────────────────────

interface ChoiceAnalysisPanelProps {
  question: Question;
  notes: Record<string, string>; // choiceId -> note text
  onSaveNote: (choiceId: string, text: string) => void;
  open: boolean;
  onClose: () => void;
  number?: number | null;
}

export function ChoiceAnalysisPanel(
  props: ChoiceAnalysisPanelProps,
): JSX.Element | null {
  const { question, notes, onSaveNote, open, onClose, number } = props;
  const dialogRef = useRef<HTMLDivElement | null>(null);

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

  if (!open) return null;

  const options = question.answerOptions ?? [];
  const correctIds = new Set(question.keys ?? []);
  const titleId = "choice-analysis-title";

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 print:hidden"
      onClick={(e) => {
        // Click outside the dialog closes it.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={"bg-white rounded-2xl shadow-card border-t-[3px] " + IDENTITY.accent.topBorder + " w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col"}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-ink-200">
          <h2
            id={titleId}
            className="text-[14px] font-semibold text-ink-800"
          >
            Choice Analysis
            {number != null && (
              <>
                <span className="text-ink-400 mx-1.5">·</span>
                <span className="text-ink-600">#{number}</span>
              </>
            )}
          </h2>
          <button
            type="button"
            data-close
            data-autofocus
            onClick={onClose}
            title="Close (Esc)"
            aria-label="Close"
            className="w-7 h-7 rounded-md inline-flex items-center justify-center text-ink-500 hover:text-ink-800 hover:bg-ink-100 focus-ring transition-colors"
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

        {/* Body */}
        <div className="px-5 py-4 overflow-y-auto flex-1">
          {options.length === 0 ? (
            <p className="text-[13px] text-ink-500">
              This question has no multiple-choice options to analyze.
            </p>
          ) : (
            <ul className="space-y-3">
              {options.map((opt, i) => {
                const letter = LETTERS[i] ?? "?";
                const isCorrect = correctIds.has(opt.id);
                return (
                  <ChoiceRow
                    key={opt.id}
                    letter={letter}
                    choiceId={opt.id}
                    content={opt.content}
                    isCorrect={isCorrect}
                    initialNote={notes[opt.id] ?? ""}
                    onSaveNote={onSaveNote}
                  />
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-ink-200 flex items-center justify-between">
          <div className="text-[11.5px] text-ink-500">
            Notes auto-save when the textarea loses focus.
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[12px] px-3 py-1.5 rounded-md bg-ink-100 text-ink-700 hover:bg-ink-200 focus-ring"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── ChoiceRow ───────────────────────────────

interface ChoiceRowProps {
  letter: string;
  choiceId: string;
  content: string;
  isCorrect: boolean;
  initialNote: string;
  onSaveNote: (choiceId: string, text: string) => void;
}

function ChoiceRow({
  letter,
  choiceId,
  content,
  isCorrect,
  initialNote,
  onSaveNote,
}: ChoiceRowProps): JSX.Element {
  const [draft, setDraft] = useState<string>(initialNote);

  // If the incoming note changes (e.g., cross-tab sync), refresh the draft
  // unless the user is editing — keep this simple by syncing only when the
  // initial differs and the draft matches the last initial.
  const lastInitial = useRef<string>(initialNote);
  useEffect(() => {
    if (lastInitial.current !== initialNote) {
      // Only overwrite if the user hasn't diverged from the previous value.
      if (draft === lastInitial.current) {
        setDraft(initialNote);
      }
      lastInitial.current = initialNote;
    }
  }, [initialNote, draft]);

  const handleBlur = () => {
    if (draft !== initialNote) {
      onSaveNote(choiceId, draft);
    }
  };

  return (
    <li className="border border-ink-200 rounded-lg p-3 bg-white">
      <div className="flex items-start gap-3">
        <div
          className={
            "flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold " +
            (isCorrect
              ? "bg-emerald-100 text-emerald-700"
              : "bg-ink-100 text-ink-700")
          }
        >
          {letter}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            {isCorrect ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                <svg
                  viewBox="0 0 24 24"
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Correct
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] text-ink-500">
                <span
                  className="w-1.5 h-1.5 rounded-full bg-ink-400"
                  aria-hidden
                />
                Distractor
              </span>
            )}
          </div>
          <div
            className="q-html text-[13px] leading-relaxed text-ink-800 mb-2"
            dangerouslySetInnerHTML={{ __html: content }}
          />
          <label className="block">
            <span className="text-[11px] font-medium text-ink-500 uppercase tracking-wide">
              Why a student might pick this
            </span>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={handleBlur}
              rows={3}
              placeholder={
                isCorrect
                  ? "Why this answer is right…"
                  : "Why this distractor is tempting…"
              }
              className="mt-1 w-full text-[13px] p-2 rounded-md border border-ink-200 bg-ink-50/50 focus:outline-none focus:ring-2 focus:ring-accent-400 focus:border-accent-400 leading-relaxed resize-y"
            />
          </label>
        </div>
      </div>
    </li>
  );
}
