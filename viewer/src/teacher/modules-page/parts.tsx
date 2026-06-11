/**
 * ModulesPageParts
 * ================
 * Small, dependency-light presentational bits for the Modules page (drag handle
 * + publish switch/badge). Extracted verbatim from ModulesPage (modularization
 * step 3); only `useOptimistic` is needed beyond React.
 */
import { useOptimistic } from "@/components";
import { DEPTH_INDENT_PX } from "./dnd";

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

/** Small check icon for the published badge (1.6px stroke, no emoji). */
function CheckIcon(): JSX.Element {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="h-3 w-3 flex-none"
    >
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

/**
 * One-click status badge (Ivy Ledger mockup language): published reads as a
 * green-tint pill with a check; draft reads as a dashed, sunken pill. The
 * whole badge is the toggle — same single-click contract as before, the
 * switch chrome is just replaced with the mockup's .badge recipe.
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
      className={`min-h-[40px] md:min-h-0 inline-flex items-center flex-none ${
        disabled ? "opacity-50 cursor-not-allowed" : ""
      }`}
    >
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
          published
            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-transparent hover:border-emerald-400 dark:hover:border-emerald-600"
            : "bg-slate-50 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400 border border-dashed border-slate-300 dark:border-slate-600 hover:border-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
        }`}
      >
        {published && <CheckIcon />}
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

/** Read-only status badge for student view — same .badge language as the
 *  teacher toggle, minus interactivity. */
export function PublishBadge({ published }: { published: boolean }): JSX.Element {
  return (
    <span
      title={published ? "Published" : "Unpublished"}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold flex-none ${
        published
          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
          : "bg-slate-50 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400 border border-dashed border-slate-300 dark:border-slate-600"
      }`}
    >
      {published && <CheckIcon />}
      {published ? "Published" : "Draft"}
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
                "absolute -top-2.5 text-[11px] font-semibold rounded-lg px-1.5 py-0.5 shadow-sm whitespace-nowrap max-w-[16rem] truncate " +
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
          <div className="mt-1.5 rounded-lg border-2 border-dashed border-indigo-400 dark:border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 px-3 py-2 opacity-70 flex items-center gap-2">
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
