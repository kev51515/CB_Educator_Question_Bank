/**
 * QuickBuildPill
 * ==============
 * Small toggle pill button used inside the Quick Build wizard's configure
 * step (section / difficulty selectors). Active state uses the accent color;
 * inactive uses the neutral ink palette.
 *
 * Co-located with QuickBuild because it has no other consumers — keeping it
 * in this sibling file lets the lazy chunk own its UI primitives without
 * polluting the global component barrel.
 */

interface QuickBuildPillProps {
  /** Label shown inside the pill. */
  label: string;
  /** Whether the pill represents the currently-selected option. */
  active: boolean;
  /** Click handler — typically toggles the underlying Set membership. */
  onClick: () => void;
}

export function QuickBuildPill({ label, active, onClick }: QuickBuildPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "px-3 py-1.5 rounded-lg text-[12.5px] font-medium transition-colors focus-ring " +
        (active
          ? "bg-accent-600 text-white shadow-sm"
          : "bg-ink-50 text-ink-600 hover:bg-ink-100")
      }
    >
      {label}
    </button>
  );
}
