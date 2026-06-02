import { type ModuleItem, type ModuleNode } from "./useCourseModules";
import { ModuleCard } from "./ModuleCard";
import { InsertionBar } from "./InsertionBar";
import { type DropTarget, type ItemDropTarget } from "./moduleHelpers";

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

export { ModuleNodeView };
export type { ModuleNodeViewProps };
