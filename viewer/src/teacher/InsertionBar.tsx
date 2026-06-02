import { DEPTH_INDENT_PX } from "./moduleHelpers";

/**
 * Single global insertion bar — an indigo 2px line + dot indicator anchored
 * to the row, indented by `depth * 24px`. Optionally annotates "nest as
 * child" when the bottom-half-right-of-threshold resolves as a child drop.
 */
function InsertionBar({
  depth,
  asChild,
  parentName,
  draggedName,
}: {
  depth: number;
  asChild?: boolean;
  parentName?: string;
  /** Name of the row being dragged — when present, render a faded "ghost"
   *  preview of the dragged module at the drop location so the user can
   *  SEE the destination, not just the line. */
  draggedName?: string;
}): JSX.Element {
  // Small indent "tick" marks LEFT of the bar — one per depth level — so the
  // user can count nesting at a glance even before reading the pill label.
  const ticks = depth > 0
    ? Array.from({ length: depth }).map((_, i) => (
        <span
          key={i}
          aria-hidden
          className="inline-block h-0.5 w-2 rounded-full bg-indigo-300/70 dark:bg-indigo-800/70 mr-0.5"
        />
      ))
    : null;

  return (
    <div aria-hidden className="relative pointer-events-none">
      {/* Depth ticks live in the gutter so they don't shift with marginLeft */}
      {ticks && (
        <div className="absolute -top-1 left-1 flex items-center z-10">
          {ticks}
        </div>
      )}
      <div
        className="relative"
        style={{ marginLeft: `${depth * DEPTH_INDENT_PX}px` }}
      >
        {/* Bar + dot */}
        <div className="relative h-0">
          <div className="absolute left-0 right-2 top-0 h-0.5 bg-indigo-500 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.7)]">
            <div className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full bg-indigo-500 ring-2 ring-white dark:ring-slate-900" />
          </div>
          {parentName && (
            <span
              className={
                "absolute -top-2.5 text-[11px] font-semibold rounded-md px-1.5 py-0.5 shadow-sm whitespace-nowrap max-w-[16rem] truncate " +
                (asChild
                  ? "left-3 bg-indigo-600 text-white ring-1 ring-indigo-700"
                  : "left-3 bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-200 ring-1 ring-indigo-200 dark:ring-indigo-800")
              }
              title={asChild ? `Nest inside ${parentName}` : parentName}
            >
              {asChild ? `↳ Nest inside ${parentName}` : `↑ ${parentName}`}
            </span>
          )}
        </div>
        {/* Ghost preview of the dragged row at the destination — shows the
            user EXACTLY where the module will land + what it looks like at
            this depth. The styling mimics a real row but at 40% opacity with
            a dashed indigo border so it reads as "future state". */}
        {draggedName && (
          <div className="mt-1.5 rounded-xl border-2 border-dashed border-indigo-400 dark:border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 px-3 py-2 opacity-70 flex items-center gap-2">
            <span aria-hidden className="text-indigo-400 dark:text-indigo-500">
              <svg width={12} height={12} viewBox="0 0 12 12">
                <circle cx={3} cy={3} r={1} fill="currentColor" />
                <circle cx={3} cy={6} r={1} fill="currentColor" />
                <circle cx={3} cy={9} r={1} fill="currentColor" />
                <circle cx={6} cy={3} r={1} fill="currentColor" />
                <circle cx={6} cy={6} r={1} fill="currentColor" />
                <circle cx={6} cy={9} r={1} fill="currentColor" />
              </svg>
            </span>
            <span className="text-sm font-medium text-indigo-800 dark:text-indigo-200 truncate">
              {draggedName}
            </span>
            <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
              landing here
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export { InsertionBar };
