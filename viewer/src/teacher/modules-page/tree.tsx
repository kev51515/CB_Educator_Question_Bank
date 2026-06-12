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
import { Fragment, memo, useCallback, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { testOverviewPath } from "@/lib/routes";
import { KebabMenu, type KebabMenuOption } from "@/components";
import { useToast } from "@/components/Toast";
import { useProfile } from "@/lib/profile";
import { canAccessQuestionBank } from "@/lib/access";
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
import { EditTestModulesModal } from "./EditTestModulesModal";

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
    <span
      aria-hidden
      className="h-7 w-7 flex-none inline-flex items-center justify-center rounded-lg bg-slate-50 dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700 text-slate-500 dark:text-slate-400"
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-[15px] w-[15px]"
      >
        {paths[type]}
      </svg>
    </span>
  );
}

/**
 * Sunken icon tile for full-test links — clock face per the Ivy Ledger
 * mockup's "Practice Test" type icon (replaces the old uppercase TEST chip;
 * the kind label under the title now carries the wording).
 */
function FullTestIcon(): JSX.Element {
  return (
    <span
      aria-hidden
      className="h-7 w-7 flex-none inline-flex items-center justify-center rounded-lg bg-slate-50 dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700 text-indigo-600 dark:text-indigo-400"
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-[15px] w-[15px]"
      >
        <circle cx="12" cy="13" r="7.5" />
        <path d="M12 9.5V13l2.5 2M10 2.5h4" />
      </svg>
    </span>
  );
}

/** Uppercase micro kind label rendered under each item title (mockup's
 *  .item-kind type hierarchy). Derived purely from item_type already in
 *  memory. */
const ITEM_KIND_LABEL: Record<ModuleItem["item_type"], string> = {
  assignment: "Assignment",
  page: "Page",
  link: "Link",
  file: "File",
  header: "Header",
};

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

