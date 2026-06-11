/**
 * ResponsiveModal — the canonical app modal shell, viewport-aware by design.
 * ============================================================================
 * On a phone it's a **bottom sheet** (full-width, anchored to the bottom edge,
 * rounded top, slides up, safe-area padded). On a tablet/desktop it's a
 * **centered card** sized to its content. One component, pure-CSS responsive
 * (`items-end` → `sm:items-center`, `rounded-t-2xl` → `sm:rounded-2xl`) — no
 * JS viewport sniffing — so size, position, and layout are correct on every
 * screen.
 *
 * The CLAUDE.md modal contract is baked in so callers can't forget it:
 *   • role="dialog" + aria-modal + aria-labelledby (from `title`)
 *   • useFocusTrap (focus restored to the opener on close)
 *   • Esc closes, backdrop-click closes (when `dismissible`)
 *   • a ≥40px top-right × close button with aria-label="Close"
 *
 * Layout slots: a sticky header (title + close), a scrollable body, and an
 * optional sticky footer for actions (so primary actions stay reachable on a
 * long mobile sheet). Use `data-autofocus` on a descendant to override the
 * initial focus target (see useFocusTrap).
 */
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useFocusTrap } from "@/hooks";

export type ModalSize = "sm" | "md" | "lg" | "xl";

const SIZE_MAXW: Record<ModalSize, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-2xl",
};

export interface ResponsiveModalProps {
  open: boolean;
  onClose: () => void;
  /** Title text/node — drives the header + the dialog's accessible name. */
  title?: ReactNode;
  /** Sub-line under the title (e.g. the course name). */
  subtitle?: ReactNode;
  /** Desktop max-width. Mobile is always full-width. Default "md". */
  size?: ModalSize;
  /** Esc + backdrop close. Default true. Set false for a forced choice. */
  dismissible?: boolean;
  /** Hide the × button (e.g. a confirm that owns its own Cancel). Default false. */
  hideClose?: boolean;
  /** Sticky footer — typically the action buttons. */
  footer?: ReactNode;
  /** Extra classes for the panel (rarely needed). */
  panelClassName?: string;
  children: ReactNode;
  /** Ref to the dialog panel, if the caller needs it. */
  panelRef?: RefObject<HTMLDivElement | null>;
}

export function ResponsiveModal({
  open,
  onClose,
  title,
  subtitle,
  size = "md",
  dismissible = true,
  hideClose = false,
  footer,
  panelClassName = "",
  children,
  panelRef: externalPanelRef,
}: ResponsiveModalProps): JSX.Element | null {
  const internalRef = useRef<HTMLDivElement | null>(null);
  const panelRef = externalPanelRef ?? internalRef;
  const titleId = useId();
  useFocusTrap(panelRef, open);

  // Entrance transition: mount hidden, flip to shown on the next frame so the
  // sheet slides up (mobile) / card fades+scales in (desktop). Entrance-only —
  // exit is immediate (the component unmounts on close).
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!open) {
      setShown(false);
      return;
    }
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Esc to close (document-level so it works regardless of inner focus).
  useEffect(() => {
    if (!open || !dismissible) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, dismissible, onClose]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-slate-900/50 backdrop-blur-sm transition-opacity duration-200 sm:p-4 ${
        shown ? "opacity-100" : "opacity-0"
      }`}
      onClick={dismissible ? onClose : undefined}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title != null ? titleId : undefined}
        onClick={(e) => e.stopPropagation()}
        className={[
          "relative flex w-full flex-col overflow-hidden bg-white shadow-2xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800",
          // mobile: bottom sheet
          "max-h-[92dvh] rounded-t-2xl",
          // desktop: centered card
          `sm:max-h-[85vh] sm:rounded-2xl ${SIZE_MAXW[size]}`,
          // entrance: slide up on mobile, fade+scale on desktop
          "will-change-transform motion-safe:transition motion-safe:duration-200",
          shown
            ? "translate-y-0 opacity-100 sm:scale-100"
            : "translate-y-full opacity-0 sm:translate-y-0 sm:scale-95",
          panelClassName,
        ].join(" ")}
      >
        {/* mobile grab affordance */}
        <div className="flex justify-center pt-2 sm:hidden" aria-hidden>
          <span className="h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-700" />
        </div>

        {(title != null || !hideClose) && (
          <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-3 sm:border-b sm:border-slate-200 sm:pt-4 dark:sm:border-slate-800">
            <div className="min-w-0">
              {title != null && (
                <h2
                  id={titleId}
                  className="text-base font-semibold text-slate-900 dark:text-slate-100"
                >
                  {title}
                </h2>
              )}
              {subtitle != null && (
                <div className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                  {subtitle}
                </div>
              )}
            </div>
            {!hideClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="grid h-10 w-10 flex-none place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-slate-800"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* scrollable body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer != null && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] dark:border-slate-800 sm:pb-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
