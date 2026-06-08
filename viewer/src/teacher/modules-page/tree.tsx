/**
 * modules-page/tree
 * =================
 * The recursive module-tree renderers, extracted verbatim from ModulesPage:
 *   - ModuleCard      — one module card (header + item list + inline add form).
 *   - ModuleNodeView  — recursive wrapper that renders a ModuleCard plus its
 *                       child modules (the drag/drop + indentation tree).
 *
 * ModulesPage renders <ModuleNodeView> at the top level and passes the whole
 * handler/state bundle down via ModuleNodeViewProps. Behavior is unchanged
 * from the pre-extraction ModulesPage.
 */
import { Fragment, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { testOverviewPath } from "@/lib/routes";
import { KebabMenu, type KebabMenuOption } from "@/components";
import { useToast } from "@/components/Toast";
import { type ModuleItem, type ModuleNode } from "@/teacher/useCourseModules";
import {
  resolveDropTarget,
  resolveItemDropTarget,
  type DropTarget,
  type ItemDropTarget,
} from "./dnd";
import {
  DragHandle,
  InsertionBar,
  OptimisticPublishToggle,
  PublishBadge,
} from "./parts";
import { InlineRename } from "./editors";
import { InlineAddItemRow } from "./inline-add";

// -----------------------------------------------------------------------------
// Module card
// -----------------------------------------------------------------------------

/**
 * Clean line icons per item type (replaces the old emoji map). Stroke-based,
 * 16px, calm slate — reads as a tidy Canvas-style row rather than mixed-weight
 * emoji that render differently per OS.
 */
function ItemTypeIcon({ type }: { type: ModuleItem["item_type"] }): JSX.Element {
  const paths: Record<ModuleItem["item_type"], JSX.Element> = {
    assignment: (
      <>
        <path d="M5 4a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z" />
        <path d="M14 2v5h5" />
        <path d="M9 13h6M9 16.5h4" />
      </>
    ),
    link: (
      <>
        <path d="M10 13a5 5 0 0 0 7.07 0l1.93-1.93a5 5 0 0 0-7.07-7.07L11 5" />
        <path d="M14 11a5 5 0 0 0-7.07 0L5 12.93a5 5 0 0 0 7.07 7.07L13 19" />
      </>
    ),
    page: (
      <>
        <path d="M5 4a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z" />
        <path d="M14 2v5h5" />
      </>
    ),
    file: (
      <path d="M21.44 11.05 12.25 20.24a4 4 0 0 1-5.66-5.66l8.49-8.49a2.5 2.5 0 0 1 3.54 3.54l-8.49 8.49a1 1 0 0 1-1.41-1.41l7.78-7.78" />
    ),
    header: <path d="M4 7h16M4 12h10M4 17h7" />,
  };
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="h-4 w-4 flex-none text-slate-400 dark:text-slate-500"
    >
      {paths[type]}
    </svg>
  );
}

/** Small line-SVG padlock, matching ItemTypeIcon's stroke style. */
function LockIcon(): JSX.Element {
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
      <path d="M5 11a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z" />
      <path d="M8 9V7a4 4 0 0 1 8 0v2" />
    </svg>
  );
}

/**
 * Notion/Linear-style drop target. A single anchor row + relative position +
 * cursor-X depth resolution. `asChild` is only valid when position==="after"
 * and means "nest as the last child of the anchor".
 */

