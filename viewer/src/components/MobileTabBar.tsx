/**
 * MobileTabBar
 * ============
 * Bottom tab bar shown only on small viewports (≤899px). Switches between
 * the three panels (filters / list / detail) which on desktop are visible
 * side-by-side.
 *
 * Hidden in print preview (`.print:hidden` Tailwind class) so the bar
 * never appears in a printed worksheet.
 */
import type { ReactNode } from "react";

type Tab = "filters" | "list" | "detail";

interface MobileTabBarProps {
  /** Currently-active mobile tab. */
  tab: Tab;
  /** Called when user taps a different tab. */
  onChange: (t: Tab) => void;
  /** Number of items currently visible in the list (after filters), for badge display. */
  listCount: number;
  /** Whether the filter setup is complete enough to show the list count. */
  setupComplete: boolean;
}

export function MobileTabBar({ tab, onChange, listCount, setupComplete }: MobileTabBarProps) {
  return (
    <nav
      className="shrink-0 border-t border-ink-150 bg-white/85 backdrop-blur-xl flex print:hidden"
      aria-label="Sections"
    >
      <TabButton id="filters" label="Filters" active={tab === "filters"} onSelect={onChange}>
        <FiltersIcon />
      </TabButton>
      <TabButton
        id="list"
        label="List"
        badge={setupComplete ? listCount.toLocaleString() : undefined}
        active={tab === "list"}
        onSelect={onChange}
      >
        <ListIcon />
      </TabButton>
      <TabButton id="detail" label="Question" active={tab === "detail"} onSelect={onChange}>
        <DocumentIcon />
      </TabButton>
    </nav>
  );
}

interface TabButtonProps {
  id: Tab;
  label: string;
  badge?: string;
  active: boolean;
  onSelect: (id: Tab) => void;
  children: ReactNode;
}

function TabButton({ id, label, badge, active, onSelect, children }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className={
        "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-colors " +
        (active ? "text-accent-700" : "text-ink-500 hover:text-ink-800")
      }
      aria-current={active ? "page" : undefined}
    >
      <span className="w-5 h-5 flex items-center justify-center">{children}</span>
      <span className="text-[10.5px] font-medium tracking-tight">
        {label}
        {badge != null && (
          <span className={"ml-1 " + (active ? "text-accent-500" : "text-ink-400")}>{badge}</span>
        )}
      </span>
    </button>
  );
}

// ---------- Icons (kept inline to avoid an extra dep) ----------

function FiltersIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="6" y1="12" x2="18" y2="12" />
      <line x1="9" y1="18" x2="15" y2="18" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <circle cx="4" cy="6" r="1" />
      <circle cx="4" cy="12" r="1" />
      <circle cx="4" cy="18" r="1" />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}
