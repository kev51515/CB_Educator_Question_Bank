/**
 * ConfirmDialog
 * =============
 * Minimal confirmation dialog shared across the course-detail surfaces
 * (Overview, Roster, Settings) and the test runner. Now built on the shared
 * `ResponsiveModal` shell, so it's a centered card on desktop and a bottom
 * sheet on mobile, and inherits the full modal contract (focus trap, Esc +
 * backdrop close, ≥40px × close, focus restore) for free.
 *
 * `confirmPhrase` adds a type-to-confirm gate for IRREVERSIBLE actions (e.g.
 * submitting a test section you can't return to): the user must type the phrase
 * (case-insensitive) before Confirm enables. The input auto-focuses and Enter
 * confirms once it matches — deliberate friction that prevents an accidental
 * one-way action.
 *
 * Deliberately not exported from the barrel — internal helper.
 */
import { useRef, useState, type ReactNode } from "react";
import { ResponsiveModal } from "@/components";

interface ConfirmDialogProps {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
  confirmDisabled?: boolean;
  /** When set, the user must type this exact phrase (case-insensitive) to enable Confirm. */
  confirmPhrase?: string;
  /**
   * When false, Esc and backdrop-click no longer close the dialog (only the
   * explicit Cancel/Confirm buttons do). Used by the strict-mode test runner:
   * a single Esc both closes this dialog AND natively exits fullscreen, which
   * would otherwise un-suppress the fullscreen lockout overlay and trap the
   * student in an exit→re-enter loop at submit time. Defaults to true.
   */
  dismissible?: boolean;
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
  dismissible = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [typed, setTyped] = useState("");
  const phraseOk =
    !confirmPhrase ||
    typed.trim().toLowerCase() === confirmPhrase.trim().toLowerCase();
  const canConfirm = !busy && !confirmDisabled && phraseOk;

  const doConfirm = (): void => {
    if (canConfirm) onConfirm();
  };

  return (
    <ResponsiveModal
      open
      onClose={onCancel}
      dismissible={dismissible}
      title={title}
      size="sm"
      footer={
        <>
          <button
            type="button"
            data-autofocus={confirmPhrase ? undefined : true}
            onClick={onCancel}
            className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 sm:flex-none sm:min-w-[6rem] dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={doConfirm}
            disabled={!canConfirm}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none sm:min-w-[6rem] ${
              destructive ? "bg-rose-600 hover:bg-rose-700" : "bg-indigo-600 hover:bg-indigo-700"
            }`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </>
      }
    >
      <div className="space-y-4">
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
              className="w-full min-h-[44px] rounded-lg px-3 py-2.5 text-sm bg-white text-slate-900 ring-1 ring-slate-300 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:bg-slate-950 dark:text-slate-100 dark:ring-slate-700 dark:placeholder:text-slate-600"
            />
          </div>
        )}
      </div>
    </ResponsiveModal>
  );
}
