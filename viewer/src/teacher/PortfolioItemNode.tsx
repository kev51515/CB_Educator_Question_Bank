/**
 * PortfolioItemNode
 * =================
 * Recursive renderer for a single row in the portfolio template tree, plus
 * the small UI primitives it consumes (DragHandle, KebabMenu, InsertionBar)
 * and shared formatting helpers (TYPE_LABELS, TYPE_ICON, formatRelative).
 *
 * The row owns:
 *   - HTML5-native draggable wiring (drag/over/end/drop handlers) that
 *     reports targets back to the page-level `DropTarget` via the
 *     callbacks bundle.
 *   - Notion/Linear-style insertion bar visibility (before/after this row),
 *     including the nest-as-child highlight ring + parent-name pill.
 *   - The kebab fallback for touch/keyboard users: Edit / + Sub-item /
 *     Indent / Outdent / Move to… / Delete. This satisfies the CLAUDE.md
 *     rule that every drag-and-drop affordance must have a non-drag
 *     fallback for touch.
 *   - The drop-landing pulse (indigo ring + animate-pulse) when this row
 *     was the last one moved.
 *   - Indent/outdent menu disabling based on `siblingIndex` (no previous
 *     sibling -> can't indent) and `depth` (root level -> can't outdent).
 *
 * Recursion: children render as nested <PortfolioItemNodeRow> inside an
 * indented <ul> with the indigo guide line + elbow connectors. The depth
 * prop is passed explicitly so the row knows how far to indent the
 * insertion bar and where its INDENT_THRESHOLD_X lives.
 */
import { useEffect, useRef, useState } from "react";
import type {
  PortfolioItem,
  PortfolioItemNode,
  PortfolioItemType,
} from "./usePortfolio";
import {
  resolveDropTarget,
  type DropTarget,
  DEPTH_INDENT_PX,
} from "./usePortfolioDrag";

// -----------------------------------------------------------------------------
// localStorage helpers for per-node collapse state. Keyed by (user, template)
// so the same teacher viewing two different courses' portfolios doesn't share
// collapsed-ness. Try/catch each access — Safari private mode throws.
// -----------------------------------------------------------------------------

export const collapseKey = (
  userId: string | null,
  templateId: string | null,
): string =>
  `portfolio-collapse:${userId ?? "anon"}:${templateId ?? "none"}`;

export function readCollapseState(key: string): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "boolean") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function writeCollapseState(
  key: string,
  state: Record<string, boolean>,
): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // ignore (private mode, quota, etc.)
  }
}

export const TYPE_LABELS: Record<PortfolioItemType, string> = {
  short_text: "Short text",
  long_text: "Essay",
  file: "File",
  link: "Link",
  number: "Number",
  date: "Date",
  choice: "Choice",
  multi_choice: "Multi-choice",
};

/**
 * Clean line icons per portfolio item type (replaces the old emoji map).
 * Stroke-based, 24-unit viewBox, matching the repo's ItemTypeIcon style so
 * the row reads as tidy Canvas-style scaffolding rather than mixed-weight
 * emoji that render differently per OS.
 */
function TypeIcon({ type }: { type: PortfolioItemType }): JSX.Element {
  const paths: Record<PortfolioItemType, JSX.Element> = {
    short_text: <path d="M4 7h16M4 12h10M4 17h7" />,
    long_text: (
      <>
        <path d="M5 4a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z" />
        <path d="M14 2v5h5" />
        <path d="M9 13h6M9 16.5h4" />
      </>
    ),
    file: (
      <path d="M21.44 11.05 12.25 20.24a4 4 0 0 1-5.66-5.66l8.49-8.49a2.5 2.5 0 0 1 3.54 3.54l-8.49 8.49a1 1 0 0 1-1.41-1.41l7.78-7.78" />
    ),
    link: (
      <>
        <path d="M10 13a5 5 0 0 0 7.07 0l1.93-1.93a5 5 0 0 0-7.07-7.07L11 5" />
        <path d="M14 11a5 5 0 0 0-7.07 0L5 12.93a5 5 0 0 0 7.07 7.07L13 19" />
      </>
    ),
    number: <path d="M9 4 7 20M17 4l-2 16M5 9h15M4 15h15" />,
    date: (
      <>
        <path d="M7 2v3M17 2v3" />
        <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
        <path d="M4 10h16" />
      </>
    ),
    choice: (
      <>
        <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z" />
        <path d="M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
      </>
    ),
    multi_choice: (
      <>
        <path d="M5 3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Z" />
        <path d="M8 12.5 11 15.5 16.5 9" />
      </>
    ),
  };
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {paths[type]}
    </svg>
  );
}

