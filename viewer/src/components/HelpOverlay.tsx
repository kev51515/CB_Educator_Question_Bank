/**
 * HelpOverlay
 * ===========
 * Modal that lists keyboard shortcuts. Focus-trapped, ESC-to-close, and
 * restores focus to the previously-active element when dismissed.
 *
 * The overlay renders as a portal-like absolute layer over the app; the
 * caller controls visibility via the `onClose` callback (typically a state
 * setter in App).
 */
import { useRef } from "react";
import { IDENTITY } from "@/lib/designTokens";
import { useFocusTrap } from "@/hooks";

interface HelpOverlayProps {
  /** Callback invoked when user dismisses the dialog (ESC, click outside, X button). */
  onClose: () => void;
}

export function HelpOverlay({ onClose }: HelpOverlayProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useFocusTrap(dialogRef, true);

  return (
    <div
      className="fixed inset-0 z-10 bg-ink-800/25 backdrop-blur-md flex items-center justify-center p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-title"
    >
      <div
        ref={dialogRef}
        className={"bg-white rounded-2xl shadow-modal border border-ink-100 border-t-[3px] " + IDENTITY.accent.topBorder + " w-full max-w-sm p-7"}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 id="help-title" className="text-[15px] font-semibold tracking-tight">
            Keyboard shortcuts
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
        <dl className="text-[13px] space-y-2.5">
          <Row k="⌘K" v="Command palette" />
          <Row k="J / ↓" v="Next question" />
          <Row k="K / ↑" v="Previous question" />
          <Row k="G" v="Random question (in current filter)" />
          <Row k="A" v="Show / hide answer" />
          <Row k="R" v="Show / hide rationale" />
          <Row k="B" v="Toggle bookmark" />
          <Row k="D" v="Toggle done" />
          <Row k="S" v="Add / remove from print set" />
          <Row k="N" v="Toggle note" />
          <Row k="C" v="Copy link to question" />
          <Row k="+ / −" v="Larger / smaller text" />
          <Row k="0" v="Reset text size" />
          <Row k="P" v="Print" />
          <Row k="/" v="Focus search" />
          <Row k="?" v="This help" />
          <Row k="Esc" v="Close / blur" />
        </dl>
      </div>
    </div>
  );
}

/**
 * Single key/description row inside the shortcuts dialog.
 * Wrapped in `<div>` (allowed by spec inside <dl>) with a proper
 * `<dt>`/`<dd>` pair, satisfying the axe-core "definition-list" rule.
 */
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <dt>
        <kbd>{k}</kbd>
      </dt>
      <dd className="text-ink-600">{v}</dd>
    </div>
  );
}
