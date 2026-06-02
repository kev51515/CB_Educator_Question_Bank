/**
 * SidebarSetToggle
 * ================
 * The "Question Set" segmented control rendered at the top of the Sidebar
 * whenever the user has more than one saved set available (i.e. the original
 * bank + at least one custom set).
 *
 * Acts as a radiogroup (role="radiogroup" with role="radio" children) so
 * screen readers announce the active set correctly. The `data-testid` value
 * "set-toggle" is depended on by the e2e suite — do not rename.
 *
 * Props mirror the matching slice of `SidebarProps`:
 *   - `availableSets` — the list of selectable sets (id + display label)
 *   - `setId`          — id of the currently active set
 *   - `onSetChange`    — handler invoked when the user picks a different set
 *
 * The component intentionally returns `null` when only one (or zero) sets are
 * available so the caller can render it unconditionally.
 */

interface SidebarSetToggleProps {
  availableSets: { id: string; label: string }[];
  setId: string;
  onSetChange: (id: string) => void;
}

export function SidebarSetToggle({ availableSets, setId, onSetChange }: SidebarSetToggleProps) {
  if (availableSets.length <= 1) return null;
  return (
    <div className="mb-5">
      <div
        className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-500 mb-1.5 px-1"
        title="Switch between the full question bank and your saved sets"
      >
        Question Set
      </div>
      <div
        className="inline-flex rounded-lg bg-ink-100 p-0.5 w-full"
        role="radiogroup"
        aria-label="Question set"
        data-testid="set-toggle"
      >
        {availableSets.map((s) => {
          const active = s.id === setId;
          return (
            <button
              key={s.id || "orig"}
              type="button"
              onClick={() => onSetChange(s.id)}
              role="radio"
              aria-checked={active}
              className={
                "flex-1 px-2 py-1 text-[12px] rounded-md transition-colors focus-ring " +
                (active
                  ? "bg-white text-ink-800 font-medium shadow-card"
                  : "text-ink-600 hover:text-ink-800")
              }
            >
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