export interface ModuleNodeViewProps {
  node: ModuleNode;
  depth: number;
  siblings: readonly ModuleNode[];
  siblingIndex: number;
  flatModules: readonly ModuleNode[];
  canEdit: boolean;
  isStudent: boolean;
  expandedFor: (moduleId: string) => boolean;
  toggleExpanded: (moduleId: string) => void;
  completedIds: ReadonlySet<string>;
  draggedModuleId: string | null;
  draggedDescendants: ReadonlySet<string>;
  draggedItemId: string | null;
  /** Id of the module/item just moved — pulses indigo briefly. */
  recentlyMovedId: string | null;
  dropTarget: DropTarget | null;
  dropTargetRef: React.MutableRefObject<DropTarget | null>;
  setDropTarget: (target: DropTarget | null) => void;
  itemDropTarget: ItemDropTarget | null;
  itemDropTargetRef: React.MutableRefObject<ItemDropTarget | null>;
  setItemDropTarget: (target: ItemDropTarget | null) => void;
  // Inline-item-create state (page owns it, ModuleCard renders it). We pass
  // the active module id (not a precomputed boolean) so the recursive
  // {...props} spread to child nodes resolves the right module on its own.
  addingItemToModuleId: string | null;
  classId: string;
  usedAssignmentIds: ReadonlySet<string>;
  onCancelInlineItem: () => void;
  // Module-level actions
  onEditModule: (m: ModuleNode) => void;
  onDeleteModule: (m: ModuleNode) => void;
  onTogglePublishModule: (m: ModuleNode) => Promise<void>;
  onAddItem: (m: ModuleNode) => void;
  onAddSubmodule: (m: ModuleNode) => Promise<void>;
  onOpenAssignment: (assignmentId: string) => void;
  onRefresh: () => Promise<void>;
  onRenameModule: (m: ModuleNode, next: string) => Promise<void>;
  onDuplicateModule: (m: ModuleNode) => Promise<void>;
  onLockModule: (m: ModuleNode) => void;
  onMoveModule: (m: ModuleNode) => void;
  onIndentModule: (m: ModuleNode, siblings: readonly ModuleNode[], idx: number) => Promise<void>;
  onOutdentModule: (m: ModuleNode) => Promise<void>;
  /**
   * Alt+↑ / Alt+↓ keyboard reorder, fired from the focused grip handle.
   * Swaps the module with its previous/next sibling within the same parent.
   * No-op at boundaries (first/last among siblings).
   */
  onKeyboardReorderModule: (
    m: ModuleNode,
    siblings: readonly ModuleNode[],
    idx: number,
    direction: "up" | "down",
  ) => Promise<void>;
  onMoveItem: (item: ModuleItem) => void;
  onToggleItemCompleted: (itemId: string, next: boolean) => Promise<void>;
  // Drag wiring
  onModuleDragStart: (m: ModuleNode) => void;
  onModuleDragEnd: () => void;
  onCommitDrop: (target: DropTarget) => Promise<void>;
  // Item-level drag wiring (within and across modules)
  onItemDragStart: (item: ModuleItem) => void;
  onItemDragEnd: () => void;
  onCommitItemDrop: (target: ItemDropTarget) => Promise<void>;
  // Empty-list drop: drop onto a module that has zero items.
  onItemDropOnEmptyModule: (moduleId: string) => Promise<void>;
  // Bulk-select wiring
  selectMode: boolean;
  isSelected: (moduleId: string) => boolean;
  onToggleSelected: (moduleId: string) => void;
}

interface ModuleHeaderProps {
  node: ModuleNode;
  depth: number;
  siblings: readonly ModuleNode[];
  siblingIndex: number;
  flatModules: readonly ModuleNode[];
  canEdit: boolean;
  isStudent: boolean;
  expanded: boolean;
  completedIds: ReadonlySet<string>;
  draggedModuleId: string | null;
  draggedDescendants: ReadonlySet<string>;
  draggedItemId: string | null;
  /** Id of the module/item just moved — pulses indigo briefly. */
  recentlyMovedId: string | null;
  dropTarget: DropTarget | null;
  dropTargetRef: React.MutableRefObject<DropTarget | null>;
  setDropTarget: (target: DropTarget | null) => void;
  itemDropTarget: ItemDropTarget | null;
  itemDropTargetRef: React.MutableRefObject<ItemDropTarget | null>;
  setItemDropTarget: (target: ItemDropTarget | null) => void;
  inlineAddingItem: boolean;
  classId: string;
  usedAssignmentIds: ReadonlySet<string>;
  onCancelInlineItem: () => void;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePublishCommit: () => Promise<void>;
  onAddItem: () => void;
  onAddSubmodule: () => Promise<void>;
  onOpenAssignment: (assignmentId: string) => void;
  onRefresh: () => Promise<void>;
  onRenameModule: (next: string) => Promise<void>;
  onDuplicateModule: () => Promise<void>;
  onLockModule: () => void;
  onMoveModule: () => void;
  onIndentModule: () => Promise<void>;
  onOutdentModule: () => Promise<void>;
  /**
   * Fired by Alt+↑ / Alt+↓ on the focused grip handle. Direction is the
   * desired motion ("up" = swap with previous sibling).
   */
  onKeyboardReorderModule: (direction: "up" | "down") => Promise<void>;
  onMoveItem: (item: ModuleItem) => void;
  onToggleItemCompleted: (itemId: string, next: boolean) => Promise<void>;
  onModuleDragStart: () => void;
  onModuleDragEnd: () => void;
  onCommitDrop: (target: DropTarget) => Promise<void>;
  onItemDragStart: (item: ModuleItem) => void;
  onItemDragEnd: () => void;
  onCommitItemDrop: (target: ItemDropTarget) => Promise<void>;
  onItemDropOnEmptyModule: (moduleId: string) => Promise<void>;
  // Bulk-select wiring
  selectMode: boolean;
  selected: boolean;
  onToggleSelected: () => void;
}

