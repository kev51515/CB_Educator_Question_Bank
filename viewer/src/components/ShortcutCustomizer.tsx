import { useCallback, useEffect, useRef, useState } from "react";
import { IDENTITY } from "../lib/designTokens";
import { useFocusTrap } from "../hooks";

// ─────────────────────────────── types ───────────────────────────────

export interface ShortcutMap {
  next: string;
  prev: string;
  answer: string;
  rationale: string;
  bookmark: string;
  done: string;
  printSet: string;
  note: string;
  random: string;
  copy: string;
  print: string;
  search: string;
  help: string;
}

export const DEFAULT_SHORTCUTS: ShortcutMap = {
  next: "j",
  prev: "k",
  answer: "a",
  rationale: "r",
  bookmark: "b",
  done: "d",
  printSet: "s",
  note: "n",
  random: "g",
  copy: "c",
  print: "p",
  search: "/",
  help: "?",
};

const ACTION_LABELS: Record<keyof ShortcutMap, string> = {
  next: "Next question",
  prev: "Previous question",
  answer: "Toggle answer",
  rationale: "Toggle rationale",
  bookmark: "Toggle bookmark",
  done: "Mark done",
  printSet: "Add to print set",
  note: "Open note",
  random: "Random question",
  copy: "Copy question",
  print: "Print",
  search: "Focus search",
  help: "Show help",
};

const ACTION_ORDER: (keyof ShortcutMap)[] = [
  "next",
  "prev",
  "answer",
  "rationale",
  "bookmark",
  "done",
  "printSet",
  "note",
  "random",
  "copy",
  "print",
  "search",
  "help",
];

// ─────────────────────────── storage helpers ─────────────────────────

function isShortcutMap(value: unknown): value is ShortcutMap {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  for (const key of ACTION_ORDER) {
    if (typeof v[key] !== "string") return false;
  }
  return true;
}

function readShortcuts(storageKey: string): ShortcutMap {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { ...DEFAULT_SHORTCUTS };
    const parsed: unknown = JSON.parse(raw);
    if (isShortcutMap(parsed)) {
      return { ...DEFAULT_SHORTCUTS, ...parsed };
    }
    return { ...DEFAULT_SHORTCUTS };
  } catch {
    return { ...DEFAULT_SHORTCUTS };
  }
}

function writeShortcuts(storageKey: string, shortcuts: ShortcutMap): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(shortcuts));
  } catch {
    /* quota or disabled — non-fatal */
  }
}

// ─────────────────────────────── validation ──────────────────────────

/**
 * Allowed shortcut keys: single character keys without modifiers.
 * Accepts a-z, 0-9, and a handful of punctuation that commonly maps to a
 * single character on most keyboards (no shift-induced uppercase).
 */
export function isValidShortcutKey(key: string): boolean {
  if (typeof key !== "string") return false;
  if (key.length !== 1) return false;
  // a-z, 0-9, /, ?, =, -, ., ,, ;, ', [, ], \
  return /^[a-z0-9/?=\-.,;'[\]\\]$/.test(key);
}

// ───────────────────────────── useShortcuts ──────────────────────────

export function useShortcuts(storageKey: string): {
  shortcuts: ShortcutMap;
  setShortcut: (action: keyof ShortcutMap, key: string) => void;
  reset: () => void;
} {
  const [shortcuts, setShortcuts] = useState<ShortcutMap>(() => readShortcuts(storageKey));

  // Persist on change
  useEffect(() => {
    writeShortcuts(storageKey, shortcuts);
  }, [storageKey, shortcuts]);

  // Cross-tab sync
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== storageKey) return;
      try {
        const next = e.newValue ? JSON.parse(e.newValue) : null;
        if (isShortcutMap(next)) {
          setShortcuts({ ...DEFAULT_SHORTCUTS, ...next });
        } else {
          setShortcuts({ ...DEFAULT_SHORTCUTS });
        }
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [storageKey]);

  const setShortcut = useCallback(
    (action: keyof ShortcutMap, key: string) => {
      if (!isValidShortcutKey(key)) return;
      setShortcuts((prev) => {
        const next: ShortcutMap = { ...prev };
        // If another action already uses this key, swap with current
        const conflictAction = (Object.keys(prev) as (keyof ShortcutMap)[]).find(
          (k) => k !== action && prev[k] === key,
        );
        if (conflictAction) {
          next[conflictAction] = prev[action];
        }
        next[action] = key;
        return next;
      });
    },
    [],
  );

  const reset = useCallback(() => {
    setShortcuts({ ...DEFAULT_SHORTCUTS });
  }, []);

  return { shortcuts, setShortcut, reset };
}

