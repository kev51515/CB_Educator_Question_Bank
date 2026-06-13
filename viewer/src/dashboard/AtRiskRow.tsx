/**
 * AtRiskRow
 * =========
 * One at-risk student in the dashboard triage rail. Unlike the v1 lanes
 * (which are click-through-to-the-work rows), this row carries the "why"
 * (joined reason strings) plus ONE primary action — Nudge, a single DM — and
 * a secondary link to the student's profile.
 *
 * Nudge reuses the inbox `sendDirectMessage` helper (open_thread_with →
 * messages insert), the same handshake the Journey triage uses. Toast on
 * success/failure; the button shows a transient "sending…" disabled state and
 * a "Nudged" confirmation so a teacher clearing a column gets clear feedback.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProfile } from "@/lib/profile";
import { useToast } from "@/components/Toast";
import { sendDirectMessage } from "@/inbox";
import { courseStudentProfilePath } from "@/lib/routes";
import { initialOf } from "./needsAttentionHelpers";
import type { AtRiskItem, AtRiskSeverity } from "./atRiskHelpers";

interface AtRiskRowProps {
  item: AtRiskItem;
}

const SEVERITY_DOT: Record<AtRiskSeverity, string> = {
  high: "bg-rose-500",
  medium: "bg-amber-500",
  low: "bg-slate-300 dark:bg-slate-600",
};

function nudgeBody(item: AtRiskItem): string {
  return (
    `Hi ${item.studentName.split(" ")[0] || "there"} — checking in on ` +
    `${item.courseName}. Let's get you back on track; reply here if you'd ` +
    `like a hand. You've got this!`
  );
}

export function AtRiskRow({ item }: AtRiskRowProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const { profile } = useProfile();
  const [sending, setSending] = useState(false);
  const [nudged, setNudged] = useState(false);

  const why = item.reasons.join(" · ");

  const handleNudge = async () => {
    const authorId = profile?.id;
    if (!authorId || sending) return;
    setSending(true);
    try {
      const ok = await sendDirectMessage(authorId, item.studentId, nudgeBody(item));
      if (ok) {
        setNudged(true);
        toast.success("Nudge sent", `${item.studentName} got a DM.`);
      } else {
        toast.error("Couldn't send the nudge", "Try again from the Inbox.");
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="
        w-full flex items-center gap-3 px-3 py-2.5 min-h-[40px] rounded-lg
        bg-white/70 dark:bg-slate-900/40
        ring-1 ring-slate-200/60 dark:ring-slate-800
        transition-colors
      "
    >
      <span
        aria-hidden
        className="
          relative shrink-0 inline-flex items-center justify-center
          w-8 h-8 rounded-full text-xs font-semibold
          bg-indigo-100 text-indigo-700
          dark:bg-indigo-900/60 dark:text-indigo-200
        "
      >
        {initialOf(item.studentName)}
        <span
          className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-slate-900 ${SEVERITY_DOT[item.severity]}`}
        />
      </span>

      <span className="flex-1 min-w-0">
        <span className="block text-sm text-slate-900 dark:text-slate-100 truncate">
          <span className="font-medium">{item.studentName}</span>{" "}
          <span className="text-slate-500 dark:text-slate-400">
            · {item.courseName}
          </span>
        </span>
        <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">
          {why}
        </span>
      </span>

      <button
        type="button"
        onClick={() => void handleNudge()}
        disabled={sending || nudged || !profile?.id}
        aria-label={`Nudge ${item.studentName}`}
        className="
          shrink-0 inline-flex items-center gap-1 px-2.5 h-8 rounded-md
          text-xs font-semibold
          bg-indigo-600 text-white hover:bg-indigo-700
          dark:bg-indigo-500 dark:hover:bg-indigo-400
          disabled:opacity-50 disabled:cursor-not-allowed
          focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
          transition-colors
        "
      >
        {nudged ? "Nudged" : sending ? "Sending…" : "Nudge"}
      </button>

      <button
        type="button"
        onClick={() =>
          navigate(courseStudentProfilePath(item.courseId, item.studentId))
        }
        aria-label={`Open ${item.studentName}'s profile`}
        title="View profile"
        className="
          shrink-0 inline-flex items-center justify-center
          w-8 h-8 rounded-md
          text-slate-500 dark:text-slate-400
          hover:bg-slate-100 dark:hover:bg-slate-800
          focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
          transition-colors
        "
      >
        <svg
          width={16}
          height={16}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx={12} cy={7} r={4} />
        </svg>
      </button>
    </div>
  );
}
