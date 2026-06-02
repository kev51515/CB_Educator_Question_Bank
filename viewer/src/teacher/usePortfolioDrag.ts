/**
 * usePortfolioDrag
 * ================
 * Extracted drag-and-drop state machine for the portfolio template tree.
 *
 * Owns:
 *   - The Notion/Linear-style single page-level `DropTarget` (anchor + position
 *     + asChild + parentId + depth), backed by a state/ref pair so that
 *     synchronous drag handlers can read the latest value without stale
 *     closures while React still re-renders the indicator.
 *   - Drag identity: `draggedNode` + `draggedDescendants` (for cycle
 *     prevention — descendants of the dragged row are never valid drop
 *     targets).
 *   - Drop-landing pulse (`recentlyMovedId`) — the row that was just moved
 *     gets a brief indigo pulse to confirm the move landed. Cancels any
 *     pending pulse on rapid second drop; cleans up on unmount.
 *   - Concurrent-drop guard (`dropBusyRef`) — prevents two move RPCs from
 *     racing when the network is slow and the user starts a second drag
 *     before the first reconciled.
 *   - Auto-scroll near viewport edges while dragging (Notion/Linear pattern).
 *   - The pure `resolveDropTarget` helper + `DEPTH_INDENT_PX` constant, used
 *     by row renderers to translate cursor coords into a target.
 *
 * Behavior is intentionally identical to the inline implementation that
 * lived in CoursePortfolio.tsx through Wave 11A. No new state, no new RPCs,
 * no DB changes — pure extraction.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  collectDescendantIds,
  type PortfolioItemNode,
} from "./usePortfolio";

/**
 * Notion/Linear-style drop target — a single page-level value replaces the
 * old per-row 3-zone state. `asChild` is only valid when position==="after"
 * and means "nest as the last child of the anchor".
 */
export interface DropTarget {
  anchorId: string;
  position: "before" | "after";
  asChild: boolean;
  parentId: string | null;
  depth: number;
}

/** Pixel indent per depth level. Matches ModulesPage DEPTH_INDENT_PX. */
export const DEPTH_INDENT_PX = 24;

/**
 * Resolve a drop target from cursor coords relative to an anchor row.
 * Returns null if dropping onto self or a descendant (cycle prevention).
 *
 * - Top half of the row -> drop BEFORE the anchor at the anchor's depth.
 * - Bottom half left-of-threshold -> drop AFTER the anchor at the anchor's
 *   depth (sibling).
 * - Bottom half right-of-threshold -> drop INTO the anchor as its last
 *   child (nest), depth = anchor depth + 1.
 */
export function resolveDropTarget(
  anchor: PortfolioItemNode,
  anchorDepth: number,
  cursorY: number,
  cursorX: number,
  rowRect: DOMRect,
  draggedId: string,
  draggedDescendants: ReadonlySet<string>,
): DropTarget | null {
  if (anchor.id === draggedId || draggedDescendants.has(anchor.id)) return null;

  const midY = rowRect.top + rowRect.height / 2;
  // Threshold X past which the bottom-half drop nests as a child rather
  // than landing as a sibling-after. Biased relative to row's left edge so
  // it works regardless of horizontal scroll/page offset.
  const INDENT_THRESHOLD_X =
    rowRect.left + DEPTH_INDENT_PX + anchorDepth * DEPTH_INDENT_PX;

  if (cursorY < midY) {
    return {
      anchorId: anchor.id,
      position: "before",
      asChild: false,
      parentId: anchor.parent_item_id,
      depth: anchorDepth,
    };
  }

  const asChild = cursorX > INDENT_THRESHOLD_X;
  if (asChild) {
    return {
      anchorId: anchor.id,
      position: "after",
      asChild: true,
      parentId: anchor.id,
      depth: anchorDepth + 1,
    };
  }
  return {
    anchorId: anchor.id,
    position: "after",
    asChild: false,
    parentId: anchor.parent_item_id,
    depth: anchorDepth,
  };
}

/**
 * Auto-scroll the viewport when the user drags near its top/bottom edges.
 * Notion/Linear pattern — lets users reach items currently out of view as
 * drop targets without manually scrolling.
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

export interface UsePortfolioDragResult {
  // Drag identity
  draggedNode: PortfolioItemNode | null;
  draggedDescendants: ReadonlySet<string>;
  beginDrag: (node: PortfolioItemNode) => void;
  endDrag: () => void;
  clearDragState: () => void;

  // Drop target (Notion/Linear single indicator)
  dropTarget: DropTarget | null;
  dropTargetRef: React.MutableRefObject<DropTarget | null>;
  setDropTarget: (target: DropTarget | null) => void;

  // Drop-landing pulse
  recentlyMovedId: string | null;
  triggerPulse: (id: string) => void;

  // Concurrent-drop guard
  dropBusyRef: React.MutableRefObject<boolean>;
}

/**
 * Bundled drag/drop state for the portfolio tree. Side-effect: enables
 * the viewport auto-scroll listener while a drag is active.
 */
export function usePortfolioDrag(): UsePortfolioDragResult {
  const [draggedNode, setDraggedNode] = useState<PortfolioItemNode | null>(
    null,
  );
  const [draggedDescendants, setDraggedDescendants] = useState<
    ReadonlySet<string>
  >(new Set());

  // Page-level drop target (Notion/Linear-style single indicator). Ref +
  // state pair: ref is read in synchronous drag handlers (avoids stale
  // closures); state drives renders.
  const [dropTargetState, setDropTargetState] = useState<DropTarget | null>(
    null,
  );
  const dropTargetRef = useRef<DropTarget | null>(null);
  const setDropTarget = useCallback((target: DropTarget | null): void => {
    dropTargetRef.current = target;
    setDropTargetState(target);
  }, []);

  // Drop-landing pulse: row that was just moved briefly pulses indigo to
  // confirm the move landed. Timer tracked in a ref so a rapid second drop
  // cancels the prior pulse + unmount cleans up.
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

  // Concurrent-drop guard mirrors ModulesPage — prevents two move RPCs from
  // racing if the network is slow and the user starts a second drag before
  // the first has reconciled.
  const dropBusyRef = useRef<boolean>(false);

  // Auto-scroll near viewport edges while a drag is in progress.
  useAutoScrollOnDrag(draggedNode !== null);

  const beginDrag = useCallback((node: PortfolioItemNode): void => {
    setDraggedNode(node);
    setDraggedDescendants(collectDescendantIds(node));
  }, []);

  const clearDragState = useCallback((): void => {
    setDraggedNode(null);
    setDraggedDescendants(new Set());
  }, []);

  const endDrag = useCallback((): void => {
    setDraggedNode(null);
    setDraggedDescendants(new Set());
    setDropTarget(null);
  }, [setDropTarget]);

  return {
    draggedNode,
    draggedDescendants,
    beginDrag,
    endDrag,
    clearDragState,
    dropTarget: dropTargetState,
    dropTargetRef,
    setDropTarget,
    recentlyMovedId,
    triggerPulse,
    dropBusyRef,
  };
}
