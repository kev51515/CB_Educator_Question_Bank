/**
 * PortfolioTreeView
 * =================
 * The hierarchical tree-with-drag-and-drop subtree of the staff portfolio
 * template editor. Renders the list of root-level <PortfolioItemNodeRow>
 * instances plus the "drop past the end" tail zone that lets users land an
 * item as the last root-level sibling.
 *
 * Owns NO drag state of its own — receives drag state via the
 * `NodeCallbacks` bundle prepared by the parent page (which composes
 * `usePortfolioDrag`). This keeps the tree presentational and the page
 * orchestrational.
 *
 * Side responsibilities:
 *   - The container-level onDragLeave that clears a stale drop target when
 *     the cursor genuinely leaves the tree (not just when crossing into a
 *     child row).
 *   - Rendering the dashed indigo "Drop here to append at the end" tail
 *     while a drag is in progress. This is what lets the user drop "past
 *     the end" — without it, the very last row wouldn't have an "after"
 *     drop zone reachable past its bottom edge.
 */
import { useEffect, useMemo, useState } from "react";
import {
  flattenTree,
  type PortfolioItemNode,
} from "./usePortfolio";
import {
  PortfolioItemNodeRow,
  type NodeCallbacks,
} from "./PortfolioItemNode";
import type { DropTarget } from "./usePortfolioDrag";

export interface PortfolioTreeViewProps {
  tree: readonly PortfolioItemNode[];
  cb: NodeCallbacks;
  /** Currently dragged node (controls tail-zone visibility). */
  draggedNode: PortfolioItemNode | null;
  /** Ref used by drag handlers to read the current target without stale closures. */
  dropTargetRef: React.MutableRefObject<DropTarget | null>;
  setDropTarget: (target: DropTarget | null) => void;
  onCommitDrop: (target: DropTarget) => void;
}

