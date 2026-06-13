/**
 * Shared kebab (three-dot) menu primitive.
 *
 * Extracted from the Wave 8B Modules page so every surface with a "tertiary
 * actions" menu — module rows, assignment cards, announcements, discussions,
 * materials, course headers — uses the same visuals and behaviour:
 *
 *   - 6-dot vertical grip icon trigger (40x40px tap target on mobile, 28x28 on
 *     desktop) with the accessible label "More actions".
 *   - Rendered in a PORTAL with fixed positioning, anchored to the trigger, so
 *     an `overflow-hidden`/`overflow-auto` ancestor (e.g. a rounded list) can
 *     never clip it. Flips left/up when it would overflow the viewport edge.
 *   - Max-width-aware (`min-w-[11rem] max-w-[18rem]`) so a single wide label
 *     can't push the menu off-screen; long labels truncate with ellipsis and
 *     expose the full string via `title` on hover.
 *   - Disabled items render in muted slate and no-op on click; pair with the
 *     `hint` field to surface the reason (tooltip).
 *   - Destructive items render in rose-600.
 *   - Closes on outside click, Escape, and on scroll/resize (so the fixed-
 *     positioned menu can't drift away from its trigger).
 *
 * A11y (M27):
 *   - Trigger exposes `aria-haspopup="menu"` + `aria-expanded`.
 *   - Menu container is `role="menu"`; items are `role="menuitem"`.
 *   - Roving tabindex on items: ArrowDown/Up cycles focus, Home/End jump to
 *     first/last, Esc closes + restores focus to trigger, Enter/Space invokes.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

export interface KebabMenuOption {
  label: string;
  /** Optional explanatory tooltip — useful for disabled items (the reason they can't be clicked). */
  hint?: string;
  /** Render the item in a disabled style + no-op the click. */
  disabled?: boolean;
  destructive?: boolean;
  onSelect: () => void;
}

interface Coords {
  top: number;
  left: number;
}

export function KebabMenu({ options }: { options: readonly KebabMenuOption[] }): JSX.Element {
  const [open, setOpen] = useState(false);
  // Fixed-position coords for the portaled menu. `null` until measured —
  // rendered invisibly on first paint, then positioned + revealed (no flicker).
  const [coords, setCoords] = useState<Coords | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  // Active descendant for roving tabindex (-1 = trigger keeps focus, else item index).
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  // Find the first enabled item index — what gets focus on open.
  const firstEnabledIndex = useMemo<number>(() => {
    return options.findIndex((o) => !o.disabled);
  }, [options]);

  // Position the menu (fixed, viewport coords) anchored to the trigger, flipping
  // left/up if it would overflow the right/bottom edge.
  const reposition = useCallback((): void => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    const t = trigger.getBoundingClientRect();
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;
    const gap = 4;
    const margin = 8;

    // Horizontal: right-align to the trigger by default; clamp into viewport.
    let left = t.right - mw;
    if (left < margin) left = Math.min(t.left, window.innerWidth - mw - margin);
    if (left < margin) left = margin;

    // Vertical: below by default; flip above if it would overflow the bottom.
    let top = t.bottom + gap;
    if (top + mh > window.innerHeight - margin) {
      const above = t.top - mh - gap;
      top = above >= margin ? above : Math.max(margin, window.innerHeight - mh - margin);
    }
    setCoords({ top, left });
  }, []);

  useEffect(() => {
    if (!open) {
      setCoords(null);
      setActiveIndex(-1);
      return;
    }
    const onDocClick = (e: MouseEvent): void => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    // A fixed-positioned menu would drift from its trigger on scroll/resize —
    // close instead of chasing it (matches common menu behaviour).
    const onScrollOrResize = (): void => setOpen(false);
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  // Measure + position after the menu mounts.
  useEffect(() => {
    if (!open) return;
    reposition();
  }, [open, reposition]);

  // Focus the first enabled item once positioning is settled.
  useEffect(() => {
    if (!open || coords === null || firstEnabledIndex < 0) return;
    setActiveIndex(firstEnabledIndex);
    itemRefs.current[firstEnabledIndex]?.focus();
  }, [open, coords, firstEnabledIndex]);

  // Move focus when activeIndex changes (after the initial set).
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    itemRefs.current[activeIndex]?.focus();
  }, [open, activeIndex]);

  const nextEnabled = (start: number, dir: 1 | -1): number => {
    const n = options.length;
    if (n === 0) return -1;
    let i = start;
    for (let step = 0; step < n; step++) {
      i = (i + dir + n) % n;
      if (!options[i].disabled) return i;
    }
    return start;
  };

  const firstOrLastEnabled = (which: "first" | "last"): number => {
    const indices = options.map((_, i) => i);
    const ordered = which === "first" ? indices : indices.slice().reverse();
    for (const i of ordered) {
      if (!options[i].disabled) return i;
    }
    return -1;
  };

  const onMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      setActiveIndex((cur) => nextEnabled(cur < 0 ? -1 : cur, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      setActiveIndex((cur) => nextEnabled(cur < 0 ? options.length : cur, -1));
    } else if (e.key === "Home") {
      e.preventDefault();
      e.stopPropagation();
      const i = firstOrLastEnabled("first");
      if (i >= 0) setActiveIndex(i);
    } else if (e.key === "End") {
      e.preventDefault();
      e.stopPropagation();
      const i = firstOrLastEnabled("last");
      if (i >= 0) setActiveIndex(i);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  const invoke = (i: number): void => {
    const opt = options[i];
    if (!opt || opt.disabled) return;
    setOpen(false);
    triggerRef.current?.focus();
    opt.onSelect();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="rounded-md min-h-[40px] min-w-[40px] md:min-h-0 md:min-w-0 md:w-7 md:h-7 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
      >
        <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden>
          <circle cx={3} cy={8} r={1.5} fill="currentColor" />
          <circle cx={8} cy={8} r={1.5} fill="currentColor" />
          <circle cx={13} cy={8} r={1.5} fill="currentColor" />
        </svg>
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            onKeyDown={onMenuKeyDown}
            style={{ position: "fixed", top: coords?.top ?? -9999, left: coords?.left ?? -9999 }}
            className={`z-[100] min-w-[11rem] max-w-[18rem] rounded-md bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-700 shadow-lg py-1 text-sm ${
              coords === null ? "invisible" : ""
            }`}
          >
            {options.map((opt, i) => (
              <button
                key={opt.label}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                type="button"
                role="menuitem"
                tabIndex={i === activeIndex ? 0 : -1}
                title={opt.hint}
                disabled={opt.disabled}
                onMouseEnter={() => {
                  if (!opt.disabled) setActiveIndex(i);
                }}
                onClick={() => invoke(i)}
                className={`block w-full text-left px-3 py-2.5 md:py-1.5 truncate focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 ${
                  opt.disabled
                    ? "text-slate-400 dark:text-slate-600 cursor-not-allowed"
                    : opt.destructive
                      ? "text-rose-600 dark:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                      : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
