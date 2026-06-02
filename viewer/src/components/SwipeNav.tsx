import { useCallback, useEffect, useRef, useState } from "react";

interface SwipeNavOptions {
  onSwipeLeft?: () => void; // next
  onSwipeRight?: () => void; // previous
  onLongPress?: () => void; // optional, ~500ms hold
  threshold?: number; // pixels, default 50
  enabled?: boolean; // default true
}

const INTERACTIVE_SELECTOR = "button, input, textarea, a, select, [role='button']";

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  return !!target.closest(INTERACTIVE_SELECTOR);
}

/**
 * Hook that adds swipe-left/right navigation to a container element.
 * Returns an `attach` function that takes an HTMLElement ref and sets up listeners.
 */
export function useSwipeNav(options: SwipeNavOptions): {
  attach: (el: HTMLElement | null) => void;
} {
  const {
    onSwipeLeft,
    onSwipeRight,
    onLongPress,
    threshold = 50,
    enabled = true,
  } = options;

  // Keep latest handlers in refs so attach doesn't need to re-bind constantly.
  const optsRef = useRef({ onSwipeLeft, onSwipeRight, onLongPress, threshold, enabled });
  useEffect(() => {
    optsRef.current = { onSwipeLeft, onSwipeRight, onLongPress, threshold, enabled };
  }, [onSwipeLeft, onSwipeRight, onLongPress, threshold, enabled]);

  const cleanupRef = useRef<(() => void) | null>(null);

  const attach = useCallback((el: HTMLElement | null) => {
    // Tear down any prior attachment.
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    if (!el) return;

    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let moved = false;
    let tracking = false;
    let longPressTimer: number | null = null;

    const clearLongPress = () => {
      if (longPressTimer !== null) {
        window.clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      const opts = optsRef.current;
      if (!opts.enabled) return;
      if (e.touches.length !== 1) return;
      if (isInteractiveTarget(e.target)) {
        tracking = false;
        return;
      }
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      startTime = Date.now();
      moved = false;
      tracking = true;

      if (opts.onLongPress) {
        clearLongPress();
        longPressTimer = window.setTimeout(() => {
          if (tracking && !moved) {
            opts.onLongPress?.();
            tracking = false; // consume gesture
          }
        }, 500);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking) return;
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        moved = true;
        clearLongPress();
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      clearLongPress();
      if (!tracking) return;
      tracking = false;
      const opts = optsRef.current;
      if (!opts.enabled) return;

      const t = e.changedTouches[0];
      if (!t) return;

      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);
      const elapsed = Date.now() - startTime;

      // Horizontal swipe detection: must be mostly horizontal.
      if (adx > opts.threshold && ady < opts.threshold / 2) {
        if (dx < 0) {
          opts.onSwipeLeft?.();
        } else {
          opts.onSwipeRight?.();
        }
        return;
      }

      // Long-press fallback: no significant movement and held > 500ms.
      // (Already handled via timer, but cover the edge case where touchend
      // fires before the timer due to platform quirks.)
      if (!moved && elapsed > 500 && opts.onLongPress) {
        // The timer would normally fire; only invoke here if it hasn't.
        // The timer was cleared above, so safe to call again is incorrect.
        // We rely on the timer-based path; do nothing here.
      }
    };

    const onTouchCancel = () => {
      tracking = false;
      moved = false;
      clearLongPress();
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchCancel, { passive: true });

    cleanupRef.current = () => {
      clearLongPress();
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchCancel);
    };
  }, []);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, []);

  return { attach };
}

// ─── SwipeHint ───────────────────────────────────────────────────────────

interface SwipeHintProps {
  onDismiss: () => void;
  storageKey?: string;
}

const DEFAULT_HINT_KEY = "viewer.swipeHintDismissed";

/**
 * A toast-like hint shown once on mobile that explains swipe navigation.
 * Persists dismissal in localStorage.
 */
export function SwipeHint({
  onDismiss,
  storageKey = DEFAULT_HINT_KEY,
}: SwipeHintProps): JSX.Element | null {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(storageKey);
      if (!dismissed) {
        // Only show on touch-capable / narrow viewports.
        const isMobile =
          typeof window !== "undefined" &&
          (window.matchMedia?.("(max-width: 700px)").matches ||
            "ontouchstart" in window);
        if (isMobile) setVisible(true);
      }
    } catch {
      // localStorage unavailable; no-op
    }
  }, [storageKey]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      // ignore
    }
    onDismiss();
  }, [onDismiss, storageKey]);

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-full bg-ink-800/90 text-white text-xs shadow-modal backdrop-blur-sm flex items-center gap-3 max-w-[90vw]"
      role="status"
      aria-live="polite"
    >
      <span aria-hidden>←</span>
      <span>Swipe to navigate questions</span>
      <span aria-hidden>→</span>
      <button
        type="button"
        onClick={handleDismiss}
        className="ml-1 px-2 py-0.5 rounded-full bg-white/15 hover:bg-white/25 text-white text-xs"
        aria-label="Dismiss swipe hint"
      >
        Got it
      </button>
    </div>
  );
}
