import { useEffect, type RefObject } from "react";

/**
 * Trap Tab/Shift+Tab focus within a container while it's mounted.
 * Standard a11y pattern for modal dialogs (WCAG 2.4.3).
 *
 * Usage:
 *   const dialogRef = useRef<HTMLDivElement>(null);
 *   useFocusTrap(dialogRef, open);
 *
 * The hook:
 *   - Saves the previously focused element on mount/open
 *   - Moves focus into the dialog
 *   - Intercepts Tab/Shift+Tab to cycle within the dialog
 *   - Restores focus to the prior element on unmount/close
 *
 * The `active` flag lets you gate the trap on modal open state without
 * needing to mount/unmount the component.
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean = true,
): void {
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const previousFocus = document.activeElement as HTMLElement | null;

    // Find the first focusable element and move focus there.
    const getFocusable = () => {
      return Array.from(
        container.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("aria-hidden") && el.offsetParent !== null);
    };

    const initialFocusable = getFocusable();
    const initialTarget =
      container.querySelector<HTMLElement>("[data-autofocus]") ??
      initialFocusable[0] ??
      container;
    // Make the container focusable as a last resort.
    if (initialTarget === container && !container.hasAttribute("tabindex")) {
      container.setAttribute("tabindex", "-1");
    }
    requestAnimationFrame(() => initialTarget.focus());

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusable = getFocusable();
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeEl = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (activeEl === first || !container.contains(activeEl)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (activeEl === last || !container.contains(activeEl)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Restore focus to the prior element.
      if (previousFocus && typeof previousFocus.focus === "function") {
        previousFocus.focus();
      }
    };
  }, [active, containerRef]);
}
