/**
 * ShortcutHelpOverlay
 * ===================
 * A lightweight, application-wide keyboard-shortcut help modal. Mounted by
 * each shell (StaffShell, AreaSelector) and toggled by the global `?` key.
 *
 * Unlike the older `HelpOverlay` (which lives inside the question-bank
 * surface and uses the design-tokens accent palette), this overlay is
 * intentionally palette-aligned with the LMS surfaces (indigo / emerald /
 * amber / rose / slate) and dark-mode-aware.
 *
 * Accessibility:
 *  - `role="dialog"`, `aria-modal="true"`, `aria-labelledby` on the title
 *  - Esc closes (handled by the parent's listener as well as a local one)
 *  - Clicking the backdrop closes
 *  - `<kbd>` styling matches the spec in CLAUDE.md
 */
import { useEffect, useRef, type ReactNode } from "react";
import { useFocusTrap } from "../hooks";

export interface ShortcutHelpOverlayProps {
  open: boolean;
  onClose: () => void;
}

interface ShortcutRow {
  /** Key combo(s) for this shortcut. Each string is rendered in its own `<kbd>`. */
  keys: string[];
  description: string;
}

interface ShortcutSection {
  title: string;
  rows: ShortcutRow[];
}

const SECTIONS: ShortcutSection[] = [
  {
    title: "Global",
    rows: [
      { keys: ["?"], description: "Show this keyboard-shortcut overlay" },
      { keys: ["⌘", "K"], description: "Open command palette (macOS)" },
      { keys: ["Ctrl", "K"], description: "Open command palette (Windows / Linux)" },
      { keys: ["Esc"], description: "Close any open overlay or modal" },
    ],
  },
  {
    title: "Editing",
    rows: [
      { keys: ["Enter"], description: "Save an inline edit (rename, etc.)" },
      { keys: ["Esc"], description: "Cancel an inline edit without saving" },
      { keys: ["Tab"], description: "Move to the next form field" },
      { keys: ["Shift", "Tab"], description: "Move to the previous form field" },
    ],
  },
  {
    title: "Practice & mock test",
    rows: [
      { keys: ["1"], description: "Pick answer choice A" },
      { keys: ["2"], description: "Pick answer choice B" },
      { keys: ["3"], description: "Pick answer choice C" },
      { keys: ["4"], description: "Pick answer choice D" },
      { keys: ["A"], description: "Pick answer choice A (alternate)" },
      { keys: ["B"], description: "Pick answer choice B (alternate)" },
      { keys: ["C"], description: "Pick answer choice C (alternate)" },
      { keys: ["D"], description: "Pick answer choice D (alternate)" },
      { keys: ["←"], description: "Previous question" },
      { keys: ["→"], description: "Next question" },
      { keys: ["Enter"], description: "Advance to the next question" },
      { keys: ["F"], description: "Toggle flag on current question" },
      { keys: ["↑", "↓"], description: "Move between answer choices in the radiogroup" },
      { keys: ["Esc"], description: "Exit or dismiss the runner overlay" },
    ],
  },
  {
    title: "Teacher grading",
    rows: [
      { keys: ["J"], description: "Next student attempt" },
      { keys: ["↓"], description: "Next student attempt (alternate)" },
      { keys: ["K"], description: "Previous student attempt" },
      { keys: ["↑"], description: "Previous student attempt (alternate)" },
      { keys: ["⌘", "S"], description: "Force-save feedback + score (macOS)" },
      { keys: ["Ctrl", "S"], description: "Force-save feedback + score (Windows / Linux)" },
      { keys: ["⌘", "Enter"], description: "Save & advance to next student (macOS)" },
      { keys: ["Ctrl", "Enter"], description: "Save & advance to next student (Windows / Linux)" },
    ],
  },
  {
    title: "Lists & drag-and-drop",
    rows: [
      { keys: ["Click"], description: "Toggle status badges (publish ↔ unpublish)" },
      { keys: ["Drag"], description: "Reorder items via the 6-dot grip handle" },
      { keys: ["⋯"], description: "Open the kebab menu (incl. Move to… for keyboard-only)" },
    ],
  },
  {
    title: "Navigation",
    rows: [
      { keys: ["Click"], description: "Open a course or assignment from a card" },
      { keys: ["Left rail"], description: "Jump between Dashboard / Courses / Calendar / Inbox / Account" },
    ],
  },
];

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="text-xs font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700 text-slate-700 dark:text-slate-200">
      {children}
    </kbd>
  );
}

export function ShortcutHelpOverlay({ open, onClose }: ShortcutHelpOverlayProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(panelRef, open);
  // Local Esc-to-close, in case the parent didn't wire one up. Cheap and
  // defensive — the global `?` listener in the shell already swallows the
  // open keystroke.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-sm p-4 print:hidden"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcut-help-title"
    >
      <div
        ref={panelRef}
        className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 shadow-2xl max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2
              id="shortcut-help-title"
              className="text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              Keyboard shortcuts
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Press <Kbd>?</Kbd> from anywhere to reopen this list.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close keyboard shortcuts"
          >
            <svg
              width={18}
              height={18}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="overflow-y-auto px-6 py-5 grid gap-6 sm:grid-cols-2">
          {SECTIONS.map((section) => (
            <section key={section.title} aria-labelledby={`shortcut-section-${section.title}`}>
              <h3
                id={`shortcut-section-${section.title}`}
                className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400 mb-2"
              >
                {section.title}
              </h3>
              <ul className="space-y-1.5">
                {section.rows.map((row, idx) => (
                  <li
                    key={`${section.title}-${idx}`}
                    className="flex items-start justify-between gap-3 text-sm"
                  >
                    <span className="text-slate-700 dark:text-slate-300 leading-relaxed">
                      {row.description}
                    </span>
                    <span className="flex flex-shrink-0 items-center gap-1">
                      {row.keys.map((k, i) => (
                        <Kbd key={`${section.title}-${idx}-${i}`}>{k}</Kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <footer className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
          <span>
            Tip: most inline edits save on <Kbd>Enter</Kbd> and cancel on <Kbd>Esc</Kbd>.
          </span>
          <span>
            Close: <Kbd>Esc</Kbd>
          </span>
        </footer>
      </div>
    </div>
  );
}
