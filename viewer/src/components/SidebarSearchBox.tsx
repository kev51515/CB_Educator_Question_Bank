/**
 * SidebarSearchBox
 * ================
 * The search input rendered above the facet sections inside the Sidebar.
 *
 * Owns:
 *   - The search `<input type="search">` (controlled by the parent `Filters`
 *     object via `value` / `onChange`)
 *   - A small "?" trigger button that opens the DSL help popover so users can
 *     discover advanced query syntax (#number, skill:, domain:, …)
 *   - Local state for whether that popover is open
 *
 * The optional `inputRef` is forwarded to the underlying `<input>` so the
 * parent App can focus it via the keyboard-shortcut layer.
 */
import { useState } from "react";
import { DslHelpPopover } from "@/components/FilterDSL";

interface SidebarSearchBoxProps {
  value: string;
  onChange: (v: string) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

export function SidebarSearchBox({ value, onChange, inputRef }: SidebarSearchBoxProps) {
  const [dslHelpOpen, setDslHelpOpen] = useState(false);
  return (
    <div className="relative mb-6">
      <svg
        viewBox="0 0 24 24"
        className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.5" y2="16.5" />
      </svg>
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search #number, skill, or text…"
        className="w-full pl-8 pr-9 py-2 rounded-lg text-[13px] bg-white border border-ink-200 placeholder:text-ink-450 focus:outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100 transition"
      />
      <button
        type="button"
        onClick={() => setDslHelpOpen((v) => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded text-ink-400 hover:text-ink-700 hover:bg-ink-100 text-[11px] focus-ring transition-colors"
        aria-label="Search syntax help"
        data-tooltip="Search syntax help"
      >
        ?
      </button>
      <DslHelpPopover open={dslHelpOpen} onClose={() => setDslHelpOpen(false)} />
    </div>
  );
}