export function formatRelative(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const ms = d.getTime() - Date.now();
  const abs = Math.abs(ms);
  const days = Math.round(ms / 86_400_000);
  try {
    const fmt = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    if (abs < 86_400_000) {
      const hours = Math.round(ms / 3_600_000);
      return fmt.format(hours, "hour");
    }
    if (abs < 30 * 86_400_000) return fmt.format(days, "day");
    return d.toLocaleDateString();
  } catch {
    return d.toLocaleString();
  }
}

// -----------------------------------------------------------------------------
// Shared UI bits — mirror Wave 10B (ModulesPage) affordances.
// -----------------------------------------------------------------------------

export function DragHandle({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      width={12}
      height={18}
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

export interface KebabMenuOption {
  label: string;
  destructive?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

export function KebabMenu({
  options,
}: {
  options: readonly KebabMenuOption[];
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent): void => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-label="More actions"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md w-7 h-7 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden>
          <circle cx={3} cy={8} r={1.5} fill="currentColor" />
          <circle cx={8} cy={8} r={1.5} fill="currentColor" />
          <circle cx={13} cy={8} r={1.5} fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-44 rounded-md bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-700 shadow-lg py-1 text-sm"
        >
          {options.map((opt) => (
            <button
              key={opt.label}
              type="button"
              role="menuitem"
              disabled={opt.disabled}
              onClick={() => {
                if (opt.disabled) return;
                setOpen(false);
                opt.onSelect();
              }}
              className={`block w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 ${
                opt.destructive
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-slate-700 dark:text-slate-200"
              } ${opt.disabled ? "opacity-40 cursor-not-allowed hover:bg-transparent" : ""}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Single global insertion bar — indigo 2px line + dot indicator anchored to
 * the row, indented by `depth * 24px`. Optionally annotates "nest as child"
 * when the bottom-half-right-of-threshold resolves as a child drop.
 */
export function InsertionBar({
  depth,
  asChild,
  parentName,
}: {
  depth: number;
  asChild?: boolean;
  parentName?: string;
}): JSX.Element {
  const ticks =
    depth > 0
      ? Array.from({ length: depth }).map((_, i) => (
          <span
            key={i}
            aria-hidden
            className="inline-block h-0.5 w-2 rounded-full bg-indigo-300/70 dark:bg-indigo-800/70 mr-0.5"
          />
        ))
      : null;

  return (
    <div aria-hidden className="relative h-0 pointer-events-none">
      {ticks && (
        // Align the depth ticks to where the indented line begins so they
        // track DEPTH_INDENT_PX at every depth (0-5+) instead of floating at a
        // fixed left edge. Right-anchored against the line start; -ml pulls the
        // run back so the last tick butts up to the line's left dot.
        <div
          className="absolute -top-1 flex items-center"
          style={{
            // Each tick is w-2 (8px) + mr-0.5 (2px) = 10px wide; pull the run
            // back by its full width so it butts up against the line's start.
            left: `${depth * DEPTH_INDENT_PX - depth * 10 - 2}px`,
          }}
        >
          {ticks}
        </div>
      )}
      <div
        className="relative h-0"
        style={{ marginLeft: `${depth * DEPTH_INDENT_PX}px` }}
      >
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
    </div>
  );
}

// -----------------------------------------------------------------------------
// Recursive node row
// -----------------------------------------------------------------------------

export interface NodeCallbacks {
  canEdit: boolean;
  isCollapsed: (id: string) => boolean;
  toggleCollapsed: (id: string) => void;
  onEdit: (item: PortfolioItem) => void;
  onDelete: (item: PortfolioItem) => void;
  onAddSubItem: (parent: PortfolioItem) => void;
  onIndent: (node: PortfolioItemNode) => void;
  onOutdent: (node: PortfolioItemNode) => void;
  onMoveTo: (node: PortfolioItemNode) => void;
  onDragStart: (node: PortfolioItemNode) => void;
  onDragEnd: () => void;
  onCommitDrop: (target: DropTarget) => void;
  /** Currently dragged node id (for opacity + drop visibility). */
  draggedId: string | null;
  draggedDescendants: ReadonlySet<string>;
  /** Page-level drop target (Notion/Linear-style single indicator). */
  dropTarget: DropTarget | null;
  dropTargetRef: React.MutableRefObject<DropTarget | null>;
  setDropTarget: (target: DropTarget | null) => void;
  /** Id of the row just moved — gets a brief indigo pulse for confirmation. */
  recentlyMovedId: string | null;
  actionBusy: boolean;
}

export interface PortfolioItemNodeRowProps {
  node: PortfolioItemNode;
  siblings: readonly PortfolioItemNode[];
  siblingIndex: number;
  depth: number;
  cb: NodeCallbacks;
}

export function PortfolioItemNodeRow({
  node,
  siblings,
  siblingIndex,
  depth,
  cb,
}: PortfolioItemNodeRowProps): JSX.Element {
  const hasChildren = node.children.length > 0;
  const collapsed = cb.isCollapsed(node.id);
  const expanded = !collapsed;

  const isDragging = cb.draggedId === node.id;
  const isDescendantOfDragged = cb.draggedDescendants.has(node.id);
  const dragActive =
    cb.canEdit &&
    cb.draggedId !== null &&
    !isDragging &&
    !isDescendantOfDragged;

  const hasPrevSibling = siblingIndex > 0;
  const canOutdent = depth > 0;

  const kebab: KebabMenuOption[] = [
    { label: "Edit", onSelect: () => cb.onEdit(node) },
    { label: "+ Sub-item", onSelect: () => cb.onAddSubItem(node) },
    {
      label: "Indent",
      disabled: !hasPrevSibling,
      onSelect: () => cb.onIndent(node),
    },
    {
      label: "Outdent",
      disabled: !canOutdent,
      onSelect: () => cb.onOutdent(node),
    },
    { label: "Move to…", onSelect: () => cb.onMoveTo(node) },
    {
      label: "Delete",
      destructive: true,
      onSelect: () => cb.onDelete(node),
    },
  ];

  // Insertion bar visibility flags resolved from page-level dropTarget.
  const showBarBefore =
    cb.dropTarget?.anchorId === node.id &&
    cb.dropTarget.position === "before";
  const showBarAfter =
    cb.dropTarget?.anchorId === node.id && cb.dropTarget.position === "after";
  // Highlight this row's article when current drop will nest INSIDE — without
  // this, the depth shift on the bar alone wasn't enough confirmation.
  const isNestTargetParent =
    cb.dropTarget?.anchorId === node.id &&
    cb.dropTarget.position === "after" &&
    cb.dropTarget.asChild;

  // Find parent name (for InsertionBar pill). For nest, that's this node; for
  // before/after at depth > 0, we'd need the locator — but we only have node
  // identity here. Cheap heuristic: nest pill shows node.title; sibling pill
  // shows "Before X" / "After X" using the anchor's own title.
  const barParentName = (() => {
    if (!cb.dropTarget) return undefined;
    if (cb.dropTarget.asChild) return node.title;
    if (cb.dropTarget.position === "before") return `Before ${node.title}`;
    return `After ${node.title}`;
  })();

  // siblings/siblingIndex are part of contract for parent's indent/outdent.
  void siblings;

  return (
    <li className="list-none">
      {showBarBefore && (
        <div className="mb-1">
          <InsertionBar
            depth={cb.dropTarget!.depth}
            parentName={barParentName}
          />
        </div>
      )}

      <article
        draggable={cb.canEdit}
        onDragStart={(e) => {
          if (!cb.canEdit) return;
          e.stopPropagation();
          e.dataTransfer.effectAllowed = "move";
          try {
            e.dataTransfer.setData("text/plain", node.id);
          } catch {
            /* ignore */
          }
          cb.onDragStart(node);
        }}
        onDragEnd={cb.onDragEnd}
        onDragOver={(e) => {
          if (!dragActive || cb.draggedId === null) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          const rect = e.currentTarget.getBoundingClientRect();
          const target = resolveDropTarget(
            node,
            depth,
            e.clientY,
            e.clientX,
            rect,
            cb.draggedId,
            cb.draggedDescendants,
          );
          // EDGE: resolver returns null for self / descendant. Clear stale
          // indicator so the user sees this row is NOT a valid drop.
          if (!target) {
            if (cb.dropTargetRef.current) cb.setDropTarget(null);
            return;
          }
          const cur = cb.dropTargetRef.current;
          if (
            !cur ||
            cur.anchorId !== target.anchorId ||
            cur.position !== target.position ||
            cur.asChild !== target.asChild
          ) {
            cb.setDropTarget(target);
          }
        }}
        onDrop={(e) => {
          if (!dragActive) return;
          const cur = cb.dropTargetRef.current;
          if (!cur) return;
          e.preventDefault();
          e.stopPropagation();
          cb.onCommitDrop(cur);
        }}
        className={`rounded-2xl bg-white/85 dark:bg-slate-900/70 ring-1 p-3 shadow-sm transition ${
          isDragging ? "opacity-50" : ""
        } ${
          isNestTargetParent
            ? "ring-2 ring-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/30"
            : cb.recentlyMovedId === node.id
              ? "ring-2 ring-indigo-500 animate-pulse"
              : "ring-slate-200 dark:ring-slate-800"
        }`}
      >
        <div className="flex items-start gap-2">
          {cb.canEdit && (
            <DragHandle className="text-slate-400 mt-1 flex-none" />
          )}
          <button
            type="button"
            onClick={() => cb.toggleCollapsed(node.id)}
            aria-expanded={expanded}
            disabled={!hasChildren}
            title={hasChildren ? (expanded ? "Collapse" : "Expand") : undefined}
            className={`mt-0.5 w-5 h-5 flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 ${
              hasChildren ? "" : "opacity-30 cursor-default"
            }`}
          >
            {hasChildren ? (
              <svg
                width={10}
                height={10}
                viewBox="0 0 10 10"
                aria-hidden
                className={`transition-transform duration-150 ${
                  expanded ? "rotate-90" : ""
                }`}
              >
                <path d="M2 1 L8 5 L2 9 Z" fill="currentColor" />
              </svg>
            ) : (
              <span aria-hidden>·</span>
            )}
          </button>
          <span
            aria-hidden
            className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-100 dark:ring-indigo-900"
          >
            <TypeIcon type={node.item_type} />
          </span>
          {cb.canEdit ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                cb.onEdit(node);
              }}
              aria-label={`Edit "${node.title}"`}
              className="group min-w-0 flex-1 text-left cursor-pointer"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate group-hover:underline">
                  {node.title}
                </h3>
                <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-700">
                  {TYPE_LABELS[node.item_type]}
                </span>
                {node.required && (
                  <span className="rounded-full bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-100 dark:ring-indigo-900">
                    Required
                  </span>
                )}
                {node.due_at && (
                  <span className="rounded-full bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-900">
                    Due {formatRelative(node.due_at)}
                  </span>
                )}
                {hasChildren && (
                  <span className="rounded-full bg-slate-50 dark:bg-slate-800/60 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400 ring-1 ring-slate-200 dark:ring-slate-700">
                    {node.children.length} sub-item
                    {node.children.length === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              {node.prompt && (
                <p className="mt-1.5 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap line-clamp-3">
                  {node.prompt}
                </p>
              )}
            </button>
          ) : (
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {node.title}
                </h3>
                <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-700">
                  {TYPE_LABELS[node.item_type]}
                </span>
                {node.required && (
                  <span className="rounded-full bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-100 dark:ring-indigo-900">
                    Required
                  </span>
                )}
                {node.due_at && (
                  <span className="rounded-full bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-900">
                    Due {formatRelative(node.due_at)}
                  </span>
                )}
                {hasChildren && (
                  <span className="rounded-full bg-slate-50 dark:bg-slate-800/60 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400 ring-1 ring-slate-200 dark:ring-slate-700">
                    {node.children.length} sub-item
                    {node.children.length === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              {node.prompt && (
                <p className="mt-1.5 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap line-clamp-3">
                  {node.prompt}
                </p>
              )}
            </div>
          )}
          {cb.canEdit && (
            <div className="flex items-center gap-1 shrink-0">
              <KebabMenu options={kebab} />
            </div>
          )}
        </div>
      </article>

      {expanded && hasChildren && (
        <ul
          className={
            "relative ml-8 mt-2 pl-5 space-y-2 " +
            // Indigo vertical guide line + per-row elbow connectors (mirrors
            // ModulesPage). slate was too subtle — users couldn't read the
            // tree at a glance.
            "before:absolute before:left-1.5 before:top-0 before:bottom-6 before:w-0.5 before:bg-indigo-300 dark:before:bg-indigo-800 before:rounded-full"
          }
        >
          {node.children.map((child, idx) => (
            <div
              key={child.id}
              className="relative before:absolute before:left-[-20px] before:top-7 before:w-5 before:h-0.5 before:bg-indigo-300 dark:before:bg-indigo-800 before:rounded-r-full"
            >
              <PortfolioItemNodeRow
                node={child}
                siblings={node.children}
                siblingIndex={idx}
                depth={depth + 1}
                cb={cb}
              />
            </div>
          ))}
        </ul>
      )}

      {showBarAfter && (
        <div className="mt-1">
          <InsertionBar
            depth={cb.dropTarget!.depth}
            asChild={cb.dropTarget!.asChild}
            parentName={barParentName}
          />
        </div>
      )}
    </li>
  );
}
