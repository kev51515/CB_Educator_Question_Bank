/**
 * ConfirmDialog
 * =============
 * Minimal confirmation dialog shared across the course-detail surfaces
 * (Overview, Roster, Settings) and the test runner. Lifted out of the old
 * ClassDetailView so the now-split tabs can render the same destructive /
 * regen / remove confirmations without each file owning its own copy.
 *
 * `confirmPhrase` adds a type-to-confirm gate for IRREVERSIBLE actions (e.g.
 * submitting a test section you can't return to): the user must type the phrase
 * (case-insensitive) before Confirm enables. The input auto-focuses and Enter
 * confirms once it matches — deliberate friction that prevents an accidental
 * one-way action.
 *
 * Deliberately not exported from the barrel — internal helper.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFocusTrap } from "@/hooks";

interface ConfirmDialogProps {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
  confirmDisabled?: boolean;
  /** When set, the user must type this exact phrase (case-insensitive) to enable Confirm. */
  confirmPhrase?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  destructive,
  busy,
  confirmDisabled,
  confirmPhrase,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(panelRef, true);

  const [typed, setTyped] = useState("");
  const phraseOk =
    !confirmPhrase ||
    typed.trim().toLowerCase() === confirmPhrase.trim().toLowerCase();
  const canConfirm = !busy && !confirmDisabled && phraseOk;

  // Esc-to-close — match the standard modal a11y contract.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  // Focus management: the type-to-confirm input when present (so the user can
  // start typing immediately), else Cancel (safe default — they must click
  // Confirm deliberately for plain destructive flows). Restore focus on close.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    if (confirmPhrase) inputRef.current?.focus();
    else cancelRef.current?.focus();
    return () => {
      previouslyFocused?.focus?.();
    };
  }, [confirmPhrase]);

  const doConfirm = (): void => {
    if (canConfirm) onConfirm();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        ref={panelRef}
        className="relative w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-slate-200 dark:ring-slate-700 p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close"
          className="absolute top-2 right-2 inline-flex items-center justify-center w-10 h-10 rounded-md text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <svg
            width={20}
            height={20}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 pr-8">
          {title}
        </h2>
        <div className="text-sm text-slate-600 dark:text-slate-300">{body}</div>

        {confirmPhrase && (
          <div className="space-y-1.5">
            <label
              htmlFor="confirm-phrase-input"
              className="block text-sm text-slate-600 dark:text-slate-300"
            >
              Type{" "}
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {confirmPhrase}
              </span>{" "}
              to confirm
            </label>
            <input
              id="confirm-phrase-input"
              ref={inputRef}
              data-autofocus
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  doConfirm();
                }
              }}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-label={`Type ${confirmPhrase} to confirm`}
              placeholder={confirmPhrase}
              className="w-full min-h-[44px] rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 ring-1 ring-slate-300 dark:ring-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 placeholder:text-slate-400 dark:placeholder:text-slate-600"
            />
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          <button
            ref={cancelRef}
            data-autofocus={confirmPhrase ? undefined : true}
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={doConfirm}
            disabled={!canConfirm}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60 disabled:cursor-not-allowed ${
              destructive
                ? "bg-rose-600 hover:bg-rose-700"
                : "bg-indigo-600 hover:bg-indigo-700"
            }`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
