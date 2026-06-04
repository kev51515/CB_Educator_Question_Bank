/**
 * ModulesPage
 * ===========
 * Canvas-style Modules surface for a course. Default landing tab inside
 * /courses/:courseId. Lists every course_module for the course as a
 * collapsible card; each card lists its module_items.
 *
 * Wave 8B (this revision) layers Canvas-equivalent UX on top:
 *   - Visible 6-dot drag handles on rows & item rows (existing native HTML5
 *     drag-and-drop still drives reorder).
 *   - Inline rename for module + item titles (click-to-edit, Enter/Esc).
 *   - Persisted collapse state per (user, course) via localStorage.
 *   - Top toolbar with collapse/expand-all, publish-all, +Module.
 *   - Kebab menus on each module + item (Duplicate / Lock-until / Move…).
 *   - One-click publish toggles via the round status indicator.
 *   - Student surface: completion ticks via `module_item_completion` +
 *     `mark_item_complete` RPC, plus a locked-module read-only display.
 *
 * Wave 8A's database contract (lock_at column, completion table, RPCs:
 * duplicate_module / move_item_to_module / toggle_module_publish /
 * toggle_item_publish / mark_item_complete) is assumed available at runtime.
 * If an RPC is missing in dev the error surfaces via `actionError` and the
 * UI continues to function for everything else.
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useClassContext } from "./classLayoutContext";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/lib/profile";
import {
  courseAssignmentPath,
  testOverviewPath,
} from "@/lib/routes";
import {
  buildTree,
  useCourseModules,
  type CourseModule,
  type ModuleItem,
  type ModuleNode,
} from "./useCourseModules";
import { useMyModuleCompletion } from "./useMyModuleCompletion";
import {
  resolveDropTarget,
  resolveItemDropTarget,
  type DropTarget,
  type ItemDropTarget,
  collapseKey,
  readCollapseState,
  writeCollapseState,
  DragHandle,
  InsertionBar,
  OptimisticPublishToggle,
  PublishBadge,
  InlineRename,
  LockUntilPicker,
  MoveItemPicker,
  MoveModulePicker,
  InlineCreateModuleRow,
  InlineAddItemRow,
} from "@/teacher/modules-page";
import { EditModuleModal } from "./EditModuleModal";
import { KebabMenu, type KebabMenuOption } from "@/components";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/Skeleton";
import { ConfirmDialog } from "./ConfirmDialog";

// -----------------------------------------------------------------------------
// Small shared UI bits
// -----------------------------------------------------------------------------

/**
 * Auto-scroll the viewport when the user drags near its top/bottom edges.
 * Notion/Linear pattern — lets users reach items currently out of view as
 * drop targets without manually scrolling. Local (not extracted) per
 * project convention (see CLAUDE.md).
 */