// ─────────────────────────── CustomizerPanel ─────────────────────────

interface CustomizerPanelProps {
  open: boolean;
  onClose: () => void;
  shortcuts: ShortcutMap;
  onSetShortcut: (action: keyof ShortcutMap, key: string) => void;
  onReset: () => void;
}

export function CustomizerPanel({
  open,
  onClose,
  shortcuts,
  onSetShortcut,
  onReset,
}: CustomizerPanelProps): JSX.Element | null {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [capturing, setCapturing] = useState<keyof ShortcutMap | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Activate the focus trap only when not in capture mode so capture can
  // intercept Tab as a possible binding.
  useFocusTrap(dialogRef, open && capturing === null);

  // ESC handler + capture-mode key interception.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (capturing) {
        // Capture mode: any non-Escape key becomes the new binding
        if (e.key === "Escape") {
          e.preventDefault();
          setCapturing(null);
          setError(null);
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        if (e.ctrlKey || e.metaKey || e.altKey) {
          setError("Modifier keys are not supported. Use a single character.");
          return;
        }
        const key = e.key.toLowerCase();
        if (!isValidShortcutKey(key)) {
          setError(`"${e.key}" is not a valid shortcut key.`);
          return;
        }
        onSetShortcut(capturing, key);
        setCapturing(null);
        setError(null);
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, onClose, capturing, onSetShortcut]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-10 bg-ink-800/25 backdrop-blur-md flex items-center justify-center p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="customizer-title"
    >
      <div
        ref={dialogRef}
        className={"bg-white rounded-2xl shadow-modal border border-ink-100 border-t-[3px] " + IDENTITY.format.topBorder + " w-full max-w-md p-7 max-h-[85vh] overflow-y-auto"}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 id="customizer-title" className="text-[15px] font-semibold tracking-tight">
            Keyboard Shortcuts
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

        <p className="text-[12px] text-ink-500 mb-4">
          Click a row, then press a key to reassign. Conflicting keys swap automatically.
        </p>

        {error && (
          <div
            role="alert"
            className="mb-3 text-[12px] text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2"
          >
            {error}
          </div>
        )}

        <ul className="space-y-1.5">
          {ACTION_ORDER.map((action) => {
            const isCapturing = capturing === action;
            return (
              <li key={action}>
                <button
                  type="button"
                  onClick={() => {
                    setCapturing(action);
                    setError(null);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-[13px] transition-colors focus-ring ${
                    isCapturing
                      ? "border-accent-400 bg-accent-50"
                      : "border-ink-150 hover:bg-ink-50"
                  }`}
                  aria-pressed={isCapturing}
                >
                  <span className="text-ink-700">{ACTION_LABELS[action]}</span>
                  <kbd
                    className={`font-mono text-[12px] px-2 py-0.5 rounded border ${
                      isCapturing
                        ? "border-accent-300 bg-white text-accent-700"
                        : "border-ink-200 bg-ink-50 text-ink-700"
                    }`}
                  >
                    {isCapturing ? "Press a key…" : shortcuts[action]}
                  </kbd>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 pt-4 border-t border-ink-150 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              onReset();
              setCapturing(null);
              setError(null);
            }}
            className="text-[12px] text-ink-600 hover:text-ink-900 underline-offset-2 hover:underline focus-ring rounded"
          >
            Reset to defaults
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md bg-ink-900 text-white text-[12px] hover:bg-ink-800 focus-ring"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
