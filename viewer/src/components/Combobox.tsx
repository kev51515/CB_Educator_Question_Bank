/**
 * Combobox — a searchable single-select to replace native `<select>` for entity
 * pickers and long option lists (the CLAUDE.md "combobox with type-to-filter"
 * standard).
 *
 * A button trigger shows the current selection; opening reveals a type-to-filter
 * input (auto-shown once the list is longer than `searchThreshold`) over a
 * roving-focus listbox. Keyboard: ↑/↓ move, Home/End jump, Enter selects, Esc
 * closes + restores focus to the trigger; typing filters. Closes on outside
 * click. Flips above the trigger when there isn't room below (KebabMenu's
 * post-layout measurement). Option rows are ≥40px touch targets; the popover
 * matches the trigger width and scrolls.
 *
 * a11y: trigger is aria-haspopup="listbox" + aria-expanded + aria-controls;
 * the list is role="listbox"; options are role="option" with aria-selected.
 */
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

export interface ComboboxOption {
  value: string;
  label: string;
  /** Optional second line shown under the label. */
  description?: string;
  disabled?: boolean;
}

export interface ComboboxProps {
  value: string | null;
  onChange: (value: string) => void;
  options: ReadonlyArray<ComboboxOption>;
  /** Trigger text when nothing is selected. */
  placeholder?: string;
  searchPlaceholder?: string;
  ariaLabel?: string;
  id?: string;
  disabled?: boolean;
  /** Classes for the trigger button (e.g. width). Defaults to full-width. */
  className?: string;
  emptyText?: string;
  /** Show the filter input only when there are more than this many options. Default 7. */
  searchThreshold?: number;
}

export function Combobox({
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Type to filter…",
  ariaLabel,
  id,
  disabled = false,
  className = "",
  emptyText = "No matches",
  searchThreshold = 7,
}: ComboboxProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [dropUp, setDropUp] = useState(false);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const optionRefs = useRef<Array<HTMLLIElement | null>>([]);
  const listboxId = useId();

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const showSearch = options.length > searchThreshold;

  const close = (focusTrigger: boolean): void => {
    setOpen(false);
    setQuery("");
    if (focusTrigger) triggerRef.current?.focus();
  };

  // Open: seed the active row to the current selection, reset filter.
  const openMenu = (): void => {
    if (disabled) return;
    const idx = Math.max(0, filtered.findIndex((o) => o.value === value));
    setActiveIndex(idx);
    setOpen(true);
  };

  // Decide drop direction once open, from the trigger's viewport position.
  useLayoutEffect(() => {
    if (!open) return;
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) {
      const below = window.innerHeight - r.bottom;
      setDropUp(below < 280 && r.top > below);
    }
    // focus the search input (or the list) once open
    if (showSearch) inputRef.current?.focus();
    else listRef.current?.focus();
  }, [open, showSearch]);

  // Keep the active row clamped + scrolled into view as the filter narrows.
  useEffect(() => {
    if (!open) return;
    setActiveIndex((i) => Math.min(i, Math.max(0, filtered.length - 1)));
  }, [filtered.length, open]);
  useEffect(() => {
    if (open) optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  // Outside click closes.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const choose = (opt: ComboboxOption): void => {
    if (opt.disabled) return;
    onChange(opt.value);
    close(true);
  };

  const onListKeyDown = (e: ReactKeyboardEvent): void => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => Math.min(filtered.length - 1, i + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(filtered.length - 1);
        break;
      case "Enter":
        e.preventDefault();
        if (filtered[activeIndex]) choose(filtered[activeIndex]);
        break;
      case "Escape":
        e.preventDefault();
        close(true);
        break;
      default:
        break;
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            openMenu();
          }
        }}
        className={[
          "inline-flex w-full min-h-[40px] items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-800 shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-600",
          className,
        ].join(" ")}
      >
        <span className={`truncate ${selected ? "" : "text-slate-400 dark:text-slate-500"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden
          className={`flex-none text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          className={`absolute left-0 right-0 z-50 ${dropUp ? "bottom-full mb-1" : "top-full mt-1"} overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700`}
        >
          {showSearch && (
            <div className="border-b border-slate-100 p-2 dark:border-slate-800">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onListKeyDown}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                className="w-full rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          )}
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            tabIndex={showSearch ? -1 : 0}
            aria-label={ariaLabel}
            aria-activedescendant={filtered[activeIndex] ? `${listboxId}-${activeIndex}` : undefined}
            onKeyDown={showSearch ? undefined : onListKeyDown}
            className="max-h-64 overflow-y-auto py-1 focus:outline-none"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-center text-xs text-slate-400 dark:text-slate-500">
                {emptyText}
              </li>
            ) : (
              filtered.map((opt, i) => {
                const isSelected = opt.value === value;
                const isActive = i === activeIndex;
                return (
                  <li
                    key={opt.value}
                    id={`${listboxId}-${i}`}
                    ref={(el) => {
                      optionRefs.current[i] = el;
                    }}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={opt.disabled || undefined}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => choose(opt)}
                    className={`flex min-h-[40px] cursor-pointer items-center gap-2 px-3 py-2 text-sm ${
                      opt.disabled
                        ? "cursor-not-allowed opacity-50"
                        : isActive
                          ? "bg-indigo-50 text-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-100"
                          : "text-slate-700 dark:text-slate-200"
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{opt.label}</span>
                      {opt.description && (
                        <span className="block truncate text-xs text-slate-400 dark:text-slate-500">
                          {opt.description}
                        </span>
                      )}
                    </span>
                    {isSelected && (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-none text-indigo-600 dark:text-indigo-400" aria-hidden>
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