function useAutoScrollOnDrag(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    let rafId: number | null = null;
    let velocity = 0;
    const EDGE = 80; // px from viewport edge that triggers scroll
    const MAX_SPEED = 18; // px per frame

    const onDragOver = (e: DragEvent): void => {
      const y = e.clientY;
      const vh = window.innerHeight;
      if (y < EDGE) {
        velocity = -MAX_SPEED * (1 - y / EDGE);
      } else if (y > vh - EDGE) {
        velocity = MAX_SPEED * (1 - (vh - y) / EDGE);
      } else {
        velocity = 0;
      }
      if (velocity !== 0 && rafId === null) {
        const step = (): void => {
          window.scrollBy(0, velocity);
          if (velocity !== 0) {
            rafId = requestAnimationFrame(step);
          } else {
            rafId = null;
          }
        };
        rafId = requestAnimationFrame(step);
      }
    };
    const onDragEnd = (): void => {
      velocity = 0;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("dragend", onDragEnd);
    document.addEventListener("drop", onDragEnd);
    return () => {
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("dragend", onDragEnd);
      document.removeEventListener("drop", onDragEnd);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [active]);
}


// -----------------------------------------------------------------------------
// Module card
// -----------------------------------------------------------------------------

const ITEM_TYPE_ICON: Record<ModuleItem["item_type"], string> = {
  assignment: "📝",
  header: "▸",
  link: "🔗",
  page: "📄",
  file: "📎",
};

/**
 * Notion/Linear-style drop target. A single anchor row + relative position +
 * cursor-X depth resolution. `asChild` is only valid when position==="after"
 * and means "nest as the last child of the anchor".
 */

interface ModuleNodeViewProps {
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
              🔒 Locked since {new Date(module.lock_at).toLocaleDateString()}
            </span>
          )}
          {!isStudent && module.lock_at && (
            <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
              🔒 {new Date(module.lock_at).toLocaleString()}
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
                  <span aria-hidden className="text-sm flex-none">
                    {ITEM_TYPE_ICON[item.item_type]}
                  </span>
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

function ModuleNodeView(props: ModuleNodeViewProps): JSX.Element {
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

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

export function ModulesPage(): JSX.Element {
  // The URL param `courseId` is the user-facing slug (short_code OR legacy
  // UUID). We MUST use the resolved UUID from context for every downstream
  // hook + RPC — otherwise PostgreSQL rejects with `invalid input syntax
  // for type uuid` when the slug is a short_code like "69WAJ3".
  const { cls } = useClassContext();
  const navigate = useNavigate();
  const { profile } = useProfile();
  const classId: string | null = cls?.id ?? null;
  const { modules, loading, error, refresh, patchModule } = useCourseModules(classId);

  const toast = useToast();
  const isStudent = profile?.role === "student";
  const canEdit = useMemo(() => {
    const role = profile?.role;
    return role === "teacher" || role === "admin";
  }, [profile?.role]);

  // Persisted collapse state keyed by (user, course).
  const persistKey = collapseKey(profile?.id ?? null, classId);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    readCollapseState(persistKey),
  );
  useEffect(() => {
    setCollapsed(readCollapseState(persistKey));
  }, [persistKey]);
  useEffect(() => {
    writeCollapseState(persistKey, collapsed);
  }, [persistKey, collapsed]);

  const expandedFor = useCallback(
    (moduleId: string): boolean => !(collapsed[moduleId] ?? false),
    [collapsed],
  );

  // Inline-create replaces the old "Add module" modal. When non-null an
  // input row renders above the modules list with the cursor focused inside;
  // Enter commits, Esc cancels. See `commitInlineCreateModule` below.
  const [inlineCreatingModule, setInlineCreatingModule] = useState<
    null | { busy: boolean }
  >(null);
  const [editingModule, setEditingModule] = useState<CourseModule | null>(null);
  const [addingItemToModule, setAddingItemToModule] =
    useState<CourseModule | null>(null);
  const [deletingModule, setDeletingModule] = useState<CourseModule | null>(
    null,
  );
  const [lockingModule, setLockingModule] = useState<CourseModule | null>(null);
  const [movingItem, setMovingItem] = useState<ModuleItem | null>(null);
  const [movingModule, setMovingModule] = useState<ModuleNode | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Bulk-select state — checkboxes render on every module row when selectMode
  // is on, and the sticky action bar appears at the bottom when one or more
  // modules are selected. The "Select"/"Done" toolbar button is the only
  // entry/exit point in v1; we also reset on window resize / browser back to
  // avoid stale selection state surviving navigation.
  const [selectMode, setSelectMode] = useState<boolean>(false);
  const [selectedModuleIds, setSelectedModuleIds] = useState<Set<string>>(
    () => new Set<string>(),
  );
  const [bulkBusy, setBulkBusy] = useState<boolean>(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState<boolean>(false);

  const exitSelectMode = useCallback((): void => {
    setSelectMode(false);
    setSelectedModuleIds(new Set<string>());
  }, []);

  const toggleSelectedModule = useCallback((moduleId: string): void => {
    setSelectedModuleIds((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  }, []);

  const isModuleSelected = useCallback(
    (moduleId: string): boolean => selectedModuleIds.has(moduleId),
    [selectedModuleIds],
  );

  // Auto-exit select mode on window resize + browser back (clean state).
  useEffect(() => {
    if (!selectMode) return;
    const onResize = (): void => exitSelectMode();
    const onPop = (): void => exitSelectMode();
    window.addEventListener("resize", onResize);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("popstate", onPop);
    };
  }, [selectMode, exitSelectMode]);

  // Prune selection if modules disappear (delete elsewhere, refresh, etc.).
  useEffect(() => {
    if (selectedModuleIds.size === 0) return;
    const live = new Set(modules.map((m) => m.id));
    let changed = false;
    const next = new Set<string>();
    for (const id of selectedModuleIds) {
      if (live.has(id)) next.add(id);
      else changed = true;
    }
    if (changed) setSelectedModuleIds(next);
  }, [modules, selectedModuleIds]);

  // Drag state — separate per granularity. Mirrored to refs so the hot
  // onDragOver / onDrop handlers can read the latest value without picking
  // up a stale closure from a prior render. setX/setItem wrappers update
  // both the React state and the ref atomically.
  const [draggedModuleId, setDraggedModuleIdState] = useState<string | null>(null);
  const draggedModuleIdRef = useRef<string | null>(null);
  const setDraggedModuleId = useCallback((id: string | null): void => {
    draggedModuleIdRef.current = id;
    setDraggedModuleIdState(id);
  }, []);
  const [draggedItem, setDraggedItemState] = useState<ModuleItem | null>(null);
  const draggedItemRef = useRef<ModuleItem | null>(null);
  const setDraggedItem = useCallback((item: ModuleItem | null): void => {
    draggedItemRef.current = item;
    setDraggedItemState(item);
  }, []);
  // Concurrent-drop guard. Without this a slow RPC could leave a 2nd drop
  // racing through before the 1st reconciles (would produce inconsistent
  // server state). Read/set inside commitDrop / commitItemDrop.
  const dropBusyRef = useRef<boolean>(false);
  // Drop-landing pulse: row (module or item) that just landed pulses indigo
  // briefly so the user has unambiguous "yes, it moved there" confirmation
  // beyond just the position change. The timer id is tracked so a fresh
  // drop cancels the previous pulse (no stacking) and unmount cleans up.
  const [recentlyMovedId, setRecentlyMovedId] = useState<string | null>(null);
  const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerPulse = useCallback((id: string): void => {
    setRecentlyMovedId(id);
    if (pulseTimerRef.current !== null) clearTimeout(pulseTimerRef.current);
    pulseTimerRef.current = setTimeout(() => {
      setRecentlyMovedId(null);
      pulseTimerRef.current = null;
    }, 1200);
  }, []);
  useEffect(() => {
    return () => {
      if (pulseTimerRef.current !== null) clearTimeout(pulseTimerRef.current);
    };
  }, []);

  // Live region for assistive-tech announcements of keyboard reorders.
  // The Alt+↑/Alt+↓ shortcut on the focused grip handle writes a sentence
  // here (e.g. "Moved 'Week 1' down. Now 4 of 7."), which is read out by
  // screen readers via aria-live="polite". Cleared after a short delay so
  // subsequent moves with the same destination index still re-announce.
  const [reorderAnnouncement, setReorderAnnouncement] = useState<string>("");
  const reorderAnnouncementTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!reorderAnnouncement) return;
    if (reorderAnnouncementTimerRef.current !== null) {
      clearTimeout(reorderAnnouncementTimerRef.current);
    }
    reorderAnnouncementTimerRef.current = setTimeout(() => {
      setReorderAnnouncement("");
      reorderAnnouncementTimerRef.current = null;
    }, 2000);
    return () => {
      if (reorderAnnouncementTimerRef.current !== null) {
        clearTimeout(reorderAnnouncementTimerRef.current);
        reorderAnnouncementTimerRef.current = null;
      }
    };
  }, [reorderAnnouncement]);
  // Notion/Linear-style auto-scroll near viewport edges during any drag.
  useAutoScrollOnDrag(draggedModuleId !== null || draggedItem !== null);
  // Notion/Linear-style global drop indicator. Mirrored to a ref so that the
  // (rapid-fire, stale-closure-prone) onDragOver row handlers can read the
  // latest value without re-binding on every state update.
  const [dropTarget, setDropTargetState] = useState<DropTarget | null>(null);
  const dropTargetRef = useRef<DropTarget | null>(null);
  const setDropTarget = useCallback((target: DropTarget | null): void => {
    dropTargetRef.current = target;
    setDropTargetState(target);
  }, []);
  // Mirror state for the item-drop indicator. Items are flat (no nesting),
  // so the ItemDropTarget shape is simpler than DropTarget — but the
  // ref-mirroring pattern is the same to avoid stale-closure hits in the
  // rapid-fire per-row onDragOver handlers.
  const [itemDropTarget, setItemDropTargetState] =
    useState<ItemDropTarget | null>(null);
  const itemDropTargetRef = useRef<ItemDropTarget | null>(null);
  const setItemDropTarget = useCallback(
    (target: ItemDropTarget | null): void => {
      itemDropTargetRef.current = target;
      setItemDropTargetState(target);
    },
    [],
  );

  // Tree derived from flat modules. Memoized so child nodes are stable across
  // unrelated re-renders.
  const tree = useMemo<ModuleNode[]>(() => buildTree(modules), [modules]);

  // Flatten depth-first for selectors that need every node (Move-To picker,
  // descendant lookup, etc.). Sibling order matches the rendered tree.
  const flatNodes = useMemo<ModuleNode[]>(() => {
    const out: ModuleNode[] = [];
    const walk = (nodes: readonly ModuleNode[]): void => {
      for (const n of nodes) {
        out.push(n);
        if (n.children.length > 0) walk(n.children);
      }
    };
    walk(tree);
    return out;
  }, [tree]);

  // childrenByParent: parentId|null → siblings sorted by position. Used for
  // computing reorder ids when dropping siblings.
  const childrenByParent = useMemo<Map<string | null, ModuleNode[]>>(() => {
    const map = new Map<string | null, ModuleNode[]>();
    map.set(null, tree);
    const walk = (nodes: readonly ModuleNode[]): void => {
      for (const n of nodes) {
        map.set(n.id, n.children);
        if (n.children.length > 0) walk(n.children);
      }
    };
    walk(tree);
    return map;
  }, [tree]);

  // Descendants of the currently dragged node (for cycle prevention in UI).
  const draggedDescendants = useMemo<Set<string>>(() => {
    const set = new Set<string>();
    if (!draggedModuleId) return set;
    const start = flatNodes.find((n) => n.id === draggedModuleId);
    if (!start) return set;
    const walk = (nodes: readonly ModuleNode[]): void => {
      for (const n of nodes) {
        set.add(n.id);
        if (n.children.length > 0) walk(n.children);
      }
    };
    walk(start.children);
    return set;
  }, [draggedModuleId, flatNodes]);

  const usedAssignmentIds = useMemo(() => {
    const s = new Set<string>();
    for (const m of modules) {
      for (const it of m.items) {
        if (it.item_type === "assignment" && it.item_ref_id) {
          s.add(it.item_ref_id);
        }
      }
    }
    return s;
  }, [modules]);

  const maxModulePosition = modules.reduce(
    (max, m) => (m.position > max ? m.position : max),
    -1,
  );

  // Student completion state — read-only for staff.
  const allItemIds = useMemo(() => {
    const ids: string[] = [];
    for (const m of modules) for (const it of m.items) ids.push(it.id);
    return ids;
  }, [modules]);
  const completion = useMyModuleCompletion(allItemIds, isStudent === true);

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------

  const onToggleModulePublished = useCallback(
    async (m: CourseModule): Promise<void> => {
      // Optimistic-friendly: throw on failure so the wrapping useOptimistic
      // can roll back. We still surface a toast via useOptimistic's
      // errorMessage path, plus refresh on success to converge with realtime.
      const { error: rpcError } = await supabase.rpc("toggle_module_publish", {
        p_module_id: m.id,
      });
      if (rpcError) {
        // Fallback: direct UPDATE.
        const { error: updError } = await supabase
          .from("course_modules")
          .update({ published: !m.published })
          .eq("id", m.id);
        if (updError) {
          throw new Error(updError.message);
        }
      }
      // Optimistic: patch the one module locally instead of a full refetch, so
      // publishing doesn't flash/reflow the whole list (the toggle already
      // reflects the new state instantly).
      patchModule(m.id, { published: !m.published });
    },
    [patchModule],
  );

  const onRenameModule = useCallback(
    async (moduleId: string, next: string, previous?: string): Promise<void> => {
      const { error: updError } = await supabase
        .from("course_modules")
        .update({ name: next })
        .eq("id", moduleId);
      if (updError) {
        setActionError(updError.message);
        toast.error("Couldn't rename module", updError.message);
        return;
      }
      // Offer Undo when we know the previous title and it actually changed.
      // The undo callback re-runs the rename without re-offering Undo, so we
      // can't infinite-loop on rollback failures.
      const canUndo = previous !== undefined && previous !== next;
      toast.success("Module renamed", next, canUndo ? {
        action: {
          label: "Undo",
          onAction: () => {
            void (async () => {
              const { error: undoError } = await supabase
                .from("course_modules")
                .update({ name: previous })
                .eq("id", moduleId);
              if (undoError) {
                toast.error("Couldn't undo rename", undoError.message);
                return;
              }
              await refresh();
            })();
          },
        },
      } : undefined);
      await refresh();
    },
    [refresh, toast],
  );

  const onDuplicateModule = useCallback(
    async (moduleId: string): Promise<void> => {
      const { error: rpcError } = await supabase.rpc("duplicate_module", {
        p_module_id: moduleId,
      });
      if (rpcError) {
        setActionError(rpcError.message);
        toast.error("Couldn't duplicate module", rpcError.message);
        return;
      }
      toast.success("Module duplicated");
      await refresh();
    },
    [refresh, toast],
  );

  const onApplyLock = useCallback(
    async (moduleId: string, iso: string | null): Promise<void> => {
      const { error: updError } = await supabase
        .from("course_modules")
        .update({ lock_at: iso })
        .eq("id", moduleId);
      if (updError) {
        setActionError(updError.message);
        toast.error("Couldn't update lock date", updError.message);
        return;
      }
      setLockingModule(null);
      toast.success(iso ? "Lock date set" : "Lock date cleared");
      await refresh();
    },
    [refresh, toast],
  );

  const onMoveItemApply = useCallback(
    async (itemId: string, targetModuleId: string, position: number): Promise<void> => {
      const { error: rpcError } = await supabase.rpc("move_item_to_module", {
        p_item_id: itemId,
        p_target_module_id: targetModuleId,
        p_position: position,
      });
      if (rpcError) {
        setActionError(rpcError.message);
        toast.error("Couldn't move item", rpcError.message);
        return;
      }
      setMovingItem(null);
      toast.success("Item moved");
      await refresh();
    },
    [refresh, toast],
  );

  const onConfirmDeleteModule = useCallback(async (): Promise<void> => {
    if (!deletingModule) return;
    const { error: delError } = await supabase
      .from("course_modules")
      .delete()
      .eq("id", deletingModule.id);
    if (delError) {
      setActionError(delError.message);
      toast.error("Couldn't delete module", delError.message);
      return;
    }
    const deletedName = deletingModule.name;
    setDeletingModule(null);
    toast.success("Module deleted", deletedName);
    await refresh();
  }, [deletingModule, refresh, toast]);

  // ---- Module move (atomic via move_module RPC) ----
  const callMoveModule = useCallback(
    async (
      moduleId: string,
      newParentId: string | null,
      newPosition: number,
    ): Promise<boolean> => {
      const { error: rpcError } = await supabase.rpc("move_module", {
        p_module_id: moduleId,
        p_new_parent_id: newParentId,
        p_new_position: newPosition,
      });
      if (rpcError) {
        setActionError(rpcError.message);
        toast.error("Couldn't move module", rpcError.message);
        return false;
      }
      toast.success("Module moved");
      await refresh();
      return true;
    },
    [refresh, toast],
  );

  // Convert a resolved DropTarget into (newParentId, newPosition) for
  // callMoveModule. `newPosition` is the index AMONG SIBLINGS at the new
  // level (NOT a global position). When `asChild` is set we append to the
  // anchor's children; otherwise we insert before/after the anchor among
  // its existing siblings.
  const commitDrop = useCallback(
    async (target: DropTarget): Promise<void> => {
      if (!draggedModuleId) return;
      // Concurrent-drop guard: ignore re-fires while a previous RPC is in
      // flight (slow network + rapid second drag → 2 RPCs with inconsistent
      // state otherwise).
      if (dropBusyRef.current) return;
      dropBusyRef.current = true;
      const siblings = childrenByParent.get(target.parentId) ?? [];
      let newPosition: number;
      if (target.asChild) {
        newPosition = siblings.length;
      } else {
        const anchorIdx = siblings.findIndex((s) => s.id === target.anchorId);
        if (anchorIdx < 0) newPosition = siblings.length;
        else newPosition = target.position === "before" ? anchorIdx : anchorIdx + 1;
      }
      const draggedId = draggedModuleId;
      setDraggedModuleId(null);
      setDropTarget(null);
      try {
        const ok = await callMoveModule(draggedId, target.parentId, newPosition);
        // Only pulse on actual success — otherwise the user gets misleading
        // "yes that worked" feedback after a failed RPC.
        if (ok) triggerPulse(draggedId);
      } finally {
        dropBusyRef.current = false;
      }
    },
    [callMoveModule, childrenByParent, draggedModuleId, setDraggedModuleId, setDropTarget, triggerPulse],
  );

  const onIndentModule = useCallback(
    async (
      node: ModuleNode,
      siblings: readonly ModuleNode[],
      idx: number,
    ): Promise<void> => {
      if (idx <= 0) return;
      const newParent = siblings[idx - 1];
      const newPosition = (childrenByParent.get(newParent.id) ?? []).length;
      await callMoveModule(node.id, newParent.id, newPosition);
    },
    [callMoveModule, childrenByParent],
  );

  const onOutdentModule = useCallback(
    async (node: ModuleNode): Promise<void> => {
      if (node.parent_module_id === null) return;
      const parent = flatNodes.find((n) => n.id === node.parent_module_id);
      if (!parent) return;
      const grandparentId = parent.parent_module_id;
      const grandparentSiblings = childrenByParent.get(grandparentId) ?? [];
      const parentIdx = grandparentSiblings.findIndex((s) => s.id === parent.id);
      const newPosition = parentIdx < 0 ? grandparentSiblings.length : parentIdx + 1;
      await callMoveModule(node.id, grandparentId, newPosition);
    },
    [callMoveModule, childrenByParent, flatNodes],
  );

  // ---- Keyboard reorder (Alt+↑ / Alt+↓ on a focused grip) ----------------
  // Swap a module with its previous/next sibling within the same parent.
  // We use the same `move_module` RPC as drag-to-reorder so persistence is
  // identical — there's exactly one server-side source of truth for module
  // order. After the RPC resolves and `refresh()` rebuilds the tree, we
  // refocus the SAME grip (queried by data-module-grip="<id>") so the user
  // can press Alt+↓ again and walk a module down the list in one motion.
  const onKeyboardReorderModule = useCallback(
    async (
      node: ModuleNode,
      siblings: readonly ModuleNode[],
      idx: number,
      direction: "up" | "down",
    ): Promise<void> => {
      const newIdx = direction === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= siblings.length) return; // boundary no-op
      const moduleName = node.name;
      const { error: rpcError } = await supabase.rpc("move_module", {
        p_module_id: node.id,
        p_new_parent_id: node.parent_module_id,
        p_new_position: newIdx,
      });
      if (rpcError) {
        toast.error("Couldn't move module", rpcError.message);
        return;
      }
      triggerPulse(node.id);
      // Announce to assistive tech BEFORE refresh, so screen readers don't
      // race with the DOM update.
      const newPositionContext = `Now ${newIdx + 1} of ${siblings.length}`;
      setReorderAnnouncement(
        `Moved ${moduleName} ${direction}. ${newPositionContext}.`,
      );
      toast.success(`Moved '${moduleName}' ${direction}`);
      await refresh();
      // Restore focus to the same grip in its new DOM position. We wait one
      // animation frame so React has committed the post-refresh tree.
      requestAnimationFrame(() => {
        const grip = document.querySelector<HTMLButtonElement>(
          `[data-module-grip="${node.id}"]`,
        );
        grip?.focus();
      });
    },
    [refresh, toast, triggerPulse],
  );

  const onAddSubmodule = useCallback(
    async (parent: ModuleNode): Promise<void> => {
      if (!classId) return;
      const siblings = childrenByParent.get(parent.id) ?? [];
      const position = siblings.length;
      const { error: insertError } = await supabase
        .from("course_modules")
        .insert({
          course_id: classId,
          name: "New submodule",
          position,
          published: false,
          opens_at: null,
          parent_module_id: parent.id,
        });
      if (insertError) {
        setActionError(insertError.message);
        toast.error("Couldn't add submodule", insertError.message);
        return;
      }
      // Expand parent so the newly inserted child is visible.
      setCollapsed((prev) => ({ ...prev, [parent.id]: false }));
      toast.success("Submodule added");
      await refresh();
    },
    [classId, childrenByParent, refresh, toast],
  );

  // Inline-create handler used by the InlineCreateModuleRow at the top of
  // the list. Defaults the new module to draft + no lock date — the user
  // can flip publish via the one-click badge, set the lock date via the
  // kebab. This is the Linear/Notion pattern: cheapest possible create.
  const commitInlineCreateModule = useCallback(
    async (name: string): Promise<boolean> => {
      if (!classId) return false;
      const trimmed = name.trim();
      if (trimmed.length === 0) return false;
      setInlineCreatingModule({ busy: true });
      const { error: insertError } = await supabase
        .from("course_modules")
        .insert({
          course_id: classId,
          name: trimmed,
          position: maxModulePosition + 1,
          published: false,
          opens_at: null,
        });
      if (insertError) {
        setInlineCreatingModule({ busy: false });
        toast.error("Couldn't create module", insertError.message);
        return false;
      }
      setInlineCreatingModule(null);
      toast.success("Module created", trimmed);
      await refresh();
      return true;
    },
    [classId, maxModulePosition, refresh, toast],
  );

  // ---- Item drop (Notion/Linear-style, unified across same- and cross-module) ----
  // Same-module reorders use reorder_module_items (cheaper, position-array
  // contract); cross-module moves use move_item_to_module. The resolver gave
  // us (anchorItem, position) — we translate that to either an ordered id
  // list or a target (moduleId, position).
  const commitItemDrop = useCallback(
    async (target: ItemDropTarget): Promise<void> => {
      if (!draggedItem) return;
      const draggedId = draggedItem.id;
      const sourceModuleId = draggedItem.module_id;
      const targetModuleId = target.moduleId;
      const anchorItemId = target.anchorItemId;
      const targetModule = modules.find((m) => m.id === targetModuleId);
      if (!targetModule) {
        setDraggedItem(null);
        setItemDropTarget(null);
        return;
      }
      const anchorIdx = targetModule.items.findIndex(
        (i) => i.id === anchorItemId,
      );
      if (anchorIdx < 0) {
        setDraggedItem(null);
        setItemDropTarget(null);
        return;
      }
      // Always clear the drag/indicator state before the network round-trip so
      // a slow RPC doesn't leave a stale ghost indicator on the previous row.
      setDraggedItem(null);
      setItemDropTarget(null);

      if (sourceModuleId === targetModuleId) {
        // Same-module reorder via reorder_module_items.
        const fromIndex = targetModule.items.findIndex(
          (i) => i.id === draggedId,
        );
        if (fromIndex < 0) return;
        const next = targetModule.items.slice();
        const [moved] = next.splice(fromIndex, 1);
        // Re-find anchor after splice (it may have shifted by one).
        const adjAnchorIdx = next.findIndex((i) => i.id === anchorItemId);
        const insertAt =
          target.position === "before" ? adjAnchorIdx : adjAnchorIdx + 1;
        next.splice(insertAt, 0, moved);
        const orderedIds = next.map((i) => i.id);
        const { error: rpcError } = await supabase.rpc(
          "reorder_module_items",
          {
            p_module_id: targetModuleId,
            p_ordered_ids: orderedIds,
          },
        );
        if (rpcError) {
          setActionError(rpcError.message);
          toast.error("Couldn't reorder items", rpcError.message);
          return;
        }
        toast.success("Items reordered");
        await refresh();
        triggerPulse(draggedId);
        return;
      }

      // Cross-module move via move_item_to_module. Position is 0-based among
      // destination items (anchor index ± 1 depending on before/after).
      const newPosition =
        target.position === "before" ? anchorIdx : anchorIdx + 1;
      const { error: rpcError } = await supabase.rpc("move_item_to_module", {
        p_item_id: draggedId,
        p_target_module_id: targetModuleId,
        p_position: newPosition,
      });
      if (rpcError) {
        setActionError(rpcError.message);
        toast.error("Couldn't move item", rpcError.message);
        return;
      }
      toast.success("Item moved");
      await refresh();
      triggerPulse(draggedId);
    },
    [draggedItem, modules, refresh, setItemDropTarget, toast],
  );

  // Empty-module drop: append the dragged item as the first/only item in the
  // target module. Uses move_item_to_module with position 0.
  const commitItemDropOnEmptyModule = useCallback(
    async (targetModuleId: string): Promise<void> => {
      if (!draggedItem) return;
      const draggedId = draggedItem.id;
      if (draggedItem.module_id === targetModuleId) {
        setDraggedItem(null);
        setItemDropTarget(null);
        return;
      }
      setDraggedItem(null);
      setItemDropTarget(null);
      const { error: rpcError } = await supabase.rpc("move_item_to_module", {
        p_item_id: draggedId,
        p_target_module_id: targetModuleId,
        p_position: 0,
      });
      if (rpcError) {
        setActionError(rpcError.message);
        toast.error("Couldn't move item", rpcError.message);
        return;
      }
      toast.success("Item moved");
      await refresh();
      triggerPulse(draggedId);
    },
    [draggedItem, refresh, setDraggedItem, setItemDropTarget, toast, triggerPulse],
  );

  // ---- Toolbar actions ----
  const collapseAll = useCallback((): void => {
    const next: Record<string, boolean> = {};
    for (const m of modules) next[m.id] = true;
    setCollapsed(next);
  }, [modules]);

  const expandAll = useCallback((): void => {
    setCollapsed({});
  }, []);

  const allCollapsed = useMemo(() => {
    if (modules.length === 0) return false;
    return modules.every((m) => collapsed[m.id] === true);
  }, [collapsed, modules]);

  const publishAll = useCallback(async (): Promise<void> => {
    // Direct UPDATE per the spec — the toggle_module_publish RPC is per-row
    // and flips state, which isn't what we want for a "publish all" action.
    const ids = modules.filter((m) => !m.published).map((m) => m.id);
    if (ids.length === 0) return;
    const { error: updError } = await supabase
      .from("course_modules")
      .update({ published: true })
      .in("id", ids);
    if (updError) {
      setActionError(updError.message);
      toast.error("Couldn't publish modules", updError.message);
      return;
    }
    toast.success(
      ids.length === 1 ? "Module published" : `${ids.length} modules published`,
    );
    // Optimistic: flip each published module locally (batched) — no full refetch.
    for (const id of ids) patchModule(id, { published: true });
  }, [modules, patchModule, toast]);

  // ---- Bulk-select actions ----
  const bulkSetPublished = useCallback(
    async (nextPublished: boolean): Promise<void> => {
      const ids = Array.from(selectedModuleIds);
      if (ids.length === 0) return;
      setBulkBusy(true);
      const { error: updError } = await supabase
        .from("course_modules")
        .update({ published: nextPublished })
        .in("id", ids);
      setBulkBusy(false);
      if (updError) {
        setActionError(updError.message);
        toast.error(
          nextPublished
            ? "Couldn't publish modules"
            : "Couldn't unpublish modules",
          updError.message,
        );
        return;
      }
      const verb = nextPublished ? "published" : "unpublished";
      toast.success(
        nextPublished ? "Modules published" : "Modules unpublished",
        `${ids.length} module${ids.length === 1 ? "" : "s"} ${verb}.`,
      );
      exitSelectMode();
      await refresh();
    },
    [exitSelectMode, refresh, selectedModuleIds, toast],
  );

  const bulkDelete = useCallback(async (): Promise<void> => {
    const ids = Array.from(selectedModuleIds);
    if (ids.length === 0) {
      setBulkDeleteOpen(false);
      return;
    }
    setBulkBusy(true);
    const { error: delError } = await supabase
      .from("course_modules")
      .delete()
      .in("id", ids);
    setBulkBusy(false);
    setBulkDeleteOpen(false);
    if (delError) {
      setActionError(delError.message);
      toast.error("Couldn't delete modules", delError.message);
      return;
    }
    toast.success(
      "Modules deleted",
      `${ids.length} module${ids.length === 1 ? "" : "s"} removed.`,
    );
    exitSelectMode();
    await refresh();
  }, [exitSelectMode, refresh, selectedModuleIds, toast]);

  if (loading) {
    return (
      <div className="space-y-4">
        <SkeletonRows count={3} rowClassName="h-24" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Modules
        </h2>

        <div className="flex flex-wrap items-center gap-2">
          {modules.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (allCollapsed) expandAll();
                else collapseAll();
              }}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 ring-1 ring-slate-200 dark:ring-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {allCollapsed ? "Expand all" : "Collapse all"}
            </button>
          )}
          {canEdit && modules.length > 0 && (
            <button
              type="button"
              onClick={() => {
                void publishAll();
              }}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-300 dark:ring-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
            >
              Publish all
            </button>
          )}
          {canEdit && modules.length > 0 && (
            selectMode ? (
              <button
                type="button"
                onClick={exitSelectMode}
                className="rounded-full px-3 py-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-400 dark:ring-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-950/60"
              >
                Done
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setSelectMode(true)}
                className="rounded-full px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 ring-1 ring-slate-200 dark:ring-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Select
              </button>
            )
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => setInlineCreatingModule({ busy: false })}
              className="rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-1.5"
            >
              + Module
            </button>
          )}
        </div>
      </div>

      {(error || actionError) && (
        <div
          role="alert"
          className="rounded-md bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-sm text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-900"
        >
          {error ?? actionError}
        </div>
      )}

      {/* Visually-hidden live region for Alt+↑/Alt+↓ keyboard-reorder
          announcements. role="status" + aria-live="polite" lets screen
          readers announce position changes without interrupting other speech.
          aria-atomic ensures the FULL sentence is read each time, not just
          the diff. Sighted users get the same info via the toast + the
          updated grip aria-label. */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {reorderAnnouncement}
      </div>

      {inlineCreatingModule && (
        <InlineCreateModuleRow
          busy={inlineCreatingModule.busy}
          onCommit={(name) => commitInlineCreateModule(name)}
          onCancel={() => setInlineCreatingModule(null)}
        />
      )}

      {modules.length === 0 && !inlineCreatingModule ? (
        <EmptyState
          title="No modules yet"
          body="Modules group your assignments, pages, and links into sections — like chapters."
          cta={
            canEdit
              ? {
                  label: "+ Add your first module",
                  onClick: () => setInlineCreatingModule({ busy: false }),
                }
              : undefined
          }
        />
      ) : (
        <div
          className="space-y-3 relative"
          // EDGE: when the user drags out of the modules region entirely
          // (e.g. into the page header, sidebar, or off-screen), the
          // indicator must clear — otherwise it stays painted at the last
          // hovered row even though the drop will go nowhere.
          onDragLeave={(e) => {
            if (!draggedModuleId) return;
            const next = e.relatedTarget;
            if (
              next instanceof Node &&
              e.currentTarget.contains(next)
            ) {
              return; // moved to a child — keep indicator
            }
            if (dropTargetRef.current) setDropTarget(null);
          }}
        >
          {tree.map((node, idx) => (
            <ModuleNodeView
              key={node.id}
              node={node}
              depth={0}
              siblings={tree}
              siblingIndex={idx}
              flatModules={flatNodes}
              canEdit={canEdit}
              isStudent={isStudent === true}
              expandedFor={expandedFor}
              toggleExpanded={(moduleId) =>
                setCollapsed((prev) => ({
                  ...prev,
                  [moduleId]: !(prev[moduleId] ?? false),
                }))
              }
              completedIds={completion.completed}
              draggedModuleId={draggedModuleId}
              draggedDescendants={draggedDescendants}
              draggedItemId={draggedItem?.id ?? null}
              recentlyMovedId={recentlyMovedId}
              dropTarget={dropTarget}
              dropTargetRef={dropTargetRef}
              setDropTarget={setDropTarget}
              itemDropTarget={itemDropTarget}
              itemDropTargetRef={itemDropTargetRef}
              setItemDropTarget={setItemDropTarget}
              addingItemToModuleId={addingItemToModule?.id ?? null}
              classId={classId ?? ""}
              usedAssignmentIds={usedAssignmentIds}
              onCancelInlineItem={() => setAddingItemToModule(null)}
              onEditModule={(m) => setEditingModule(m)}
              onDeleteModule={(m) => setDeletingModule(m)}
              onTogglePublishModule={(m) => onToggleModulePublished(m)}
              onAddItem={(m) => setAddingItemToModule(m)}
              onAddSubmodule={onAddSubmodule}
              onOpenAssignment={(assignmentId) => {
                if (classId)
                  navigate(courseAssignmentPath(classId, assignmentId));
              }}
              onRefresh={refresh}
              onRenameModule={(m, next) => onRenameModule(m.id, next, m.name)}
              onDuplicateModule={(m) => onDuplicateModule(m.id)}
              onLockModule={(m) => setLockingModule(m)}
              onMoveModule={(m) => setMovingModule(m)}
              onIndentModule={onIndentModule}
              onOutdentModule={onOutdentModule}
              onKeyboardReorderModule={onKeyboardReorderModule}
              onMoveItem={(item) => setMovingItem(item)}
              onToggleItemCompleted={(itemId, next) =>
                completion.toggle(itemId, next)
              }
              onModuleDragStart={(m) => setDraggedModuleId(m.id)}
              onModuleDragEnd={() => {
                setDraggedModuleId(null);
                setDropTarget(null);
              }}
              onCommitDrop={commitDrop}
              onItemDragStart={(item) => setDraggedItem(item)}
              onItemDragEnd={() => {
                // EDGE: always clear both pieces of drag state on dragend
                // (covers drop-outside-zone, ESC-cancel, etc.). Without
                // setItemDropTarget(null) here the indicator could persist
                // after a cancelled drag.
                setDraggedItem(null);
                setItemDropTarget(null);
              }}
              onCommitItemDrop={commitItemDrop}
              onItemDropOnEmptyModule={commitItemDropOnEmptyModule}
              selectMode={selectMode}
              isSelected={isModuleSelected}
              onToggleSelected={toggleSelectedModule}
            />
          ))}
          {/* EDGE: drop tail — catches drops that land below the last
              top-level module. Without this, dragging past the end of the
              list does nothing (no row's "after" zone is hit). Painted as a
              subtle 32px zone that highlights only during drag. */}
          {canEdit && draggedModuleId && tree.length > 0 && (
            <div
              aria-hidden
              onDragOver={(e) => {
                if (!draggedModuleId) return;
                e.preventDefault();
                const lastTop = tree[tree.length - 1];
                // Self-drop guard: if the dragged module IS the last
                // top-level, dropping on the tail is a no-op (would target
                // itself). Skip to avoid a wasted RPC + misleading toast.
                if (lastTop.id === draggedModuleId) return;
                const target = {
                  anchorId: lastTop.id,
                  position: "after" as const,
                  asChild: false,
                  parentId: null,
                  depth: 0,
                };
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
                if (!draggedModuleId) return;
                e.preventDefault();
                const cur = dropTargetRef.current;
                if (cur) void commitDrop(cur);
              }}
              className="h-8 rounded-lg border-2 border-dashed border-indigo-300 dark:border-indigo-800 bg-indigo-50/30 dark:bg-indigo-950/20 flex items-center justify-center text-[11px] font-medium text-indigo-700 dark:text-indigo-300"
            >
              Drop here to append at the end
            </div>
          )}
        </div>
      )}

      {canEdit && selectMode && selectedModuleIds.size > 0 && (
        <div
          role="region"
          aria-label="Bulk module actions"
          className="fixed bottom-4 left-0 right-0 z-50 px-3 pointer-events-none"
        >
          <div className="pointer-events-auto mx-auto max-w-3xl rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-indigo-300 dark:ring-indigo-700 shadow-xl px-4 py-2.5 flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {selectedModuleIds.size} selected
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => {
                  void bulkSetPublished(true);
                }}
                className="rounded-full px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-300 dark:ring-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {bulkBusy ? "Working…" : "Publish all"}
              </button>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => {
                  void bulkSetPublished(false);
                }}
                className="rounded-full px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 ring-1 ring-amber-300 dark:ring-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Unpublish all
              </button>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => setBulkDeleteOpen(true)}
                className="rounded-full px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Delete
              </button>
            </div>
            <button
              type="button"
              onClick={exitSelectMode}
              disabled={bulkBusy}
              className="ml-auto text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-50"
            >
              Clear selection
            </button>
          </div>
        </div>
      )}

      {bulkDeleteOpen && (
        <ConfirmDialog
          title={`Delete ${selectedModuleIds.size} module${selectedModuleIds.size === 1 ? "" : "s"}?`}
          body={`Delete ${selectedModuleIds.size} module${selectedModuleIds.size === 1 ? "" : "s"} and all their items? This cannot be undone.`}
          confirmLabel="Delete modules"
          destructive
          busy={bulkBusy}
          onConfirm={() => {
            void bulkDelete();
          }}
          onCancel={() => setBulkDeleteOpen(false)}
        />
      )}

      <EditModuleModal
        open={!!editingModule}
        module={editingModule}
        onClose={() => setEditingModule(null)}
        onUpdated={() => {
          void refresh();
        }}
      />

      {deletingModule && (
        <ConfirmDialog
          title={`Delete "${deletingModule.name}"?`}
          body="This permanently removes the module and every item inside it. Assignments themselves are not deleted."
          confirmLabel="Delete module"
          destructive
          onConfirm={() => {
            void onConfirmDeleteModule();
          }}
          onCancel={() => setDeletingModule(null)}
        />
      )}

      {lockingModule && (
        <LockUntilPicker
          initial={lockingModule.lock_at}
          onApply={(iso) => onApplyLock(lockingModule.id, iso)}
          onClose={() => setLockingModule(null)}
        />
      )}

      {movingItem && (
        <MoveItemPicker
          item={movingItem}
          modules={modules}
          onApply={(targetModuleId, position) =>
            onMoveItemApply(movingItem.id, targetModuleId, position)
          }
          onClose={() => setMovingItem(null)}
        />
      )}

      {movingModule && (
        <MoveModulePicker
          module={movingModule}
          flat={flatNodes}
          descendantIds={
            // Compute descendants of the move target so they're disabled in
            // the parent dropdown (cycle prevention mirror of the trigger).
            new Set(
              (() => {
                const out: string[] = [];
                const walk = (nodes: readonly ModuleNode[]): void => {
                  for (const n of nodes) {
                    out.push(n.id);
                    if (n.children.length > 0) walk(n.children);
                  }
                };
                const start = flatNodes.find((n) => n.id === movingModule.id);
                if (start) walk(start.children);
                return out;
              })(),
            )
          }
          onApply={async (newParentId, newPosition) => {
            await callMoveModule(movingModule.id, newParentId, newPosition);
            setMovingModule(null);
          }}
          onClose={() => setMovingModule(null)}
        />
      )}
    </div>
  );
}

