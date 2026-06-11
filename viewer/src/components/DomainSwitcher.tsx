/**
 * DomainSwitcher — top-bar control for the active product-vertical DOMAIN.
 *
 * Shows the current domain (a small accent-themed chip) and, on click, opens a
 * menu to switch between Academic / Counseling / Coaching. Switching calls
 * `setDomain` from the DomainProvider, which optimistically re-themes the accent
 * and persists via the `set_my_domain` RPC.
 *
 * The chip label is `educatorLabel(domain)` (Teacher / Counselor / Coach), since
 * the switcher only mounts in the educator + student shells where surfacing the
 * educator-facing vocabulary is the point. The provider also exposes the home
 * noun via `vocab.homeNoun` for callers that want the vertical name instead.
 *
 * A11y: trigger exposes `aria-haspopup="menu"` + `aria-expanded`; the menu is
 * `role="menu"` with `role="menuitemradio"` items (one is `aria-checked`).
 * Roving focus: ArrowUp/Down cycle, Home/End jump, Esc closes + restores focus
 * to the trigger, Enter/Space selects. Closes on outside click + Escape. The
 * trigger is a ≥40px tap target.
 */
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useDomain } from "@/lib/DomainProvider";
import {
  DOMAIN_VOCAB,
  accentRampFor,
  educatorLabel,
  type Domain,
} from "@/lib/domain";
import { getUiTheme } from "@/lib/theme";

/** Small filled dot in the active accent, marking the chip + each option. */
function DomainDot({ domain }: { domain: Domain }) {
  // Per-domain swatch (independent of the live accent vars so the menu shows
  // each option's true color even while a different domain is active) —
  // theme-aware so ivy shows navy/forest/bronze, classic indigo/emerald/orange.
  const color = accentRampFor(getUiTheme(), domain)["600"];
  return (
    <span
      aria-hidden
      className="h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

/** Menu width — keep in sync with the `w-52` on the menu (52 × 4px = 208). */
const MENU_WIDTH = 208;

export function DomainSwitcher({
  labels = "educator",
}: {
  /**
   * Which vocabulary the chip + menu use:
   *   'educator' — Teacher / Counselor / Coach (staff shell: "which hat am I
   *                wearing"), the historical default.
   *   'home'     — Academics / Counseling / Coaching (student shell: a student
   *                switches which AREA they're looking at, not a role — a
   *                "Teacher" pill on a student screen reads as a bug).
   */
  labels?: "educator" | "home";
}) {
  const labelOf = (d: Domain): string =>
    labels === "home" ? DOMAIN_VOCAB[d].homeNoun : educatorLabel(d);
  const { domain, setDomain, availableDomains } = useDomain();
  // Only offer the domains this user participates in (taught + shared +
  // enrolled courses; admins get all three). While the set is still loading
  // (null), or when there's only one domain, the control renders as a static
  // chip — a student in academic classes is never shown Counseling/Coaching.
  const options: readonly Domain[] = availableDomains ?? [domain];
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  // Horizontal alignment of the popup. Default right-aligned (correct for a
  // top-bar control), but flip to left-aligned when the trigger sits so close
  // to the left edge that a right-aligned menu would spill off-screen — which
  // is exactly what happens in the narrow left nav rail. Computed on open from
  // the trigger's viewport position so BOTH mount contexts stay on-screen.
  const [align, setAlign] = useState<"left" | "right">("right");

  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const computeAlign = (): "left" | "right" => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return "right";
    // A right-aligned menu starts at (trigger.right − MENU_WIDTH). If that would
    // land off (or within 8px of) the left viewport edge, left-align instead.
    return r.right - MENU_WIDTH < 8 ? "left" : "right";
  };

  // Outside-click + Escape to close; restore focus to the trigger on Escape.
  useEffect(() => {
    if (!open) {
      setActiveIndex(-1);
      return;
    }
    const onDocClick = (e: MouseEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        setOpen(false);
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

  // Focus the active item as the roving index moves.
  useEffect(() => {
    if (open && activeIndex >= 0) {
      itemRefs.current[activeIndex]?.focus();
    }
  }, [open, activeIndex]);

  const openMenu = (focusIndex: number): void => {
    setAlign(computeAlign());
    setOpen(true);
    setActiveIndex(focusIndex);
  };

  const choose = (next: Domain): void => {
    setDomain(next);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onTriggerKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>): void => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openMenu(Math.max(0, options.indexOf(domain)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      openMenu(options.length - 1);
    }
  };

  const onItemKeyDown = (
    e: ReactKeyboardEvent<HTMLButtonElement>,
    index: number,
  ): void => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((index + 1) % options.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((index - 1 + options.length) % options.length);
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        choose(options[index]);
        break;
      default:
        break;
    }
  };

  // Single-domain users (and the pre-load window) get a static chip: same
  // look, no menu affordance — there is nothing to switch to.
  if (options.length <= 1) {
    return (
      <span
        className="inline-flex items-center gap-2 min-h-[40px] rounded-full px-3 py-1.5 text-sm font-medium bg-accent-50 text-accent-700 ring-1 ring-accent-200 dark:bg-accent-950/40 dark:text-accent-200 dark:ring-accent-900"
        aria-label={`Domain: ${labelOf(domain)}`}
      >
        <DomainDot domain={domain} />
        <span className="truncate max-w-[8rem]">{labelOf(domain)}</span>
      </span>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu(Math.max(0, options.indexOf(domain))))}
        onKeyDown={onTriggerKeyDown}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Active domain: ${labelOf(domain)}. Switch domain`}
        className="inline-flex items-center gap-2 min-h-[40px] rounded-full px-3 py-1.5 text-sm font-medium bg-accent-50 text-accent-700 ring-1 ring-accent-200 hover:bg-accent-100 dark:bg-accent-950/40 dark:text-accent-200 dark:ring-accent-900 motion-safe:transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
      >
        <DomainDot domain={domain} />
        <span className="truncate max-w-[8rem]">{labelOf(domain)}</span>
        <svg
          aria-hidden
          width={14}
          height={14}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={open ? "rotate-180 motion-safe:transition-transform" : "motion-safe:transition-transform"}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Switch domain"
          className={`absolute ${align === "left" ? "left-0" : "right-0"} z-50 mt-2 w-52 overflow-hidden rounded-xl bg-white dark:bg-slate-900 shadow-xl ring-1 ring-slate-200 dark:ring-slate-700`}
        >
          <p className="px-3 pt-2.5 pb-1 text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Domain
          </p>
          {options.map((d, index) => {
            const checked = d === domain;
            return (
              <button
                key={d}
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={checked}
                tabIndex={activeIndex === index ? 0 : -1}
                onClick={() => choose(d)}
                onKeyDown={(e) => onItemKeyDown(e, index)}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 min-h-[40px] text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus-visible:bg-slate-50 dark:focus-visible:bg-slate-800"
              >
                <DomainDot domain={d} />
                <span className="flex-1 truncate">{labelOf(d)}</span>
                {checked && (
                  <svg
                    aria-hidden
                    width={16}
                    height={16}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-accent-600 dark:text-accent-400"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
