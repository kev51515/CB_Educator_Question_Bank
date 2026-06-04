import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useFocusTrap } from "@/hooks";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxHeight?: string; // CSS value, default "75vh"
}

/**
 * Mobile-native bottom sheet that slides up from the bottom.
 * Supports drag-down-to-dismiss, backdrop click, and Escape.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
  maxHeight = "75vh",
}: BottomSheetProps): JSX.Element | null {
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useFocusTrap(sheetRef, open);

  // Slide-up animation: start translated down, then snap to 0.
  const [entered, setEntered] = useState(false);
  // Drag offset while user is dragging the sheet down.
  const [dragY, setDragY] = useState(0);
  const dragStartYRef = useRef<number | null>(null);
  const draggingRef = useRef(false);

  // Mount transition: trigger reflow then enter.
  useEffect(() => {
    if (!open) {
      setEntered(false);
      setDragY(0);
      return;
    }
    // Ensure starting transform is committed before transitioning in.
    const id = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  // Escape to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Body scroll lock while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Drag-down handlers.
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    dragStartYRef.current = e.touches[0].clientY;
    draggingRef.current = true;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!draggingRef.current || dragStartYRef.current === null) return;
    const dy = e.touches[0].clientY - dragStartYRef.current;
    if (dy > 0) {
      setDragY(dy);
    } else {
      setDragY(0);
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const dy = dragY;
    dragStartYRef.current = null;
    if (dy > 100) {
      onClose();
    } else {
      setDragY(0);
    }
  }, [dragY, onClose]);

  if (!open) return null;

  // Compose transform: enter state + active drag offset.
  const translateY = entered ? Math.max(0, dragY) : window.innerHeight || 1000;
  const transform = `translateY(${translateY}px)`;
  // Reduce transition while dragging for responsive feel.
  const transition = draggingRef.current
    ? "none"
    : "transform 240ms cubic-bezier(0.32, 0.72, 0, 1)";

  return (
    <div
      className="fixed inset-0 z-30"
      aria-hidden={false}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-ink-800/25 backdrop-blur-sm"
        style={{
          opacity: entered ? 1 : 0,
          transition: "opacity 200ms ease",
        }}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute left-0 right-0 bottom-0 bg-white rounded-t-2xl shadow-modal flex flex-col dark:bg-ink-800"
        style={{
          maxHeight,
          transform,
          transition,
          willChange: "transform",
        }}
      >
        {/* Drag handle area (touch listeners live here & header) */}
        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
          className="select-none"
        >
          <div
            className="w-10 h-1 rounded-full bg-ink-300 mx-auto mt-2"
            aria-hidden
          />
          <div className="flex items-center justify-between px-4 py-3 border-b border-ink-150 dark:border-ink-700">
            <h2
              id={titleId}
              className="text-base font-semibold text-ink-800 dark:text-ink-100"
            >
              {title}
            </h2>
            <button
              ref={closeBtnRef}
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-1.5 rounded-full text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-700"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 20 20"
                fill="none"
                aria-hidden
              >
                <path
                  d="M5 5l10 10M15 5L5 15"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Content (scrollable) */}
        <div className="overflow-y-auto flex-1 px-4 py-3 thin-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
}