/** Small clock glyph for the due-date label on item rows. */
function ClockIcon(): JSX.Element {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="h-2.5 w-2.5 flex-none"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

/**
 * Relative-time label for lock/open timestamps (AssignmentDetailPage's
 * formatRelativeDue pattern, generalised to look both forward AND back since a
 * lock can already be in the past). Returns "" for a null/invalid ISO so the
 * caller can skip rendering. The absolute ISO stays available via a `title`
 * tooltip on the rendered span for precise hover detail.
 */
function formatRelativeTime(iso: string | null): string {
  if (!iso) return "";
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return "";
  const diffMs = target - Date.now();
  const past = diffMs < 0;
  const abs = Math.abs(diffMs);
  const min = Math.round(abs / 60_000);
  const hr = Math.round(abs / 3_600_000);
  const day = Math.round(abs / 86_400_000);
  const phrase =
    min < 1
      ? "just now"
      : min < 60
        ? `${min} min`
        : hr < 24
          ? `${hr} hr${hr === 1 ? "" : "s"}`
          : day === 1
            ? "1 day"
            : `${day} days`;
  if (phrase === "just now") return phrase;
  return past ? `${phrase} ago` : `in ${phrase}`;
}

/**
 * Notion/Linear-style drop target. A single anchor row + relative position +
 * cursor-X depth resolution. `asChild` is only valid when position==="after"
 * and means "nest as the last child of the anchor".
 */

export interface ModuleNodeViewProps {
  node: ModuleNode;
  /**
   * True when an ANCESTOR module is draft — propagates the darker-grey draft
   * wash down the whole subtree so an unpublished section reads as one inert
   * block (a draft parent's submodules are greyed too, even if individually
   * published, since students can't see the subtree anyway). Root call omits
   * it (defaults false).
   */
  inheritedDraft?: boolean;
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
  onItemDropOnEmptyModule: (moduleId: string, where?: "start" | "end") => Promise<void>;
  // Bulk-select wiring
  selectMode: boolean;
  isSelected: (moduleId: string) => boolean;
  onToggleSelected: (moduleId: string) => void;
}

interface ModuleHeaderProps {
  node: ModuleNode;
  /**
   * This module is draft, OR an ancestor is — the whole draft subtree gets a
   * darker-grey wash so an unpublished section reads as one inert block.
   */
  effectiveDraft: boolean;
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
  onItemDropOnEmptyModule: (moduleId: string, where?: "start" | "end") => Promise<void>;
  // Bulk-select wiring
  selectMode: boolean;
  selected: boolean;
  onToggleSelected: () => void;
}

const ModuleCard = memo(function ModuleCard({
  node: module,
  effectiveDraft,
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
  const { profile } = useProfile();
  // Question Bank item types are hidden in the add-item menu for non-allow-listed
  // educators; keep the empty-state hint consistent with what they can add.
  const canQbank = canAccessQuestionBank(profile?.email);

  // Per-item inline rename (works for link items too — see the kebab "Rename"
  // option below) and the full-test "Edit modules" picker modal.
  const [renamingItemId, setRenamingItemId] = useState<string | null>(null);
  const [editModulesItem, setEditModulesItem] = useState<ModuleItem | null>(null);
  // #6: header-level item drop. The empty-list "Drop here as first item" zone
  // only renders for an EXPANDED, EMPTY module — so a collapsed module, or a
  // module that already has items, had no cross-module item drop target. This
  // flag lights up the header row while an item is dragged over it; dropping
  // lands the item in this module (appended after existing items).
  const [itemHeaderHover, setItemHeaderHover] = useState(false);

  // Refs to the outer card/row containers so the GRIP (the actual drag source,
  // for touch-scroll safety) can render a drag PREVIEW of the whole card/row
  // rather than the tiny grip button. The module grip uses the single card
  // ref; item grips use a per-item Map keyed by item id.
  const moduleContainerRef = useRef<HTMLDivElement | null>(null);
  const itemContainerRefs = useRef<Map<string, HTMLDivElement>>(new Map());

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
      // Soft delete (0202): Trash with 90-day recovery.
      const { error } = await supabase.rpc("trash_content", {
        p_kind: "module_item",
        p_id: item.id,
      });
      if (error) {
        toast.error("Couldn't delete item", error.message);
        return;
      }
      toast.success("Moved to Trash", `${item.title} — recoverable for 90 days.`, {
        action: {
          label: "Undo",
          onAction: () => {
            void supabase
              .rpc("restore_content", { p_kind: "module_item", p_id: item.id })
              .then(({ error: restoreErr }) => {
                if (restoreErr) toast.error("Couldn't restore", restoreErr.message);
                else {
                  toast.success("Item restored", item.title);
                  void onRefresh();
                }
              });
          },
        },
      });
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
        ref={moduleContainerRef}
        className={`rounded-2xl ring-1 shadow-card overflow-visible transition-colors ${
          isNestTargetParent
            ? "bg-indigo-50/40 dark:bg-indigo-950/30 ring-2 ring-indigo-500"
            : recentlyMovedId === module.id
              ? `ring-2 ring-indigo-500 animate-pulse ${effectiveDraft ? "bg-slate-300 dark:bg-slate-800" : "bg-white dark:bg-slate-900"}`
              : effectiveDraft
                ? // Draft (or inside a draft ancestor): a much darker grey wash
                  // over the whole card so an unpublished section is obvious.
                  "bg-slate-300 dark:bg-slate-800/90 ring-slate-400/70 dark:ring-slate-600"
                : "bg-white dark:bg-slate-900 ring-slate-200 dark:ring-slate-800"
        } ${isDragging ? "opacity-40" : ""}`}
        // NOTE: the drag SOURCE (draggable + onDragStart/onDragEnd) lives on the
        // grip button below, NOT this container — so touching the card body
        // still scrolls on touch devices (the drag-drop-touch polyfill
        // preventDefaults touchstart on any `draggable` element). This div
        // stays a drop TARGET only.
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
        className={`flex items-center gap-2 ${depth > 0 ? "px-2.5 py-2" : "px-3 py-3"} ${
          expanded ? "border-b border-slate-200 dark:border-slate-800" : ""
        } transition-colors ${
          itemHeaderHover
            ? "bg-indigo-100 dark:bg-indigo-950/60 ring-2 ring-inset ring-indigo-400"
            : isNestTargetParent
              ? "bg-indigo-100 dark:bg-indigo-950/60"
              : ""
        } ${isDragging ? "animate-pulse" : ""}`}
        // #6: cross-module item drop onto the module HEADER. Only active while
        // an item is being dragged (draggedItemId set) AND it isn't already in
        // this module. preventDefault marks the row as a valid drop target;
        // stopPropagation keeps the card's module-DnD onDragOver from also
        // processing this event.
        onDragOver={(e) => {
          if (!canEdit || !draggedItemId) return;
          const isOwnItem = module.items.some((i) => i.id === draggedItemId);
          if (isOwnItem) return;
          e.preventDefault();
          e.stopPropagation();
          if (!itemHeaderHover) setItemHeaderHover(true);
        }}
        onDragLeave={(e) => {
          if (!draggedItemId) return;
          const next = e.relatedTarget;
          if (next instanceof Node && e.currentTarget.contains(next)) return;
          if (itemHeaderHover) setItemHeaderHover(false);
        }}
        onDrop={(e) => {
          if (!canEdit || !draggedItemId) return;
          const isOwnItem = module.items.some((i) => i.id === draggedItemId);
          if (isOwnItem) return;
          e.preventDefault();
          e.stopPropagation();
          setItemHeaderHover(false);
          void onItemDropOnEmptyModule(module.id, "end");
        }}
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
                // Drag SOURCE: only the grip starts a module drag, so the rest
                // of the card body remains scrollable on touch devices.
                draggable={canEdit}
                onDragStart={(e) => {
                  // Stop propagation so an ancestor drag handle doesn't fire twice.
                  e.stopPropagation();
                  // Render a preview of the whole card, not the tiny grip.
                  if (moduleContainerRef.current) {
                    e.dataTransfer.setDragImage(moduleContainerRef.current, 16, 16);
                  }
                  onModuleDragStart();
                }}
                onDragEnd={() => {
                  onModuleDragEnd();
                }}
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
                style={{ touchAction: "none" }}
                className="min-h-[40px] min-w-[40px] md:min-h-0 md:min-w-0 inline-flex items-center justify-center flex-none rounded-sm cursor-grab active:cursor-grabbing focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900"
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

        {/* Draft state is now carried by the darker-grey card wash + the amber
            Draft pill, so the title stays full-opacity and readable. */}
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
              className="text-xs text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap flex-none"
            >
              {module.children.length}{" "}
              {module.children.length === 1 ? "submodule" : "submodules"}
            </span>
          )}
          {module.items.length > 0 && (
            <span
              title={`${module.items.length} item${module.items.length === 1 ? "" : "s"}`}
              className="text-xs text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap flex-none"
            >
              {module.items.length}{" "}
              {module.items.length === 1 ? "item" : "items"}
            </span>
          )}

          {isStudent && lockedNow && module.lock_at && (
            <span
              title={new Date(module.lock_at).toLocaleString()}
              className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300 flex-none"
            >
              <LockIcon /> Locked {formatRelativeTime(module.lock_at)}
            </span>
          )}
          {!isStudent && module.lock_at && (
            <span
              title={new Date(module.lock_at).toLocaleString()}
              className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300 truncate"
            >
              <LockIcon /> {lockedNow ? "Locked" : "Locks"} {formatRelativeTime(module.lock_at)}
            </span>
          )}
          {module.opens_at && (
            <span
              title={new Date(module.opens_at).toLocaleString()}
              className="text-xs text-slate-500 dark:text-slate-400 truncate"
            >
              opens {formatRelativeTime(module.opens_at)}
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
          ) : null}
          {module.items.map((item) => {
            const isAssignment =
              item.item_type === "assignment" && item.item_ref_id;
            // Full-length tests are stored as link items pointing at the
            // Bluebook runner (/test/:slug). Surface them with a "Test" tag
            // rather than the generic 🔗 link icon.
            const isFullTestLink =
              item.item_type === "link" && !!item.url?.startsWith("/test/");
            // A subset link is /test/<slug>?m=<first>-<last>; carry that range
            // to the overview so the proctor view is scoped to THIS occurrence
            // (this course + these modules), not the test-wide aggregate.
            const fullTestSlug = isFullTestLink
              ? (item.url ?? "").slice(6).split("/")[0].split("?")[0]
              : "";
            const fullTestRange = isFullTestLink
              ? (item.url ?? "").match(/[?&]m=(\d+-\d+)/)?.[1]
              : undefined;
            // Inline rename is the canvas equivalent for "Edit" — kebab only
            // surfaces actions that are actually wired up.
            const itemKebab: KebabMenuOption[] = [
              {
                // Inline rename for ALL item types. For a full-test link the
                // title normally renders as a <Link> (can't click-to-edit in
                // place), so this kebab entry flips it into an InlineRename.
                label: "Rename",
                onSelect: () => setRenamingItemId(item.id),
              },
              ...(isFullTestLink
                ? [
                    {
                      // Change WHICH modules of the test this link deploys
                      // (its ?m=<first>-<last> range). Full-test links only.
                      label: "Edit modules",
                      onSelect: () => setEditModulesItem(item),
                    } as KebabMenuOption,
                  ]
                : []),
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
                ref={(el) => {
                  // Track each row's container element so its grip can render a
                  // drag preview of the whole row. Clean up on unmount.
                  if (el) itemContainerRefs.current.set(item.id, el);
                  else itemContainerRefs.current.delete(item.id);
                }}
                // Drag SOURCE lives on the item grip button below, NOT this
                // row container — keeps touch-scroll working over the row body.
                // This div stays a drop TARGET only.
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
                className={`group/item flex items-center gap-2 px-3 py-2.5 transition-colors ${
                  isItemDragging ? "opacity-50" : ""
                } ${
                  // Draft rows read clearly greyed so publish state is scannable
                  // at a glance (students can't see these): a grey wash on the
                  // whole row + the icon/title/meta dimmed below — while the
                  // amber Draft pill stays full-strength as the status signal.
                  !item.published && !isItemDragging
                    ? "bg-slate-100 dark:bg-slate-800/60 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/20"
                    : "hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20"
                } ${
                  recentlyMovedId === item.id
                    ? "ring-2 ring-indigo-500 animate-pulse rounded-lg"
                    : ""
                }`}
                style={{ paddingLeft: `${0.75 + item.indent * 1.25}rem` }}
              >
                {canEdit && (
                  <button
                    type="button"
                    data-item-grip={item.id}
                    aria-label={`Drag to reorder ${item.title}`}
                    title="Drag to reorder"
                    // Drag SOURCE: only the grip starts an item drag, so the
                    // rest of the row stays scrollable on touch devices.
                    draggable={canEdit}
                    onDragStart={(e) => {
                      e.stopPropagation();
                      const el = itemContainerRefs.current.get(item.id);
                      // Preview the whole row, not the tiny grip.
                      if (el) e.dataTransfer.setDragImage(el, 16, 16);
                      onItemDragStart(item);
                    }}
                    onDragEnd={onItemDragEnd}
                    onClick={(e) => e.stopPropagation()}
                    style={{ touchAction: "none" }}
                    className="min-h-[40px] min-w-[40px] md:min-h-0 md:min-w-0 inline-flex items-center justify-center flex-none rounded-sm cursor-grab active:cursor-grabbing focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900"
                  >
                    <DragHandle className="text-slate-400" />
                  </button>
                )}
                {/* Draft dim: fade the icon + title/meta (NOT the status pill or
                    controls), restoring on hover so editing never feels disabled. */}
                <span
                  className={`flex-none transition-opacity ${
                    !item.published && !isItemDragging
                      ? "opacity-50 group-hover/item:opacity-100"
                      : ""
                  }`}
                >
                  {isFullTestLink ? (
                    <FullTestIcon />
                  ) : (
                    <ItemTypeIcon type={item.item_type} />
                  )}
                </span>
                <div
                  className={`flex-1 min-w-0 flex flex-col transition-opacity ${
                    !item.published && !isItemDragging
                      ? "opacity-50 group-hover/item:opacity-100"
                      : ""
                  }`}
                >
                  {canEdit && renamingItemId === item.id ? (
                    // Kebab "Rename" flips ANY item into an inline editor — even
                    // a full-test link, whose title otherwise renders as a <Link>
                    // and can't be click-to-renamed in place.
                    <InlineRename
                      value={item.title}
                      disabled={false}
                      autoEdit
                      onCancel={() => setRenamingItemId(null)}
                      onSave={async (next) => {
                        await onRenameItem(item, next);
                        setRenamingItemId(null);
                      }}
                      className="max-w-full"
                      titleClassName={
                        item.item_type === "header"
                          ? "text-sm font-semibold text-slate-700 dark:text-slate-200"
                          : "text-sm font-medium text-slate-800 dark:text-slate-200"
                      }
                    />
                  ) : isAssignment ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (item.item_ref_id) onOpenAssignment(item.item_ref_id);
                      }}
                      className="self-start max-w-full text-left text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline truncate"
                    >
                      {item.title}
                    </button>
                  ) : isFullTestLink && item.url ? (
                    // Teachers proctor, they don't sit the test — a test link opens
                    // the per-test OVERVIEW (results + live status), same tab.
                    <Link
                      to={`${testOverviewPath(fullTestSlug)}?course=${classId}${
                        fullTestRange ? `&m=${fullTestRange}` : ""
                      }`}
                      title="Open the proctor view — results & live status"
                      className="self-start max-w-full text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline truncate"
                    >
                      {item.title}
                    </Link>
                  ) : item.item_type === "link" && item.url ? (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="self-start max-w-full text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline truncate"
                    >
                      {item.title}
                    </a>
                  ) : canEdit ? (
                    <InlineRename
                      value={item.title}
                      disabled={false}
                      onSave={(next) => onRenameItem(item, next)}
                      className="max-w-full self-start"
                      titleClassName={
                        item.item_type === "header"
                          ? "text-sm font-semibold text-slate-700 dark:text-slate-200"
                          : "text-sm font-medium text-slate-800 dark:text-slate-200"
                      }
                    />
                  ) : (
                    <span
                      className={`self-start max-w-full text-sm truncate ${
                        item.item_type === "header"
                          ? "font-semibold text-slate-700 dark:text-slate-200"
                          : "font-medium text-slate-800 dark:text-slate-200"
                      }`}
                    >
                      {item.title}
                    </span>
                  )}
                  {item.item_type !== "header" && (
                    <span className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      <span>
                        {isFullTestLink ? "Practice Test" : ITEM_KIND_LABEL[item.item_type]}
                      </span>
                      {item.due_at && (() => {
                        const overdue = new Date(item.due_at).getTime() < Date.now();
                        return (
                          <span
                            title={`Due ${new Date(item.due_at).toLocaleString()}`}
                            className={`inline-flex items-center gap-1 normal-case tracking-normal font-medium ${
                              overdue
                                ? "text-rose-600 dark:text-rose-400"
                                : "text-slate-500 dark:text-slate-400"
                            }`}
                          >
                            <span aria-hidden className="text-slate-300 dark:text-slate-600">
                              ·
                            </span>
                            <ClockIcon />
                            Due {formatRelativeTime(item.due_at)}
                          </span>
                        );
                      })()}
                    </span>
                  )}
                </div>

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
            inlineAddingItem ? (
              <div className="px-4 py-2.5">
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
              </div>
            ) : (
              <button
                type="button"
                onClick={onAddItem}
                className="w-full min-h-[44px] flex items-center gap-2 px-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 hover:bg-indigo-50/70 dark:hover:bg-indigo-950/30 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors rounded-b-2xl"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                  className="h-3.5 w-3.5 flex-none"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add item
                <span className="font-normal text-slate-400 dark:text-slate-500 truncate hidden sm:inline">
                  — {canQbank
                    ? "Assignment, Practice Test, Question Set, Header, or Link"
                    : "Assignment, Header, or Link"}
                </span>
              </button>
            )
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
      {editModulesItem && (
        <EditTestModulesModal
          item={editModulesItem}
          courseId={classId}
          onClose={() => setEditModulesItem(null)}
          onSaved={() => {
            void onRefresh();
          }}
        />
      )}
    </div>
  );
});

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

  // Per-node callbacks stabilized with useCallback so the memoized ModuleCard
  // doesn't re-render every sibling/ancestor when one card toggles state.
  // Each depends only on `node`/`siblings`/`siblingIndex` plus the (assumed
  // stable) handler from props; if a parent handler identity changes the dep
  // array picks it up, so behavior is preserved.
  const handleToggleExpand = useCallback(
    () => toggleExpanded(node.id),
    [toggleExpanded, node.id],
  );
  const handleEdit = useCallback(() => onEditModule(node), [onEditModule, node]);
  const handleDelete = useCallback(
    () => onDeleteModule(node),
    [onDeleteModule, node],
  );
  const handleTogglePublishCommit = useCallback(
    () => onTogglePublishModule(node),
    [onTogglePublishModule, node],
  );
  const handleAddItem = useCallback(() => onAddItem(node), [onAddItem, node]);
  const handleAddSubmodule = useCallback(
    () => onAddSubmodule(node),
    [onAddSubmodule, node],
  );
  const handleRenameModule = useCallback(
    (next: string) => onRenameModule(node, next),
    [onRenameModule, node],
  );
  const handleDuplicateModule = useCallback(
    () => onDuplicateModule(node),
    [onDuplicateModule, node],
  );
  const handleLockModule = useCallback(
    () => onLockModule(node),
    [onLockModule, node],
  );
  const handleMoveModule = useCallback(
    () => onMoveModule(node),
    [onMoveModule, node],
  );
  const handleIndentModule = useCallback(
    () => onIndentModule(node, siblings, siblingIndex),
    [onIndentModule, node, siblings, siblingIndex],
  );
  const handleOutdentModule = useCallback(
    () => onOutdentModule(node),
    [onOutdentModule, node],
  );
  const handleKeyboardReorderModule = useCallback(
    (direction: "up" | "down") =>
      onKeyboardReorderModule(node, siblings, siblingIndex, direction),
    [onKeyboardReorderModule, node, siblings, siblingIndex],
  );
  const handleModuleDragStart = useCallback(
    () => onModuleDragStart(node),
    [onModuleDragStart, node],
  );
  const handleToggleSelected = useCallback(
    () => onToggleSelected(node.id),
    [onToggleSelected, node.id],
  );

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

  // This module is "draft" for styling if it's unpublished OR an ancestor is.
  const effectiveDraft = !node.published || !!props.inheritedDraft;

  return (
    <div className={elbowClass}>
      <ModuleCard
        node={node}
        effectiveDraft={effectiveDraft}
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
        onToggleExpand={handleToggleExpand}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onTogglePublishCommit={handleTogglePublishCommit}
        onAddItem={handleAddItem}
        onAddSubmodule={handleAddSubmodule}
        onOpenAssignment={onOpenAssignment}
        onRefresh={onRefresh}
        onRenameModule={handleRenameModule}
        onDuplicateModule={handleDuplicateModule}
        onLockModule={handleLockModule}
        onMoveModule={handleMoveModule}
        onIndentModule={handleIndentModule}
        onOutdentModule={handleOutdentModule}
        onKeyboardReorderModule={handleKeyboardReorderModule}
        onMoveItem={onMoveItem}
        onToggleItemCompleted={onToggleItemCompleted}
        onModuleDragStart={handleModuleDragStart}
        onModuleDragEnd={onModuleDragEnd}
        onCommitDrop={onCommitDrop}
        onItemDragStart={onItemDragStart}
        onItemDragEnd={onItemDragEnd}
        onCommitItemDrop={onCommitItemDrop}
        onItemDropOnEmptyModule={onItemDropOnEmptyModule}
        selectMode={selectMode}
        selected={isSelected(node.id)}
        onToggleSelected={handleToggleSelected}
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
              // Recessed "drawer" that reads as INSIDE the parent module:
              // pulled up to tuck under the parent card (-mt-2 + square top,
              // no top border) so it's clearly attached, not a floating
              // sibling; inset on both sides (ml-6 mr-3) so it's visibly
              // narrower than the parent; a stronger tint + inset shadow make
              // it look carved into the parent. No left accent stripe (reads
              // as AI chrome). Active asChild drop target → indigo border.
              "relative ml-6 mr-3 -mt-2 px-3 pt-5 pb-3 space-y-3 rounded-b-2xl rounded-t-none border border-t-0 transition-colors " +
              "shadow-[inset_0_2px_5px_-2px_rgba(15,23,42,0.12)] " +
              // A draft parent washes its whole submodule drawer an even
              // darker grey (recessed below the card) so the unpublished
              // section reads as one solid block.
              (effectiveDraft
                ? "bg-slate-400/45 dark:bg-slate-900/60 "
                : "bg-slate-100/80 dark:bg-slate-800/40 ") +
              (isNestDropTarget
                ? "border-indigo-400 dark:border-indigo-700 "
                : "border-slate-200 dark:border-slate-700 ")
            }
            aria-label="Submodules"
          >
            {/* Quiet eyebrow so the nesting is labelled, not just implied. */}
            <div className="pointer-events-none -mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
              Submodules
            </div>
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
                  inheritedDraft={effectiveDraft}
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
