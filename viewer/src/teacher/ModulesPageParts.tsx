/**
 * ModulesPageParts
 * ================
 * Small, dependency-light presentational bits for the Modules page (drag handle
 * + publish switch/badge). Extracted verbatim from ModulesPage (modularization
 * step 3); only `useOptimistic` is needed beyond React.
 */
import { useOptimistic } from "@/components";
import { DEPTH_INDENT_PX } from "./modulesDnd";

/** Six-dot Canvas-style drag handle. */
export function DragHandle({
  className,
  compact = false,
}: {
  className?: string;
  /** Smaller variant for nested rows so child chrome reads as lower-level. */
  compact?: boolean;
}): JSX.Element {
  const w = compact ? 10 : 14;
  const h = compact ? 14 : 20;
  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 14 20"
      aria-hidden
      style={{ touchAction: "none" }}
      className={`cursor-grab active:cursor-grabbing opacity-60 hover:opacity-100 ${className ?? ""}`}
    >
      <circle cx={4} cy={5} r={1.5} fill="currentColor" />
      <circle cx={10} cy={5} r={1.5} fill="currentColor" />
      <circle cx={4} cy={10} r={1.5} fill="currentColor" />
      <circle cx={10} cy={10} r={1.5} fill="currentColor" />
      <circle cx={4} cy={15} r={1.5} fill="currentColor" />
      <circle cx={10} cy={15} r={1.5} fill="currentColor" />
    </svg>
  );
}

interface PublishButtonProps {
  published: boolean;
  disabled?: boolean;
  onToggle: () => void;
}

/**
 * iOS-style switch + label: the "circle" before this was ambiguous (users
 * couldn't tell at a glance whether a module was published). The switch
 * makes the state obvious — knob LEFT = off (Draft), knob RIGHT = on
 * (Published). Color reinforces: slate track for off, emerald for on.
 */
function PublishToggle({
  published,
  disabled,
  onToggle,
}: PublishButtonProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      role="switch"
      aria-checked={published}
      title={published ? "Published — click to make draft" : "Draft — click to publish"}
      className={`min-h-[40px] md:min-h-0 inline-flex items-center gap-2 px-1.5 py-1 rounded-full transition-colors ${
        disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
      }`}
    >
      {/* Switch track */}
      <span
        aria-hidden
        className={`relative inline-block w-9 h-5 rounded-full transition-colors ${
          published
            ? "bg-emerald-500"
            : "bg-slate-300 dark:bg-slate-600"
        }`}
      >
        {/* Knob */}
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-150 ${
            published ? "left-[18px]" : "left-0.5"
          }`}
        />
      </span>
      {/* Label */}
      <span
        className={`text-xs font-semibold uppercase tracking-wide hidden sm:inline ${
          published
            ? "text-emerald-700 dark:text-emerald-300"
            : "text-slate-500 dark:text-slate-400"
        }`}
      >
        {published ? "Published" : "Draft"}
      </span>
    </button>
  );
}

interface OptimisticPublishToggleProps {
  /** Authoritative server value — used as the initial / reset value. */
  published: boolean;
  /** Stable per-row key (e.g. module.id). Re-mounts the inner state when changed. */
  rowKey: string;
  disabled?: boolean;
  /** Persist the new value. Must throw on failure so the inner hook can roll back. */
  onCommit: (next: boolean) => Promise<void>;
}

/**
 * PublishToggle wrapped in useOptimistic — flips the UI immediately, rolls
 * back on commit failure, and surfaces a toast via the shared hook. We key
 * the wrapper by rowKey so that when the parent's list shuffles, each row
 * keeps its own optimistic state in sync with its server value.
 */
function OptimisticPublishToggleInner({
  published,
  disabled,
  onCommit,
}: Omit<OptimisticPublishToggleProps, "rowKey">): JSX.Element {
  const [pub, applyPub] = useOptimistic<boolean>(published);
  const handle = (): void => {
    void applyPub({
      optimistic: (cur) => !cur,
      commit: async () => {
        await onCommit(!pub);
      },
    });
  };
  return <PublishToggle published={pub} disabled={disabled} onToggle={handle} />;
}

export function OptimisticPublishToggle(props: OptimisticPublishToggleProps): JSX.Element {
  const { rowKey, ...rest } = props;
  // Re-key so the inner useState seed (`initial`) re-runs whenever the row's
  // authoritative published value changes via a refresh.
  return <OptimisticPublishToggleInner key={`${rowKey}:${rest.published}`} {...rest} />;
}

/** Read-only round status indicator for student view. */
export function PublishBadge({ published }: { published: boolean }): JSX.Element {
  return (
    <span
      title={published ? "Published" : "Unpublished"}
      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
        published
          ? "bg-emerald-500 text-white"
          : "border-2 border-slate-300 text-slate-300"
      }`}
    >
      {published ? "✓" : ""}
    </span>
  );
}

/**
 * Single global insertion bar — an indigo 2px line + dot indicator anchored to
 * the row, indented by `depth * 24px`, with optional "nest as child" pill and a
 * faded ghost preview of the dragged row at the drop location.
 */
export function InsertionBar({
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