function ModuleCard({
  node: module,
  depth,
  siblings,
  siblingIndex,
  flatModules,
  canEdit,
  isStudent,
  expanded,
  completedIds,
  draggedModuleId,
  draggedDescendants,
  draggedItemId,
  recentlyMovedId,
  dropTarget,
  dropTargetRef,
  setDropTarget,
  itemDropTarget,
  itemDropTargetRef,
  setItemDropTarget,
  inlineAddingItem,
  classId,
  usedAssignmentIds,
  onCancelInlineItem,
  onToggleExpand,
  onEdit,
  onDelete,
  onTogglePublishCommit,
  onAddItem,
  onAddSubmodule,
  onOpenAssignment,
  onRefresh,
  onRenameModule,
  onDuplicateModule,
  onLockModule,
  onMoveModule,
  onIndentModule,
  onOutdentModule,
  onKeyboardReorderModule,
  onMoveItem,
  onToggleItemCompleted,
  onModuleDragStart,
  onModuleDragEnd,
  onCommitDrop,
  onItemDragStart,
  onItemDragEnd,
  onCommitItemDrop,
  onItemDropOnEmptyModule,
  selectMode,
  selected,
  onToggleSelected,
}: ModuleHeaderProps): JSX.Element {
  const toast = useToast();

  const onToggleItemPublished = useCallback(
    async (item: ModuleItem): Promise<void> => {
      // Prefer the server-authoritative RPC; fall back to a direct UPDATE if
      // the RPC is missing (dev DBs that haven't run Wave 8A yet). Throws on
      // failure so the wrapping useOptimistic toggle can roll back.
      const { error: rpcError } = await supabase.rpc("toggle_item_publish", {
        p_item_id: item.id,
      });
      if (rpcError) {
        const next = !item.published;
        const { error } = await supabase
          .from("module_items")
          .update({ published: next })
          .eq("id", item.id);
        if (error) throw new Error(error.message);
      }
      await onRefresh();
    },
    [onRefresh],
  );

  const onDeleteItem = useCallback(
    async (item: ModuleItem): Promise<void> => {
      const { error } = await supabase
        .from("module_items")
        .delete()
        .eq("id", item.id);
      if (error) {
        toast.error("Couldn't delete item", error.message);
        return;
      }
      toast.success("Item deleted", item.title);
      await onRefresh();
    },
    [onRefresh, toast],
  );

  // Canvas-style item indent (0–5). Persists directly to module_items.indent
  // (RLS-guarded, like the publish/delete paths); the row already renders the
  // left-padding from `item.indent`.
  const onSetItemIndent = useCallback(
    async (item: ModuleItem, delta: number): Promise<void> => {
      const next = Math.max(0, Math.min(5, item.indent + delta));
      if (next === item.indent) return;
      const { error } = await supabase
        .from("module_items")
        .update({ indent: next })
        .eq("id", item.id);
      if (error) {
        toast.error("Couldn't change indent", error.message);
        return;
      }
      await onRefresh();
    },
    [onRefresh, toast],
  );

  const onRenameItem = useCallback(
    async (item: ModuleItem, next: string): Promise<void> => {
      const previous = item.title;
      const { error } = await supabase
        .from("module_items")
        .update({ title: next })
        .eq("id", item.id);
      if (error) {
        toast.error("Couldn't rename item", error.message);
        return;
      }
      const canUndo = previous !== next;
      toast.success("Item renamed", next, canUndo ? {
        action: {
          label: "Undo",
          onAction: () => {
            void (async () => {
              const { error: undoError } = await supabase
                .from("module_items")
                .update({ title: previous })
                .eq("id", item.id);
              if (undoError) {
                toast.error("Couldn't undo rename", undoError.message);
                return;
              }
              await onRefresh();
            })();
          },
        },
      } : undefined);
      await onRefresh();
    },
    [onRefresh, toast],
  );

  const lockedNow = useMemo(() => {
    if (!module.lock_at) return false;
    const t = new Date(module.lock_at).getTime();
    return !Number.isNaN(t) && t < Date.now();
  }, [module.lock_at]);

  const canIndent = siblingIndex > 0;
  const canOutdent = module.parent_module_id !== null;

  const moduleKebab: KebabMenuOption[] = [
    { label: "Edit", onSelect: onEdit },
    {
      label: "+ Submodule",
      onSelect: () => {
        void onAddSubmodule();
      },
    },
    {
      label: "Duplicate",
      onSelect: () => {
        void onDuplicateModule();
      },
    },
    {
      label: "Indent",
      disabled: !canIndent,
      hint: canIndent ? "Nest under the module above" : "No preceding sibling to nest under",
      onSelect: () => {
        void onIndentModule();
      },
    },
    {
      label: "Outdent",
      disabled: !canOutdent,
      hint: canOutdent ? "Promote out of parent" : "Already at the top level",
      onSelect: () => {
        void onOutdentModule();
      },
    },
    { label: "Move to…", onSelect: onMoveModule },
    { label: "Lock until…", onSelect: onLockModule },
    { label: "Delete", destructive: true, onSelect: onDelete },
  ];

  const isDragging = draggedModuleId === module.id;
  const isDescendantOfDragged = draggedDescendants.has(module.id);
  const dragActive = draggedModuleId !== null && !isDragging && !isDescendantOfDragged;
  // `flatModules` is part of the recursive contract; ModuleCard doesn't read
  // it directly but ModuleNodeView relies on it to build the tree. Keep
  // destructured for TS visibility. `siblings` IS now read directly by the
  // keyboard-reorder wiring on the grip handle, so it no longer needs the
  // void-suppress.
  void flatModules;

  // Student locked surface: render header + items but disable interactions.
  const studentLockedClass =
    isStudent && lockedNow ? "opacity-60 pointer-events-none select-text" : "";

  // Insertion-bar visibility flags resolved from the page-level dropTarget.
  const showBarBefore =
    dropTarget?.anchorId === module.id && dropTarget.position === "before";
  // "after" bar ONLY fires for sibling drops (not asChild). asChild drops
  // are rendered INSIDE the children container by ModuleNodeView so the
  // user sees the bar+ghost visually inside the parent — much clearer than
  // a bar appearing below the parent row at depth+1.
  const showBarAfter =
    dropTarget?.anchorId === module.id &&
    dropTarget.position === "after" &&
    !dropTarget.asChild;
  // Resolve the dragged module's display name so the InsertionBar can render
  // a ghost preview of WHERE the dragged module will land (not just the bar).
  // flatModules is already a prop — single lookup, no extra state.
  const draggedName =
    draggedModuleId && (showBarBefore || showBarAfter)
      ? flatModules.find((m) => m.id === draggedModuleId)?.name
      : undefined;
  // When the current drop will nest INSIDE this module, light up the row
  // with an indigo ring + bg tint so the user has unambiguous confirmation
  // of which module they're nesting under — without this the depth shift
  // of the bar alone wasn't visible enough at second-layer + nests.
  const isNestTargetParent =
    dropTarget?.anchorId === module.id &&
    dropTarget.position === "after" &&
    dropTarget.asChild;

  return (
    <div>
      {showBarBefore && (
        <div className="mb-1">
          <InsertionBar
            depth={dropTarget!.depth}
            parentName={`Before ${module.name}`}
            draggedName={draggedName}
          />
        </div>
      )}
      <div
        className={`${depth > 0 ? "rounded-xl" : "rounded-2xl"} bg-white dark:bg-slate-900 ring-1 overflow-visible transition-colors ${
          isNestTargetParent
            ? "ring-2 ring-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/30"
            : recentlyMovedId === module.id
              ? "ring-2 ring-indigo-500 animate-pulse"
              : "ring-slate-200 dark:ring-slate-800"
        } ${isDragging ? "opacity-40" : ""}`}
        draggable={canEdit}
        onDragStart={(e) => {
          // Stop propagation so a nested drag handle doesn't fire twice.
          e.stopPropagation();
          onModuleDragStart();
        }}
        onDragEnd={() => {
          onModuleDragEnd();
        }}
        onDragOver={(e) => {
          if (!dragActive || !draggedModuleId) return;
          e.preventDefault();
          const rect = e.currentTarget.getBoundingClientRect();
          const target = resolveDropTarget(
            module,
            depth,
            e.clientY,
            e.clientX,
            rect,
            draggedModuleId,
            draggedDescendants,
            flatModules,
          );
          // EDGE: resolver returns null for self / descendant (would form a
          // cycle). Clear the previously-painted indicator so it doesn't
          // appear "stuck" on the last valid target — the user needs to see
          // that this row is NOT a valid drop.
          if (!target) {
            if (dropTargetRef.current) setDropTarget(null);
            return;
          }
          const cur = dropTargetRef.current;
          if (
            !cur ||
            cur.anchorId !== target.anchorId ||
            cur.position !== target.position ||
            cur.asChild !== target.asChild
          ) {
            setDropTarget(target);
          }
        }}
        onDrop={(e) => {
          if (!dragActive) return;
          const cur = dropTargetRef.current;
          if (!cur) return;
          e.preventDefault();
          e.stopPropagation();
          void onCommitDrop(cur);
        }}
      >
      <div
        className={`flex items-center gap-2 ${depth > 0 ? "px-2.5 py-2" : "px-3 py-3"} border-b border-slate-200 dark:border-slate-800 transition-colors ${
          isNestTargetParent
            ? "bg-indigo-100 dark:bg-indigo-950/60"
            : "bg-slate-50/50 dark:bg-slate-900/50"
        } ${isDragging ? "animate-pulse" : ""}`}
      >
        {canEdit && (
          (() => {
            // Position context for the aria-label so screen readers can
            // announce "Module 3 of 7" — re-computed on every render so
            // after a swap the label is correct without manual sync.
            const canMoveUp = siblingIndex > 0;
            const canMoveDown = siblingIndex < siblings.length - 1;
            const positionContext = `Module ${siblingIndex + 1} of ${siblings.length}`;
            const hintParts: string[] = [];
            if (canMoveUp) hintParts.push("Alt+Up to move up");
            if (canMoveDown) hintParts.push("Alt+Down to move down");
            const hint = hintParts.length > 0
              ? `. Press ${hintParts.join(", ")}`
              : "";
            return (
              <button
                type="button"
                data-module-grip={module.id}
                tabIndex={0}
                aria-label={`Reorder ${module.name}. ${positionContext}${hint}.`}
                title="Drag to reorder, or focus and press Alt+↑ / Alt+↓"
                onKeyDown={(e) => {
                  // Only react to Alt-modified arrows + Esc. Bail otherwise
                  // so Tab / Shift+Tab and other shortcuts pass through.
                  if (e.key === "Escape") {
                    e.preventDefault();
                    (e.currentTarget as HTMLButtonElement).blur();
                    return;
                  }
                  if (!e.altKey) return;
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    if (!canMoveUp) return;
                    void onKeyboardReorderModule("up");
                  } else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    if (!canMoveDown) return;
                    void onKeyboardReorderModule("down");
                  }
                }}
                // Stop drag-handle clicks from toggling the row's expand
                // chevron sitting next to it.
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center justify-center flex-none rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900"
              >
                <DragHandle className="text-slate-500" compact={depth > 0} />
              </button>
            );
          })()
        )}
        {canEdit && selectMode && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelected}
            onClick={(e) => e.stopPropagation()}
            aria-label={selected ? "Deselect module" : "Select module"}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 flex-none"
          />
        )}
        <button
          type="button"
          onClick={onToggleExpand}
          aria-expanded={expanded}
          className="min-h-[40px] min-w-[40px] md:min-h-0 md:min-w-0 md:w-6 md:h-6 inline-flex items-center justify-center flex-none rounded text-slate-700 dark:text-slate-200 hover:bg-indigo-100 dark:hover:bg-indigo-950/60 hover:text-indigo-700 dark:hover:text-indigo-200 transition-colors"
          title={expanded ? "Collapse" : "Expand"}
        >
          <svg
            width={12}
            height={12}
            viewBox="0 0 12 12"
            aria-hidden
            className={`transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
          >
            <path d="M4 2 L8 6 L4 10 Z" fill="currentColor" />
          </svg>
        </button>

        <div className="flex-1 min-w-0 flex items-center gap-2">
          {canEdit ? (
            <InlineRename
              value={module.name}
              disabled={false}
              onSave={onRenameModule}
              titleClassName={`font-semibold text-slate-900 dark:text-slate-100 ${depth > 0 ? "text-sm" : ""}`}
            />
          ) : (
            <span
              className={`font-semibold text-slate-900 dark:text-slate-100 truncate ${depth > 0 ? "text-sm" : ""}`}
            >
              {module.name}
            </span>
          )}

          {module.children.length > 0 && (
            <span
              title={`${module.children.length} submodule${module.children.length === 1 ? "" : "s"}`}
              className="text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-2 py-0.5 flex-none"
            >
              {module.children.length}{" "}
              {module.children.length === 1 ? "submodule" : "submodules"}
            </span>
          )}
          {module.items.length > 0 && (
            <span
              title={`${module.items.length} item${module.items.length === 1 ? "" : "s"}`}
              className="text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-2 py-0.5 flex-none"
            >
              {module.items.length}{" "}
              {module.items.length === 1 ? "item" : "items"}
            </span>
          )}

          {isStudent && lockedNow && module.lock_at && (
            <span
              title={`Locked since ${new Date(module.lock_at).toLocaleString()}`}
              className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1"
            >
              <LockIcon /> Locked since {new Date(module.lock_at).toLocaleDateString()}
            </span>
          )}
          {!isStudent && module.lock_at && (
            <span className="text-xs text-slate-500 dark:text-slate-400 truncate flex items-center gap-1">
              <LockIcon /> {new Date(module.lock_at).toLocaleString()}
            </span>
          )}
          {module.opens_at && (
            <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
              opens {new Date(module.opens_at).toLocaleString()}
            </span>
          )}
        </div>

        {/* Explicit "Drop here ↓" pill when this module is the asChild
            drop target. Sits right of the title so the user sees a direct
            visual handoff between the parent row and the bar+ghost rendered
            INSIDE the children container below. */}
        {isNestTargetParent && (
          <span
            aria-hidden
            className="inline-flex items-center gap-1 rounded-full bg-indigo-600 text-white text-[11px] font-semibold uppercase tracking-wide px-2 py-1 shadow-sm animate-pulse flex-none"
          >
            Drop here <span aria-hidden>↓</span>
          </span>
        )}
        {canEdit ? (
          <>
            <OptimisticPublishToggle
              published={module.published}
              rowKey={`module:${module.id}`}
              onCommit={onTogglePublishCommit}
            />
            <KebabMenu options={moduleKebab} />
          </>
        ) : (
          <PublishBadge published={module.published} />
        )}
      </div>

      {expanded && (
        <div
          className={`divide-y divide-slate-100 dark:divide-slate-800 ${studentLockedClass}`}
          // EDGE: clear the item indicator when the cursor leaves the items
          // container entirely (e.g. moves to another module's items, the
          // header, or off-screen). Mirror of the modules-list onDragLeave.
          onDragLeave={(e) => {
            if (!draggedItemId) return;
            const next = e.relatedTarget;
            if (next instanceof Node && e.currentTarget.contains(next)) {
              return; // moved to a child — keep indicator
            }
            if (
              itemDropTargetRef.current &&
              itemDropTargetRef.current.moduleId === module.id
            ) {
              setItemDropTarget(null);
            }
          }}
        >
          {/* Empty-items zone: visible only while dragging an item. Drop here
              to land as the module's first item. */}
          {module.items.length === 0 && canEdit && draggedItemId ? (
            <div
              aria-hidden
              onDragOver={(e) => {
                if (!draggedItemId) return;
                e.preventDefault();
              }}
              onDrop={(e) => {
                if (!draggedItemId) return;
                e.preventDefault();
                e.stopPropagation();
                void onItemDropOnEmptyModule(module.id);
              }}
              className="m-3 h-12 rounded-lg border-2 border-dashed border-indigo-300 dark:border-indigo-800 bg-indigo-50/30 dark:bg-indigo-950/20 flex items-center justify-center text-[11px] font-medium text-indigo-700 dark:text-indigo-300"
            >
              Drop here as first item
            </div>
          ) : module.items.length === 0 ? (
            <div className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400 text-center">
              <div>No items yet.</div>
              <div className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
                Add an Assignment, Practice Test, Question Set, Header, or Link.
              </div>
            </div>
          ) : null}
          {module.items.map((item) => {
            const isAssignment =
              item.item_type === "assignment" && item.item_ref_id;
            // Full-length tests are stored as link items pointing at the
            // Bluebook runner (/test/:slug). Surface them with a "Test" tag
            // rather than the generic 🔗 link icon.
            const isFullTestLink =
              item.item_type === "link" && !!item.url?.startsWith("/test/");
            // Inline rename is the canvas equivalent for "Edit" — kebab only
            // surfaces actions that are actually wired up.
            const itemKebab: KebabMenuOption[] = [
              {
                label: "Indent",
                disabled: item.indent >= 5,
                hint: item.indent >= 5 ? "Already at the deepest level" : "Nest one level deeper",
                onSelect: () => {
                  void onSetItemIndent(item, 1);
                },
              },
              {
                label: "Outdent",
                disabled: item.indent <= 0,
                hint: item.indent <= 0 ? "Already at the left margin" : "Move one level left",
                onSelect: () => {
                  void onSetItemIndent(item, -1);
                },
              },
              { label: "Move to…", onSelect: () => onMoveItem(item) },
              {
                label: "Delete",
                destructive: true,
                onSelect: () => {
                  void onDeleteItem(item);
                },
              },
            ];
            const completed = completedIds.has(item.id);
            const isItemDragging = draggedItemId === item.id;
            const showItemBarBefore =
              itemDropTarget?.anchorItemId === item.id &&
              itemDropTarget.position === "before";
            const showItemBarAfter =
              itemDropTarget?.anchorItemId === item.id &&
              itemDropTarget.position === "after";
            return (
              <Fragment key={item.id}>
                {showItemBarBefore && (
                  <div className="px-3">
                    <InsertionBar
                      depth={0}
                      parentName={`Before ${item.title}`}
                      draggedName={draggedItemId
                        ? (module.items.find((i) => i.id === draggedItemId)?.title
                          ?? flatModules.flatMap((m) => m.items).find((i) => i.id === draggedItemId)?.title)
                        : undefined}
                    />
                  </div>
                )}
              <div
                draggable={canEdit}
                onDragStart={(e) => {
                  e.stopPropagation();
                  onItemDragStart(item);
                }}
                onDragEnd={onItemDragEnd}
                onDragOver={(e) => {
                  if (!draggedItemId) return;
                  e.preventDefault();
                  const rect = e.currentTarget.getBoundingClientRect();
                  const target = resolveItemDropTarget(
                    item,
                    e.clientY,
                    rect,
                    draggedItemId,
                  );
                  // The resolver returns null for self-drop. Mirror the module
                  // behavior: clear the indicator so it doesn't appear "stuck"
                  // on the previous valid target.
                  if (!target) {
                    if (itemDropTargetRef.current) setItemDropTarget(null);
                    return;
                  }
                  // Cross-module drops: the resolver naturally sets moduleId
                  // from the anchor's module_id, so dropping on a row in a
                  // different module retargets to that module automatically.
                  const cur = itemDropTargetRef.current;
                  if (
                    !cur ||
                    cur.anchorItemId !== target.anchorItemId ||
                    cur.position !== target.position ||
                    cur.moduleId !== target.moduleId
                  ) {
                    setItemDropTarget(target);
                  }
                }}
                onDrop={(e) => {
                  if (!draggedItemId) return;
                  const cur = itemDropTargetRef.current;
                  if (!cur) return;
                  e.preventDefault();
                  e.stopPropagation();
                  void onCommitItemDrop(cur);
                }}
                className={`flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-opacity ${
                  isItemDragging ? "opacity-50" : ""
                } ${
                  recentlyMovedId === item.id
                    ? "ring-2 ring-indigo-500 animate-pulse rounded-lg"
                    : ""
                }`}
                style={{ paddingLeft: `${0.75 + item.indent * 1.25}rem` }}
              >
                {canEdit && <DragHandle className="text-slate-400 flex-none" />}
                {isFullTestLink ? (
                  <span className="flex-none inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                    Test
                  </span>
                ) : (
                  <ItemTypeIcon type={item.item_type} />
                )}
                {isAssignment ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (item.item_ref_id) onOpenAssignment(item.item_ref_id);
                    }}
                    className="flex-1 text-left text-sm text-indigo-600 dark:text-indigo-400 hover:underline truncate"
                  >
                    {item.title}
                  </button>
                ) : isFullTestLink && item.url ? (
                  // Teachers proctor, they don't sit the test — a test link opens
                  // the per-test OVERVIEW (results + live status), same tab.
                  <Link
                    to={testOverviewPath(item.url.slice(6).split("/")[0])}
                    title="Open the proctor view — results & live status"
                    className="flex-1 text-sm text-indigo-600 dark:text-indigo-400 hover:underline truncate"
                  >
                    {item.title}
                  </Link>
                ) : item.item_type === "link" && item.url ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-sm text-indigo-600 dark:text-indigo-400 hover:underline truncate"
                  >
                    {item.title}
                  </a>
                ) : canEdit ? (
                  <InlineRename
                    value={item.title}
                    disabled={false}
                    onSave={(next) => onRenameItem(item, next)}
                    className="flex-1"
                    titleClassName={
                      item.item_type === "header"
                        ? "text-sm font-semibold text-slate-700 dark:text-slate-200"
                        : "text-sm text-slate-700 dark:text-slate-200"
                    }
                  />
                ) : (
                  <span
                    className={`flex-1 text-sm truncate ${
                      item.item_type === "header"
                        ? "font-semibold text-slate-700 dark:text-slate-200"
                        : "text-slate-700 dark:text-slate-200"
                    }`}
                  >
                    {item.title}
                  </span>
                )}

                {canEdit ? (
                  <>
                    <OptimisticPublishToggle
                      published={item.published}
                      rowKey={`item:${item.id}`}
                      onCommit={() => onToggleItemPublished(item)}
                    />
                    <KebabMenu options={itemKebab} />
                  </>
                ) : (
                  <>
                    <PublishBadge published={item.published} />
                    {isStudent && (
                      <input
                        type="checkbox"
                        checked={completed}
                        onChange={() => {
                          void onToggleItemCompleted(item.id, !completed);
                        }}
                        title={completed ? "Mark incomplete" : "Mark complete"}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                    )}
                  </>
                )}
              </div>
                {showItemBarAfter && (
                  <div className="px-3">
                    <InsertionBar
                      depth={0}
                      parentName={item.title}
                      draggedName={draggedItemId
                        ? (module.items.find((i) => i.id === draggedItemId)?.title
                          ?? flatModules.flatMap((m) => m.items).find((i) => i.id === draggedItemId)?.title)
                        : undefined}
                    />
                  </div>
                )}
              </Fragment>
            );
          })}
          {canEdit && (
            <div className="px-4 py-2.5">
              {inlineAddingItem ? (
                <InlineAddItemRow
                  classId={classId}
                  module={module}
                  usedAssignmentIds={usedAssignmentIds}
                  onCommitted={() => {
                    onCancelInlineItem();
                    void onRefresh();
                  }}
                  onCommittedKeepOpen={() => {
                    void onRefresh();
                  }}
                  onCancel={onCancelInlineItem}
                />
              ) : (
                <button
                  type="button"
                  onClick={onAddItem}
                  className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  + Add item
                </button>
              )}
            </div>
          )}
        </div>
      )}
      </div>
      {showBarAfter && (
        <div className="mt-1">
          <InsertionBar
            depth={dropTarget!.depth}
            asChild={dropTarget!.asChild}
            parentName={module.name}
            draggedName={draggedName}
          />
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Recursive tree node wrapper
// -----------------------------------------------------------------------------

export function ModuleNodeView(props: ModuleNodeViewProps): JSX.Element {
  const {
    node,
    depth,
    siblings,
    siblingIndex,
    flatModules,
    canEdit,
    isStudent,
    expandedFor,
    toggleExpanded,
    completedIds,
    draggedModuleId,
    draggedDescendants,
    draggedItemId,
    recentlyMovedId,
    dropTarget,
    dropTargetRef,
    setDropTarget,
    itemDropTarget,
    itemDropTargetRef,
    setItemDropTarget,
    addingItemToModuleId,
    classId,
    usedAssignmentIds,
    onCancelInlineItem,
    onEditModule,
    onDeleteModule,
    onTogglePublishModule,
    onAddItem,
    onAddSubmodule,
    onOpenAssignment,
    onRefresh,
    onRenameModule,
    onDuplicateModule,
    onLockModule,
    onMoveModule,
    onIndentModule,
    onOutdentModule,
    onKeyboardReorderModule,
    onMoveItem,
    onToggleItemCompleted,
    onModuleDragStart,
    onModuleDragEnd,
    onCommitDrop,
    onItemDragStart,
    onItemDragEnd,
    onCommitItemDrop,
    onItemDropOnEmptyModule,
    selectMode,
    isSelected,
    onToggleSelected,
  } = props;

  const expanded = expandedFor(node.id);

  // Tree structure indication: no more loud indigo elbow connectors.
  // The vertical guide line in the children container + the row's indent +
  // chevron carry the hierarchy at a glance. Indigo is reserved for
  // interactive states (drag target, active selection); structural elements
  // stay slate so they read as quiet "scaffolding" instead of competing for
  // attention with content.
  //
  // Modern reference: Notion / Linear / Apple Notes all use indent + chevron
  // alone with at most a subtle gutter line. They never use brand-colored
  // structural lines because brand color = "this is interactive" and tree
  // lines aren't.
  const elbowClass = "";

  return (
    <div className={elbowClass}>
      <ModuleCard
        node={node}
        depth={depth}
        siblings={siblings}
        siblingIndex={siblingIndex}
        flatModules={flatModules}
        canEdit={canEdit}
        isStudent={isStudent}
        expanded={expanded}
        completedIds={completedIds}
        draggedModuleId={draggedModuleId}
        draggedDescendants={draggedDescendants}
        draggedItemId={draggedItemId}
        recentlyMovedId={recentlyMovedId}
        dropTarget={dropTarget}
        dropTargetRef={dropTargetRef}
        setDropTarget={setDropTarget}
        itemDropTarget={itemDropTarget}
        itemDropTargetRef={itemDropTargetRef}
        setItemDropTarget={setItemDropTarget}
        inlineAddingItem={addingItemToModuleId === node.id}
        classId={classId}
        usedAssignmentIds={usedAssignmentIds}
        onCancelInlineItem={onCancelInlineItem}
        onToggleExpand={() => toggleExpanded(node.id)}
        onEdit={() => onEditModule(node)}
        onDelete={() => onDeleteModule(node)}
        onTogglePublishCommit={() => onTogglePublishModule(node)}
        onAddItem={() => onAddItem(node)}
        onAddSubmodule={() => onAddSubmodule(node)}
        onOpenAssignment={onOpenAssignment}
        onRefresh={onRefresh}
        onRenameModule={(next) => onRenameModule(node, next)}
        onDuplicateModule={() => onDuplicateModule(node)}
        onLockModule={() => onLockModule(node)}
        onMoveModule={() => onMoveModule(node)}
        onIndentModule={() => onIndentModule(node, siblings, siblingIndex)}
        onOutdentModule={() => onOutdentModule(node)}
        onKeyboardReorderModule={(direction) =>
          onKeyboardReorderModule(node, siblings, siblingIndex, direction)
        }
        onMoveItem={onMoveItem}
        onToggleItemCompleted={onToggleItemCompleted}
        onModuleDragStart={() => onModuleDragStart(node)}
        onModuleDragEnd={onModuleDragEnd}
        onCommitDrop={onCommitDrop}
        onItemDragStart={onItemDragStart}
        onItemDragEnd={onItemDragEnd}
        onCommitItemDrop={onCommitItemDrop}
        onItemDropOnEmptyModule={onItemDropOnEmptyModule}
        selectMode={selectMode}
        selected={isSelected(node.id)}
        onToggleSelected={() => onToggleSelected(node.id)}
      />
      {(() => {
        // Render the children container if:
        //   (a) the module is expanded and has children (normal case), OR
        //   (b) this module is the asChild drop target — even if no
        //       children exist or it's collapsed — so the user SEES the bar
        //       + ghost preview inside the container they're nesting into.
        const isNestDropTarget =
          dropTarget?.anchorId === node.id &&
          dropTarget.position === "after" &&
          dropTarget.asChild;
        const showRealChildren = expanded && node.children.length > 0;
        if (!showRealChildren && !isNestDropTarget) return null;

        const ghostName =
          isNestDropTarget && draggedModuleId
            ? flatModules.find((m) => m.id === draggedModuleId)?.name
            : undefined;

        return (
          <div
            className={
              // Tinted inset block: children visually sit INSIDE the parent
              // module. Indented from the left (so the parent's drag handle/
              // expander still align with its row), tinted background +
              // border + thicker left rule make it unambiguous that the
              // rows inside belong to the parent above. When this container
              // is an active asChild drop target the rule pops to indigo
              // (active interaction); otherwise slate (passive structure).
              "relative ml-6 mt-3 p-3 space-y-3 rounded-xl border transition-colors " +
              "bg-slate-50/70 dark:bg-slate-900/40 " +
              "before:absolute before:left-0 before:top-3 before:bottom-3 before:w-[3px] before:rounded-full transition-colors " +
              (isNestDropTarget
                ? "border-indigo-400 dark:border-indigo-700 before:bg-indigo-500 dark:before:bg-indigo-400 "
                : "border-slate-200 dark:border-slate-800 before:bg-slate-300 dark:before:bg-slate-700 ")
            }
            aria-label="Submodules"
          >
            {/* asChild insertion bar + ghost preview lives INSIDE the
                children container so it visually appears as a child slot.
                Rendered FIRST so it shows as the soon-to-be first child. */}
            {isNestDropTarget && (
              <div className="relative">
                <InsertionBar
                  depth={0}
                  asChild
                  parentName={node.name}
                  draggedName={ghostName}
                />
              </div>
            )}
            {showRealChildren &&
              node.children.map((child, idx) => (
                <ModuleNodeView
                  key={child.id}
                  {...props}
                  node={child}
                  depth={depth + 1}
                  siblings={node.children}
                  siblingIndex={idx}
                />
              ))}
          </div>
        );
      })()}
    </div>
  );
}
