/**
 * ProctorChatModal (staff)
 * ========================
 * The proctor's side of the paused-test conversation. Opened from a live-test
 * roster row. Lets the proctor pause/resume the student (with an optional
 * reason that's delivered as the first message) and exchange messages — preset
 * chips + free text — via the shared ProctorChat. All persisted (0113).
 */
import { useRef, useState } from "react";
import { useEscapeKey, useFocusTrap } from "@/hooks";
import { ProctorChat } from "./ProctorChat";

interface ProctorChatModalProps {
  runId: string;
  studentName: string;
  paused: boolean;
  /** Pause/resume; an optional reason is sent to the student as a message. */
  onPause: (paused: boolean, reason?: string) => Promise<void> | void;
  pauseBusy?: boolean;
  onClose: () => void;
}

export function ProctorChatModal({
  runId,
  studentName,
  paused,
  onPause,
  pauseBusy = false,
  onClose,
}: ProctorChatModalProps): JSX.Element {
  const panelRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(panelRef, true);
  useEscapeKey(onClose);
  const [reason, setReason] = useState("");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="proctor-chat-title"
      className="fixed inset-0 z-[75] flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        className="flex h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700 sm:h-[80vh] sm:rounded-2xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-5 py-3 dark:border-slate-800">
          <div className="min-w-0">
            <h2 id="proctor-chat-title" className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {studentName}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {paused ? "Paused — they can message you" : "In progress"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            ✕
          </button>
        </header>

        {/* pause / resume control */}
        <div className="shrink-0 border-b border-slate-200 px-5 py-3 dark:border-slate-800">
          {paused ? (
            <button
              type="button"
              disabled={pauseBusy}
              onClick={() => void onPause(false)}
              className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {pauseBusy ? "Working…" : "Resume test"}
            </button>
          ) : (
            <div className="space-y-2">
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                placeholder="Reason (optional) — shown to the student"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              <button
                type="button"
                disabled={pauseBusy}
                onClick={() => {
                  void onPause(true, reason.trim() || undefined);
                  setReason("");
                }}
                className="w-full rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
              >
                {pauseBusy ? "Working…" : "Pause test"}
              </button>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                The student can only message you while paused.
              </p>
            </div>
          )}
        </div>

        <ProctorChat
          runId={runId}
          role="staff"
          className="min-h-0 flex-1 px-4 py-2"
          emptyHint={
            paused
              ? "No messages yet. Send a quick reply or type a note."
              : "Pause the student to open a two-way conversation."
          }
        />
      </div>
    </div>
  );
}