export function PortfolioTreeView({
  tree,
  cb,
  draggedNode,
  dropTargetRef,
  setDropTarget,
  onCommitDrop,
}: PortfolioTreeViewProps): JSX.Element {
  return (
    <div
      onDragLeave={(e) => {
        // EDGE: container dragleave — only clear if the cursor genuinely
        // left this element (not when crossing into a child). relatedTarget
        // == null OR not contained = real leave.
        const next = e.relatedTarget as Node | null;
        if (!next || !e.currentTarget.contains(next)) {
          if (dropTargetRef.current) setDropTarget(null);
        }
      }}
    >
      <ul className="space-y-2">
        {tree.map((node, idx) => (
          <PortfolioItemNodeRow
            key={node.id}
            node={node}
            siblings={tree}
            siblingIndex={idx}
            depth={0}
            cb={cb}
          />
        ))}
      </ul>
      {/* Tail drop zone — lets the user drop "past the end" to land as the
          last root-level sibling. Only active while a drag is in progress. */}
      {draggedNode && (
        <div
          aria-hidden
          className="h-12 mt-2 rounded-xl border-2 border-dashed border-indigo-300 dark:border-indigo-800 bg-indigo-50/30 dark:bg-indigo-950/20 flex items-center justify-center text-xs font-medium text-indigo-700 dark:text-indigo-300"
          onDragOver={(e) => {
            if (!draggedNode) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            const roots = tree;
            const lastRoot = roots[roots.length - 1];
            if (!lastRoot) return;
            // Skip if the last root is the dragged node itself.
            if (lastRoot.id === draggedNode.id) return;
            const target: DropTarget = {
              anchorId: lastRoot.id,
              position: "after",
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
            const cur = dropTargetRef.current;
            if (!cur) return;
            e.preventDefault();
            onCommitDrop(cur);
          }}
        >
          Drop here to append at the end
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Move-To picker — the kebab "Move to…" fallback for touch/keyboard users.
// Lives here because it's the non-drag path to the same RPC the tree's
// HTML5 DnD targets. CLAUDE.md requires every drag-and-drop affordance to
// have a non-drag fallback for touch.
// -----------------------------------------------------------------------------

/**
 * The position picker is a friendly select instead of a free-form number
 * input: pick "Top of list", "After X", or "Bottom of list". Each option
 * carries the numeric position the move RPC needs.
 */
interface PositionChoice {
  key: string;
  label: string;
  position: number;
}

function buildPositionChoices(
  siblings: readonly PortfolioItemNode[],
  excludedId: string,
): PositionChoice[] {
  const filtered = siblings.filter((s) => s.id !== excludedId);
  if (filtered.length === 0) {
    return [{ key: "top", label: "First item", position: 0 }];
  }
  const choices: PositionChoice[] = [
    { key: "top", label: "Top of list", position: 0 },
  ];
  filtered.forEach((sib, idx) => {
    if (idx < filtered.length - 1) {
      choices.push({
        key: `after-${sib.id}`,
        label: `After "${sib.title}"`,
        position: idx + 1,
      });
    }
  });
  choices.push({
    key: "bottom",
    label: "Bottom of list",
    position: Number.MAX_SAFE_INTEGER,
  });
  return choices;
}

export interface MovePickerProps {
  item: PortfolioItemNode;
  tree: readonly PortfolioItemNode[];
  /** Ids that must NOT be selectable as a new parent (self + descendants). */
  forbiddenIds: ReadonlySet<string>;
  onApply: (newParentId: string | null, newPosition: number) => Promise<void>;
  onClose: () => void;
}

export function MovePicker({
  item,
  tree,
  forbiddenIds,
  onApply,
  onClose,
}: MovePickerProps): JSX.Element {
  const [parentId, setParentId] = useState<string | null>(item.parent_item_id);
  const [busy, setBusy] = useState(false);

  const flat = useMemo(() => flattenTree(tree), [tree]);
  const options = flat.filter((entry) => !forbiddenIds.has(entry.node.id));

  // Resolve the sibling set for the currently-chosen parent so position
  // labels reflect where the item will actually land.
  const siblings = useMemo<readonly PortfolioItemNode[]>(() => {
    if (parentId === null) return tree;
    const found = flat.find((entry) => entry.node.id === parentId);
    return found ? found.node.children : tree;
  }, [parentId, flat, tree]);

  const positionChoices = useMemo<PositionChoice[]>(
    () => buildPositionChoices(siblings, item.id),
    [siblings, item.id],
  );

  const [positionKey, setPositionKey] = useState<string>(() => {
    const initial = buildPositionChoices(
      item.parent_item_id === null
        ? tree
        : flat.find((e) => e.node.id === item.parent_item_id)?.node.children ??
            tree,
      item.id,
    );
    return initial[initial.length - 1]?.key ?? "bottom";
  });

  // Whenever parent changes, snap the position selection back to "Bottom" so
  // we never carry over a stale key that isn't valid in the new sibling set.
  useEffect(() => {
    setPositionKey(
      positionChoices[positionChoices.length - 1]?.key ?? "bottom",
    );
  }, [parentId, positionChoices]);

  const selectedPosition =
    positionChoices.find((c) => c.key === positionKey)?.position ??
    Number.MAX_SAFE_INTEGER;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-700 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Move "{item.title}" to…
        </h3>
        <label className="block text-xs text-slate-500 dark:text-slate-400">
          New parent
          <select
            value={parentId ?? ""}
            onChange={(e) =>
              setParentId(e.target.value === "" ? null : e.target.value)
            }
            className="mt-1 w-full rounded-md bg-slate-50 dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100"
          >
            <option value="">Top level</option>
            {options.map(({ node, depth }) => (
              <option key={node.id} value={node.id}>
                {"  ".repeat(depth)}
                {node.title}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-slate-500 dark:text-slate-400">
          Position
          <select
            value={positionKey}
            onChange={(e) => setPositionKey(e.target.value)}
            className="mt-1 w-full rounded-md bg-slate-50 dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100"
          >
            {positionChoices.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={async () => {
              setBusy(true);
              try {
                await onApply(parentId, selectedPosition);
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy}
            className="rounded-md px-3 py-1.5 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
          >
            Move
          </button>
        </div>
      </div>
    </div>
  );
}
