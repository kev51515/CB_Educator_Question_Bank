/**
 * Shared kebab (three-dot) menu primitive.
 *
 * Extracted from the Wave 8B Modules page so every surface with a "tertiary
 * actions" menu — module rows, assignment cards, announcements, discussions,
 * materials, course headers — uses the same visuals and behaviour:
 *
 *   - 6-dot vertical grip icon trigger (40x40px tap target on mobile, 28x28 on
 *     desktop) with the accessible label "More actions".
 *   - Anchored bottom-right by default; flips to bottom-left if the menu
 *     would overflow the right viewport edge (cards flush with page edges).
 *   - Max-width-aware (`min-w-[11rem] max-w-[18rem]`) so a single wide label
 *     can't push the menu off-screen; long labels truncate with ellipsis and
 *     expose the full string via `title` on hover.
 *   - Disabled items render in muted slate and no-op on click; pair with the
 *     `hint` field to surface the reason (tooltip).
 *   - Destructive items render in rose-600.
 *   - Closes on outside click + Escape; opens/closes on trigger click.
 *
 * A11y (M27):
 *   - Trigger exposes `aria-haspopup="menu"` + `aria-expanded`.
 *   - Menu container is `role="menu"`; items are `role="menuitem"`.
 *   - Roving tabindex on items: ArrowDown/Up cycles focus, Home/End jump to
 *     first/last, Esc closes + restores focus to trigger, Enter/Space invokes.
 *
 * Consumers supply an options array; this component owns all the open-state,
 * outside-click, escape-to-close and overflow-flip logic.
 */
import { useEffect, useMemo, useRef, useState, type JSX, type KeyboardEvent as ReactKeyboardEvent } from "react";

export interface KebabMenuOption {
  label: string;
  /** Optional explanatory tooltip — useful for disabled items (the reason they can't be clicked). */
  hint?: string;
  /** Render the item in a disabled style + no-op the click. */
  disabled?: boolean;
  destructive?: boolean;
  onSelect: () => void;
}

/**
 * Tiny presentational kebab menu. Closes on outside click + Escape.
 *
 * Positioning: anchored to the bottom-right of the trigger by default
 * (most kebabs live at the right edge of a row). After mount we measure
 * viewport position and flip to bottom-left if the menu would overflow the
 * window on the right edge. Closes on outside click + Escape.
 */
export function KebabMenu({ options }: { options: readonly KebabMenuOption[] }): JSX.Element {
  const [open, setOpen] = useState(false);
  // `null` until we've measured; rendered invisibly on first paint, then
  // re-positioned and revealed. Avoids a one-frame flicker on the wrong side.
  const [side, setSide] = useState<"right" | "left" | null>(null);
  // Vertical flip: open up if menu would overflow the bottom of the viewport
  // (e.g. last row on the page). `null` mirrors the invisible-first-paint
  // pattern used by horizontal `side`.
  const [vside, setVside] = useState<"down" | "up" | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  // Active descendant for roving tabindex (-1 = trigger keeps focus, else item index).
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  // Find the first enabled item index — what gets focus on open.
  const firstEnabledIndex = useMemo<number>(() => {
    return options.findIndex((o) => !o.disabled);
  }, [options]);

  useEffect(() => {
    if (!open) {
      setSide(null);
      setVside(null);
      setActiveIndex(-1);
      return;
    }
    const onDocClick = (e: MouseEvent): void => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        setOpen(false);
        // Restore focus to trigger.
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Measure after layout: if the right edge of the menu would overflow the
  // viewport (e.g. kebab sits in a card flush with the page edge), flip to
  // left-anchored. Runs once per open via a layout-effect-style timeout.
  useEffect(() => {
    if (!open || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    if (rect.right > window.innerWidth - 8) {
      setSide("left");
    } else {
      setSide("right");
    }
    if (rect.bottom > window.innerHeight - 8) {
      setVside("up");
    } else {
      setVside("down");
    }
  }, [open]);

  // Focus the first enabled item once positioning is settled.
  useEffect(() => {
    if (!open) return;
    if (side === null || vside === null) return;
    if (firstEnabledIndex < 0) return;
    setActiveIndex(firstEnabledIndex);
    const el = itemRefs.current[firstEnabledIndex];
    el?.focus();
  }, [open, side, vside, firstEnabledIndex]);

  // Move focus when activeIndex changes (after the initial set).
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const el = itemRefs.current[activeIndex];
    el?.focus();
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
      // Tab closes the menu and lets focus move naturally.
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
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          // Allow ArrowDown/ArrowUp/Enter/Space to open + focus first item.
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
      {open && (
        <div
          ref={menuRef}
          role="menu"
          onKeyDown={onMenuKeyDown}
          // Max-width-aware: comfortable for normal labels, capped so a wide
          // edge case can't push beyond the viewport. Items truncate with
          // ellipsis if their label exceeds; the `title` attribute exposes
          // the full string on hover.
          className={`absolute z-50 min-w-[11rem] max-w-[18rem] rounded-md bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-700 shadow-lg py-1 text-sm ${
            side === "left" ? "left-0" : "right-0"
          } ${vside === "up" ? "bottom-full mb-1" : "top-full mt-1"} ${side === null || vside === null ? "invisible" : ""}`}
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
              title={opt.hint ?? opt.label}
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
        </div>
      )}
    </div>
  );
}
