/**
 * CourseOrgBits — tiny shared primitives for the courses folders/tags UI.
 *   • TagChip       — a coloured pill for a tag (optionally removable).
 *   • ColorPicker   — a row of palette swatches for choosing a folder/tag colour.
 */
import { ORG_COLORS, colorClasses, type OrgColor } from "./courseOrg";

export function TagChip({
  name,
  color,
  onRemove,
  small,
}: {
  name: string;
  color: string | null;
  onRemove?: () => void;
  small?: boolean;
}): JSX.Element {
  const c = colorClasses(color);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ring-1 ring-inset ${c.chip} ${
        small ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-[11px]"
      }`}
    >
      <span className={`inline-block rounded-full ${c.dot} ${small ? "h-1.5 w-1.5" : "h-2 w-2"}`} />
      {name}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove tag ${name}`}
          className="ml-0.5 rounded-full text-current/70 hover:text-current focus:outline-none"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden>
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </span>
  );
}

export function ColorPicker({
  value,
  onChange,
}: {
  value: OrgColor;
  onChange: (c: OrgColor) => void;
}): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Colour">
      {ORG_COLORS.map((col) => {
        const c = colorClasses(col);
        const active = value === col;
        return (
          <button
            key={col}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={col}
            onClick={() => onChange(col)}
            className={`h-5 w-5 rounded-full ${c.dot} transition ${
              active
                ? "ring-2 ring-offset-2 ring-slate-500 dark:ring-offset-slate-900"
                : "ring-1 ring-black/10 hover:scale-110"
            }`}
          />
        );
      })}
    </div>
  );
}
