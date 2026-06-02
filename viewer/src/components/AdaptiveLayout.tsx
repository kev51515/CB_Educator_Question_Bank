import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useFocusTrap } from "../hooks";

export type LayoutMode = "mobile" | "tablet" | "desktop";

interface AdaptiveLayoutState {
  mode: LayoutMode;
  showFilters: boolean;
  showList: boolean;
  showDetail: boolean;
}

const MOBILE_QUERY = "(max-width: 699.98px)";
const TABLET_QUERY = "(min-width: 700px) and (max-width: 1099.98px)";

function readMode(): LayoutMode {
  if (typeof window === "undefined" || !window.matchMedia) return "desktop";
  if (window.matchMedia(MOBILE_QUERY).matches) return "mobile";
  if (window.matchMedia(TABLET_QUERY).matches) return "tablet";
  return "desktop";
}

function stateFromMode(mode: LayoutMode): AdaptiveLayoutState {
  switch (mode) {
    case "mobile":
      // One pane at a time; consumers will toggle which is visible.
      return { mode, showFilters: false, showList: true, showDetail: false };
    case "tablet":
      // 2-pane: list + detail. Filters are in a drawer (not shown by default).
      return { mode, showFilters: false, showList: true, showDetail: true };
    case "desktop":
    default:
      return { mode, showFilters: true, showList: true, showDetail: true };
  }
}

/**
 * Hook that reports an adaptive layout mode based on viewport width and
 * which panes are visible by default for that mode.
 */
export function useAdaptiveLayout(): AdaptiveLayoutState {
  const [mode, setMode] = useState<LayoutMode>(() => readMode());

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const mqMobile = window.matchMedia(MOBILE_QUERY);
    const mqTablet = window.matchMedia(TABLET_QUERY);

    const update = () => setMode(readMode());

    // Modern browsers: addEventListener; older Safari: addListener.
    const add = (mq: MediaQueryList, fn: () => void) => {
      if (typeof mq.addEventListener === "function") {
        mq.addEventListener("change", fn);
      } else {
        mq.addListener(fn);
      }
    };
    const remove = (mq: MediaQueryList, fn: () => void) => {
      if (typeof mq.removeEventListener === "function") {
        mq.removeEventListener("change", fn);
      } else {
        mq.removeListener(fn);
      }
    };

    add(mqMobile, update);
    add(mqTablet, update);

    return () => {
      remove(mqMobile, update);
      remove(mqTablet, update);
    };
  }, []);

  return stateFromMode(mode);
}

// ─── FilterDrawer ────────────────────────────────────────────────────────

interface FilterDrawerProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Slide-out left drawer that holds the filter sidebar (used in tablet layout).
 */
export function FilterDrawer({
  open,
  onClose,
  children,
}: FilterDrawerProps): JSX.Element | null {
  const titleId = useId();
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const [entered, setEntered] = useState(false);

  useFocusTrap(dialogRef, open);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const id = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(id);
  }, [open]);

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

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const handleBackdrop = useCallback(() => onClose(), [onClose]);

  if (!open) return null;

  const translateX = entered ? 0 : -320;

  return (
    <div className="fixed inset-0 z-30" aria-hidden={false}>
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close filters"
        tabIndex={-1}
        onClick={handleBackdrop}
        className="absolute inset-0 bg-ink-800/25 backdrop-blur-sm"
        style={{
          opacity: entered ? 1 : 0,
          transition: "opacity 200ms ease",
        }}
      />

      {/* Drawer */}
      <aside
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute top-0 left-0 bottom-0 w-[min(320px,85vw)] bg-white shadow-modal flex flex-col border-r border-ink-150 dark:bg-ink-800 dark:border-ink-700"
        style={{
          transform: `translateX(${translateX}px)`,
          transition: "transform 240ms cubic-bezier(0.32, 0.72, 0, 1)",
          willChange: "transform",
        }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-ink-150 dark:border-ink-700">
          <h2
            id={titleId}
            className="text-base font-semibold text-ink-800 dark:text-ink-100"
          >
            Filters
          </h2>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close filters"
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
        <div className="flex-1 overflow-y-auto thin-scrollbar">{children}</div>
      </aside>
    </div>
  );
}
