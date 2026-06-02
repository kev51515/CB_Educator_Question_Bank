/**
 * SidebarStatusFilter
 * ===================
 * Renders the "Status" facet section in the Sidebar — three toggleable rows
 * for Bookmarked / Done / In print set, each with its own coloured dot and
 * total count. The section is hidden entirely when no questions are in any of
 * those states AND the user has no active status filters, matching the
 * pre-refactor behavior.
 *
 * Each row is implemented by the local `StatusRow` component (kept private to
 * this file because it's only ever used here — it has a coloured tone dot
 * that doesn't apply to the generic `CheckRow`).
 *
 * Props:
 *   - `bookmarks` / `done` / `selected` — Sets used purely to derive counts
 *   - `status`   — the active `StatusFilter` set from `Filters`
 *   - `onToggle` — invoked with the toggled status; parent is responsible for
 *     producing the new `Filters` object
 */
import type { StatusFilter } from "@/types";
import { Section } from "@/components/SidebarShared";

interface SidebarStatusFilterProps {
  bookmarks: Set<string>;
  done: Set<string>;
  selected: Set<string>;
  status: Set<StatusFilter>;
  onToggle: (s: StatusFilter) => void;
}

export function SidebarStatusFilter({
  bookmarks,
  done,
  selected,
  status,
  onToggle,
}: SidebarStatusFilterProps) {
  const anyContent =
    bookmarks.size > 0 || done.size > 0 || selected.size > 0 || status.size > 0;
  if (!anyContent) return null;
  return (
    <Section label="Status">
      <StatusRow
        label="Bookmarked"
        count={bookmarks.size}
        checked={status.has("bookmarked")}
        onChange={() => onToggle("bookmarked")}
        tone="amber"
      />
      <StatusRow
        label="Done"
        count={done.size}
        checked={status.has("done")}
        onChange={() => onToggle("done")}
        tone="emerald"
      />
      <StatusRow
        label="In print set"
        count={selected.size}
        checked={status.has("selected")}
        onChange={() => onToggle("selected")}
        tone="accent"
      />
    </Section>
  );
}

interface StatusRowProps {
  label: string;
  count: number;
  checked: boolean;
  onChange: () => void;
  tone: "amber" | "emerald" | "accent";
}

function StatusRow({ label, count, checked, onChange, tone }: StatusRowProps) {
  const dot =
    tone === "amber"
      ? "bg-amber-500"
      : tone === "emerald"
        ? "bg-emerald-500"
        : "bg-accent-500";
  const isZero = count === 0 && !checked;
  return (
    <label
      className={
        "group flex items-center gap-2.5 px-2.5 py-1 rounded-md transition-colors select-none " +
        (isZero ? "cursor-default opacity-55" : "cursor-pointer hover:bg-ink-200/60")
      }
    >
      <span
        className={
          "relative inline-flex items-center justify-center w-[16px] h-[16px] rounded-[4px] border transition-colors " +
          (checked
            ? "bg-accent-600 border-accent-600"
            : "bg-white border-ink-300 group-hover:border-ink-400")
        }
        aria-hidden
      >
        {checked && (
          <svg viewBox="0 0 16 16" className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3.5,8.5 6.5,11.5 12.5,5" />
          </svg>
        )}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={isZero}
        className="sr-only"
        aria-label={label}
      />
      <span className={"inline-block w-1.5 h-1.5 rounded-full " + dot} aria-hidden />
      <span className={"flex-1 truncate text-[13px] " + (checked ? "text-ink-800" : "text-ink-700")}>
        {label}
      </span>
      <span className="tabular-nums text-[12px] text-ink-400 group-hover:text-ink-600">
        {count.toLocaleString()}
      </span>
    </label>
  );
}
