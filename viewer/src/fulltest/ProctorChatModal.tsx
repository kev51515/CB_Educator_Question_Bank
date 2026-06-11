/**
 * ProctorChatModal (staff)
 * ========================
 * The proctor's side of the paused-test conversation. Opened from a live-test
 * roster row. Lets the proctor pause/resume the student (with an optional
 * reason that's delivered as the first message) and exchange messages — preset
 * chips + free text — via the shared ProctorChat. All persisted (0113).
 */
import { useState } from "react";
import { ResponsiveModal } from "@/components";
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
  const [reason, setReason] = useState("");

  return (
    <ResponsiveModal
      open
      onClose={onClose}
      title={studentName}
      subtitle={paused ? "Paused — they can message you" : "In progress"}
      size="md"
    >
      <div className="flex h-[72vh] flex-col sm:h-[68vh]">
        {/* pause / resume control */}
        <div className="shrink-0 border-b border-slate-200 pb-3 dark:border-slate-800">
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
                data-autofocus
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
          className="min-h-0 flex-1 pt-2"
          emptyHint={
            paused
              ? "No messages yet. Send a quick reply or type a note."
              : "Pause the student to open a two-way conversation."
          }
        />
      </div>
    </ResponsiveModal>
  );
}
