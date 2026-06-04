/**
 * modulesDnd
 * ==========
 * Pure drag-and-drop target geometry for the Modules tree — no React, no DOM
 * mutation, just "given a cursor over a row, where does the drop land". Extracted
 * verbatim from ModulesPage (modularization step 1) so the page file shrinks and
 * this logic becomes independently testable.
 */
import type { ModuleItem, ModuleNode } from "./useCourseModules";

export interface DropTarget {
  anchorId: string;
  position: "before" | "after";
  asChild: boolean;
  parentId: string | null;
  depth: number;
}

/** Pixel indent per depth level. Mirrors the `ml-6` (24px) used in the tree. */
export const DEPTH_INDENT_PX = 24;

/**
 * Notion/Linear-style drop target for items WITHIN a module. Items are flat
 * (no nesting), so this is simpler than DropTarget — we only need an anchor
 * item + before/after + the target module id. Cross-module drops set
 * `moduleId` to the destination module's id; same-module reorders use the
 * anchor's own module_id.
 */
export interface ItemDropTarget {
  anchorItemId: string;
  moduleId: string;
  position: "before" | "after";
}

/**
 * Resolve an item drop target from cursor Y relative to a single item row.
 * Returns null when dropping onto self (reject no-op). Items don't nest, so
 * no X threshold needed.
 */
export function resolveItemDropTarget(
  anchor: ModuleItem,
  cursorY: number,
  rowRect: DOMRect,
  draggedItemId: string,
): ItemDropTarget | null {
  if (anchor.id === draggedItemId) return null;
  const midY = rowRect.top + rowRect.height / 2;
  return {
    anchorItemId: anchor.id,
    moduleId: anchor.module_id,
    position: cursorY < midY ? "before" : "after",
  };
}

/**
 * Resolve a drop target from cursor coords relative to an anchor row.
 *
 * Notion-style cursor-X depth control on the BOTTOM half:
 *   - Cursor X past the right edge of the row's indent → nest as child
 *     (`asChild: true`, depth = anchor + 1)
 *   - Cursor X at the row's content edge → sibling at anchor's depth
 *   - Cursor X LEFT of the row's content edge → OUTDENT by N levels
 *     (one level per INDENT_PX cursor moves left), bounded by anchor's
 *     own depth. This is how the user drags a nested module OUT of its
 *     parent: they don't need to navigate to a top-level row, they just
 *     drag the cursor leftward and the bar's anchor walks up the ancestor
 *     chain.
 *
 * Top half is always a sibling-before drop at the anchor's depth (no
 * outdent there — would be confusing; user can outdent via bottom half).
 *
 * Returns null if dropping onto self or a descendant (cycle prevention).
 */
export function resolveDropTarget(
  anchor: ModuleNode,
  anchorDepth: number,
  cursorY: number,
  cursorX: number,
  rowRect: DOMRect,
  draggedId: string,
  draggedDescendants: ReadonlySet<string>,
  flatModules: readonly ModuleNode[],
): DropTarget | null {
  if (anchor.id === draggedId || draggedDescendants.has(anchor.id)) return null;

  const midY = rowRect.top + rowRect.height / 2;

  if (cursorY < midY) {
    return {
      anchorId: anchor.id,
      position: "before",
      asChild: false,
      parentId: anchor.parent_module_id,
      depth: anchorDepth,
    };
  }

  // Bottom half — cursor X picks the depth.
  // Layout: row's content starts at `rowRect.left + (anchorDepth * INDENT_PX)`
  // (approximate, accounting for the children container's inset padding —
  // currently `ml-6 p-3` for the tinted submodule block). We pick a simpler
  // bias: each indent step LEFT of the row's left edge = -1 depth, each
  // indent step RIGHT of (rowLeft + INDENT_PX) = nest.
  const stepFromLeft = Math.floor(
    (cursorX - rowRect.left) / DEPTH_INDENT_PX,
  );

  if (stepFromLeft >= 1) {
    // Far right of the row's content edge → nest as last child of anchor.
    return {
      anchorId: anchor.id,
      position: "after",
      asChild: true,
      parentId: anchor.id,
      depth: anchorDepth + 1,
    };
  }

  if (stepFromLeft >= 0) {
    // Within the row's left edge band → sibling-after at anchor's depth.
    return {
      anchorId: anchor.id,
      position: "after",
      asChild: false,
      parentId: anchor.parent_module_id,
      depth: anchorDepth,
    };
  }

  // Cursor LEFT of the row's left edge → outdent N levels.
  // `stepFromLeft` is negative; -1 = outdent one level, -2 = two, etc.
  // Bounded by anchor's actual depth (can't go above top level).
  const outdentLevels = Math.min(anchorDepth, -stepFromLeft);
  if (outdentLevels <= 0 || !anchor.parent_module_id) {
    // Already top-level or can't outdent — fall through to sibling-after
    // at anchor's depth.
    return {
      anchorId: anchor.id,
      position: "after",
      asChild: false,
      parentId: anchor.parent_module_id,
      depth: anchorDepth,
    };
  }
  // Walk up the parent chain by `outdentLevels` steps.
  let ancestor: ModuleNode | undefined = anchor;
  for (let i = 0; i < outdentLevels && ancestor; i += 1) {
    const parentId: string | null = ancestor.parent_module_id;
    if (!parentId) break;
    ancestor = flatModules.find((m) => m.id === parentId);
  }
  if (!ancestor) return null;
  // Drop AFTER the ancestor at its level — outdent visually anchors the
  // bar to the ancestor row so the user sees the bar climb up the tree.
  return {
    anchorId: ancestor.id,
    position: "after",
    asChild: false,
    parentId: ancestor.parent_module_id,
    depth: anchorDepth - outdentLevels,
  };
}
