/**
 * CoursePortfolio
 * ===============
 * The Portfolio tab on the course detail screen. Acts as a role-aware
 * splitter:
 *   - Staff: two sub-views (Template editor + Overview grid).
 *   - Student: delegates to <StudentPortfolio /> which uses the same template
 *     resolved by `usePortfolio` indirectly (student hook re-fetches it).
 *
 * Wave 11A layers a hierarchical portfolio on top of the flat list. Items now
 * carry `parent_item_id` and the staff template view renders a tree:
 *   - <PortfolioTreeView> composes recursive <PortfolioItemNodeRow> rows
 *     with per-node collapse persisted via localStorage.
 *   - HTML5 native drag-and-drop with Before / After / Into drop zones,
 *     wired to the `move_portfolio_item` RPC.
 *   - Indent / Outdent / Move to… / + Sub-item via the kebab.
 *   - Cycle prevention by excluding any descendant of the dragged node from
 *     valid drop targets.
 *
 * Submissions are still per-leaf; the Overview grid walks the tree and only
 * surfaces leaf items as columns (header items can be parents but never
 * accept submissions).
 *
 * This file is the orchestrator: state, RPC callbacks, modal management,
 * sub-view tab. The recursive row + drag plumbing + tree wrapper + overview
 * grid all live in dedicated files (see PortfolioItemNode.tsx,
 * usePortfolioDrag.ts, PortfolioTreeView.tsx, PortfolioOverviewGrid.tsx).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useToast } from "../components/Toast";
import { EmptyState } from "../components/EmptyState";
import { SkeletonRows, SkeletonTable } from "../components/Skeleton";
import { useOptimistic } from "../components/useOptimistic";
import { useClassContext } from "./classLayoutContext";
import { useProfile } from "../lib/profile";
import { useClassRoster, type RosterStudent } from "./useClassRoster";
import { ConfirmDialog } from "./ConfirmDialog";
import {
  buildPortfolioTree,
  collectDescendantIds,
  flattenLeaves,
  usePortfolio,
  type PortfolioItem,
  type PortfolioItemNode,
} from "./usePortfolio";
import { PortfolioItemFormModal } from "./PortfolioItemFormModal";
import { SubmissionDetailDrawer } from "./SubmissionDetailDrawer";
import { StudentPortfolio } from "../student/StudentPortfolio";
import {
  collapseKey,
  readCollapseState,
  writeCollapseState,
  type NodeCallbacks,
} from "./PortfolioItemNode";
import { PortfolioTreeView, MovePicker } from "./PortfolioTreeView";
import {
  PortfolioOverviewGrid,
  buildStatusMap,
  studentLabel,
  type CellStatus,
  type OverviewSubmissionRow,
} from "./PortfolioOverviewGrid";
import {
  usePortfolioDrag,
  type DropTarget,
} from "./usePortfolioDrag";

type SubView = "template" | "overview";

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

// -----------------------------------------------------------------------------
// Template publish badge — one-click optimistic toggle (mirrors ModulesPage).
// -----------------------------------------------------------------------------

interface TemplatePublishBadgeProps {
  templateId: string;
  published: boolean;
  disabled?: boolean;
  onCommitted: () => Promise<void>;
}

function TemplatePublishBadgeInner({
  templateId,
  published,
  disabled,
  onCommitted,
}: TemplatePublishBadgeProps): JSX.Element {
  const [pub, applyPub] = useOptimistic<boolean>(published);
  const [busy, setBusy] = useState(false);

  const onClick = async (): Promise<void> => {
    const target = !pub;
    setBusy(true);
    try {
      await applyPub({
        optimistic: () => target,
        commit: async () => {
          const { error } = await supabase
            .from("portfolio_templates")
            .update({ published: target })
            .eq("id", templateId);
          if (error) throw new Error(error.message);
          await onCommitted();
        },
        successMessage: target ? "Template published" : "Template unpublished",
      });
    } finally {
      setBusy(false);
    }
  };

  const isDisabled = disabled || busy;
  const baseRing =
    "ring-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition";
  const palette = pub
    ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 ring-emerald-200 dark:ring-emerald-900 hover:bg-emerald-100 dark:hover:bg-emerald-950/60"
    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-slate-200 dark:ring-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700";

  return (
    <button
      type="button"
      onClick={() => {
        void onClick();
      }}
      disabled={isDisabled}
      title={pub ? "Published — click to unpublish" : "Draft — click to publish"}
      aria-pressed={pub}
      className={`${baseRing} ${palette} ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <span aria-hidden>{pub ? "✓" : "⊘"}</span>
      <span>{pub ? "Published" : "Draft"}</span>
    </button>
  );
}

function TemplatePublishBadge(props: TemplatePublishBadgeProps): JSX.Element {
  // Re-key on (id, published) so refreshes seed a fresh optimistic baseline.
  return (
    <TemplatePublishBadgeInner
      key={`${props.templateId}:${String(props.published)}`}
      {...props}
    />
  );
}

// -----------------------------------------------------------------------------
// Top-level component
// -----------------------------------------------------------------------------

export function CoursePortfolio() {
  const { cls } = useClassContext();
  const { profile } = useProfile();
  const isStaff = profile?.role === "teacher" || profile?.role === "admin";

  // Student-side rendering is delegated to StudentPortfolio. We branch BEFORE
  // calling staff-only hooks (usePortfolio bootstraps via RPC which would
  // raise for students).
  if (!isStaff && profile?.role === "student") {
    return <StudentPortfolio />;
  }

  return (
    <StaffPortfolio
      isStaff={isStaff}
      courseId={cls.id}
      authorId={profile?.id ?? ""}
      userId={profile?.id ?? null}
    />
  );
}

interface StaffPortfolioProps {
  isStaff: boolean;
  courseId: string;
  authorId: string;
  userId: string | null;
}

// -----------------------------------------------------------------------------
// localStorage helpers for sub-view tab persistence. Per-course so each
// course remembers whether the teacher was last on Template or Overview.
// (Per-node collapse state helpers live in PortfolioItemNode.tsx since they
// belong to the tree concern.) Try/catch each access — Safari private mode
// throws on localStorage access.
// -----------------------------------------------------------------------------

const subViewKey = (courseId: string): string =>
  `portfolio-subview:${courseId}`;

function readSubView(courseId: string): SubView {
  try {
    const raw = window.localStorage.getItem(subViewKey(courseId));
    if (raw === "template" || raw === "overview") return raw;
  } catch {
    /* localStorage unavailable */
  }
  return "template";
}

function writeSubView(courseId: string, value: SubView): void {
  try {
    window.localStorage.setItem(subViewKey(courseId), value);
  } catch {
    /* ignore */
  }
}

function StaffPortfolio({
  isStaff,
  courseId,
  authorId,
  userId,
}: StaffPortfolioProps): JSX.Element {
  const { template, items, loading, error, refresh } = usePortfolio(courseId);
  const { roster, loading: rosterLoading } = useClassRoster(courseId);
  const toast = useToast();

  const [subView, setSubView] = useState<SubView>(() => readSubView(courseId));
  useEffect(() => {
    setSubView(readSubView(courseId));
  }, [courseId]);
  useEffect(() => {
    writeSubView(courseId, subView);
  }, [courseId, subView]);
  const [showAdd, setShowAdd] = useState(false);
  const [pendingChildOfId, setPendingChildOfId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<PortfolioItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PortfolioItem | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [movingNode, setMovingNode] = useState<PortfolioItemNode | null>(null);

  const [statusByPair, setStatusByPair] = useState<Record<string, CellStatus>>(
    {},
  );
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const [drawer, setDrawer] = useState<
    { student: RosterStudent; item: PortfolioItem } | null
  >(null);

  // Tree projection
  const tree = useMemo<PortfolioItemNode[]>(
    () => buildPortfolioTree(items),
    [items],
  );

  // Leaf items only — these are the actual submission targets.
  const leaves = useMemo<PortfolioItem[]>(() => flattenLeaves(tree), [tree]);

  // Persisted per-node collapse state, keyed by (user, template).
  const persistKey = collapseKey(userId, template?.id ?? null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    readCollapseState(persistKey),
  );
  useEffect(() => {
    setCollapsed(readCollapseState(persistKey));
  }, [persistKey]);
  useEffect(() => {
    writeCollapseState(persistKey, collapsed);
  }, [persistKey, collapsed]);

  const isCollapsed = useCallback(
    (id: string): boolean => collapsed[id] ?? false,
    [collapsed],
  );
  const toggleCollapsed = useCallback((id: string): void => {
    setCollapsed((prev) => ({ ...prev, [id]: !(prev[id] ?? false) }));
  }, []);

  // Drag/drop state machine — owns dragged node, descendants, drop target,
  // recently-moved pulse, dropBusy guard, and auto-scroll-while-dragging.
  const drag = usePortfolioDrag();
  const {
    draggedNode,
    draggedDescendants,
    beginDrag,
    endDrag,
    clearDragState,
    dropTarget,
    dropTargetRef,
    setDropTarget,
    recentlyMovedId,
    triggerPulse,
    dropBusyRef,
  } = drag;

  // Position for the next root-level item.
  const nextRootPosition = useMemo<number>(() => {
    const roots = tree;
    if (roots.length === 0) return 0;
    return Math.max(...roots.map((n) => n.position)) + 1;
  }, [tree]);

  // -------------------------------------------------------------------------
  // Add / edit / delete
  // -------------------------------------------------------------------------

  const onDelete = useCallback(
    async (item: PortfolioItem): Promise<void> => {
      setActionBusy(true);
      setActionError(null);
      try {
        const { error: delError } = await supabase
          .from("portfolio_items")
          .delete()
          .eq("id", item.id);
        if (delError) {
          setActionError(delError.message);
          toast.error("Couldn't delete item", delError.message);
          return;
        }
        setDeleteTarget(null);
        toast.success("Item deleted", item.title);
        await refresh();
      } catch (err: unknown) {
        const msg = getErrorMessage(err, "Failed to delete item.");
        setActionError(msg);
        toast.error("Couldn't delete item", msg);
      } finally {
        setActionBusy(false);
      }
    },
    [refresh, toast],
  );

  // Note: the publish toggle is owned by <TemplatePublishBadge /> below using
  // `useOptimistic` so the badge flips instantly + rolls back on commit
  // failure (mirrors ModulesPage). This is intentionally NOT a useCallback
  // up here — keeping the optimistic state co-located with the badge makes
  // re-mount/reset behavior trivial.

  // -------------------------------------------------------------------------
  // Move / indent / outdent (all funnel through move_portfolio_item)
  // -------------------------------------------------------------------------

  const movePortfolioItem = useCallback(
    async (
      itemId: string,
      newParentId: string | null,
      newPosition: number,
    ): Promise<void> => {
      // Concurrent-drop guard: ignore re-fires while a previous RPC is in
      // flight. Without this a slow network + rapid second drag = 2 RPCs.
      if (dropBusyRef.current) return;
      dropBusyRef.current = true;
      setActionBusy(true);
      setActionError(null);
      try {
        const { error: rpcError } = await supabase.rpc("move_portfolio_item", {
          p_item_id: itemId,
          p_new_parent_id: newParentId,
          p_new_position: newPosition,
        });
        if (rpcError) {
          setActionError(rpcError.message);
          toast.error("Couldn't move item", rpcError.message);
          return;
        }
        toast.success("Item moved");
        await refresh();
        // Drop-landing pulse — uses triggerPulse which cancels any pending
        // prior pulse + has a useEffect cleanup so unmount within 1.2s
        // doesn't fire setState on a dead component.
        triggerPulse(itemId);
      } catch (err: unknown) {
        const msg = getErrorMessage(err, "Failed to move item.");
        setActionError(msg);
        toast.error("Couldn't move item", msg);
      } finally {
        setActionBusy(false);
        dropBusyRef.current = false;
      }
    },
    [dropBusyRef, refresh, toast, triggerPulse],
  );

  // Locate a node in the tree (root + path) so we can find siblings/parent.
  const locateNode = useCallback(
    (
      id: string,
      level: readonly PortfolioItemNode[] = tree,
      parent: PortfolioItemNode | null = null,
    ): {
      node: PortfolioItemNode;
      parent: PortfolioItemNode | null;
      siblings: readonly PortfolioItemNode[];
      index: number;
    } | null => {
      for (let i = 0; i < level.length; i += 1) {
        const n = level[i];
        if (n.id === id) {
          return { node: n, parent, siblings: level, index: i };
        }
        const inChild = locateNode(id, n.children, n);
        if (inChild) return inChild;
      }
      return null;
    },
    [tree],
  );

  const onIndent = useCallback(
    (node: PortfolioItemNode): void => {
      const found = locateNode(node.id);
      if (!found || found.index === 0) return;
      const newParent = found.siblings[found.index - 1];
      // Drop as last child of preceding sibling.
      void movePortfolioItem(node.id, newParent.id, Number.MAX_SAFE_INTEGER);
    },
    [locateNode, movePortfolioItem],
  );

  const onOutdent = useCallback(
    (node: PortfolioItemNode): void => {
      const found = locateNode(node.id);
      if (!found || !found.parent) return;
      const parent = found.parent;
      const grandFound = locateNode(parent.id);
      const parentIndex = grandFound ? grandFound.index : -1;
      const newParentId = grandFound ? grandFound.parent?.id ?? null : null;
      // Place immediately AFTER the parent at the grandparent's level.
      void movePortfolioItem(node.id, newParentId, parentIndex + 1);
    },
    [locateNode, movePortfolioItem],
  );

  // Convert a resolved DropTarget into (newParentId, newPosition) for the
  // move RPC. Mirrors ModulesPage's commit pattern.
  const onCommitDrop = useCallback(
    (target: DropTarget): void => {
      if (!draggedNode) return;
      const anchorLoc = locateNode(target.anchorId);
      if (!anchorLoc) {
        clearDragState();
        setDropTarget(null);
        return;
      }

      let newParentId: string | null;
      let newPosition: number;

      if (target.asChild) {
        // Nest as last child of anchor.
        newParentId = target.anchorId;
        newPosition = Number.MAX_SAFE_INTEGER;
      } else if (target.position === "before") {
        newParentId = anchorLoc.parent ? anchorLoc.parent.id : null;
        newPosition = anchorLoc.index;
      } else {
        newParentId = anchorLoc.parent ? anchorLoc.parent.id : null;
        newPosition = anchorLoc.index + 1;
      }

      const draggedId = draggedNode.id;
      clearDragState();
      setDropTarget(null);
      void movePortfolioItem(draggedId, newParentId, newPosition);
    },
    [
      draggedNode,
      locateNode,
      movePortfolioItem,
      setDropTarget,
      clearDragState,
    ],
  );

  // -------------------------------------------------------------------------
  // Overview
  // -------------------------------------------------------------------------

  const loadOverview = useCallback(async (): Promise<void> => {
    if (!template) return;
    if (leaves.length === 0) {
      setStatusByPair({});
      return;
    }
    setOverviewLoading(true);
    setOverviewError(null);
    try {
      const { data, error: queryError } = await supabase
        .from("portfolio_submissions")
        .select("item_id, student_id, status, submitted_at")
        .in(
          "item_id",
          leaves.map((i) => i.id),
        );
      if (queryError) {
        setOverviewError(queryError.message);
        return;
      }
      const rows = (data ?? []) as unknown as OverviewSubmissionRow[];
      setStatusByPair(buildStatusMap(leaves, roster, rows));
    } catch (err: unknown) {
      setOverviewError(getErrorMessage(err, "Failed to load overview."));
    } finally {
      setOverviewLoading(false);
    }
  }, [leaves, roster, template]);

  const switchView = useCallback(
    (next: SubView): void => {
      setSubView(next);
      if (next === "overview") void loadOverview();
    },
    [loadOverview],
  );

  // -------------------------------------------------------------------------
  // Add Item / Add Sub-item handlers
  // -------------------------------------------------------------------------

  const openAddRoot = useCallback((): void => {
    setPendingChildOfId(null);
    setShowAdd(true);
  }, []);

  const openAddChild = useCallback((parent: PortfolioItem): void => {
    setPendingChildOfId(parent.id);
    setShowAdd(true);
  }, []);

  // -------------------------------------------------------------------------
  // Node callbacks bundle (passed to the tree view)
  // -------------------------------------------------------------------------

  const nodeCallbacks: NodeCallbacks = {
    canEdit: isStaff,
    isCollapsed,
    toggleCollapsed,
    onEdit: (item) => setEditTarget(item),
    onDelete: (item) => setDeleteTarget(item),
    onAddSubItem: openAddChild,
    onIndent,
    onOutdent,
    onMoveTo: (n) => setMovingNode(n),
    onDragStart: beginDrag,
    onDragEnd: endDrag,
    onCommitDrop,
    draggedId: draggedNode?.id ?? null,
    draggedDescendants,
    dropTarget,
    dropTargetRef,
    setDropTarget,
    recentlyMovedId,
    actionBusy,
  };

  return (
    <>
      <div className="space-y-5">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Portfolio
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Teacher-curated checklist of requirements students complete over
              time.
            </p>
          </div>
          {isStaff && template && (
            <TemplatePublishBadge
              templateId={template.id}
              published={template.published}
              disabled={actionBusy}
              onCommitted={refresh}
            />
          )}
        </header>

        {/* Sub-view tabs */}
        <div
          role="tablist"
          aria-label="Portfolio view"
          className="flex border-b border-slate-200 dark:border-slate-700 -mb-px"
        >
          <button
            type="button"
            role="tab"
            aria-selected={subView === "template"}
            onClick={() => switchView("template")}
            className={`px-3 py-2 text-sm font-medium border-b-2 ${
              subView === "template"
                ? "border-indigo-600 text-indigo-700 dark:text-indigo-300"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            Template
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subView === "overview"}
            onClick={() => switchView("overview")}
            className={`px-3 py-2 text-sm font-medium border-b-2 ${
              subView === "overview"
                ? "border-indigo-600 text-indigo-700 dark:text-indigo-300"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            Overview
          </button>
        </div>

        {actionError && (
          <div
            role="alert"
            className="rounded-md bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-sm text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-900"
          >
            {actionError}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white/85 dark:bg-slate-900/70 p-4 space-y-3">
            <SkeletonRows count={5} rowClassName="h-12" />
          </div>
        ) : error ? (
          <div
            role="alert"
            className="rounded-xl bg-rose-50 dark:bg-rose-950/40 ring-1 ring-rose-200 dark:ring-rose-900 px-4 py-3 text-sm text-rose-700 dark:text-rose-300 flex items-center justify-between gap-3"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={() => {
                void refresh();
              }}
              className="shrink-0 rounded-md bg-white dark:bg-slate-900 ring-1 ring-rose-200 dark:ring-rose-900 px-3 py-1 text-xs font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/60"
            >
              Retry
            </button>
          </div>
        ) : !template ? (
          <EmptyState
            framed
            icon="inbox"
            title="Portfolio not initialized"
            body="This course doesn't have a portfolio template yet."
          />
        ) : subView === "template" ? (
          <div className="space-y-3">
            {isStaff && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={openAddRoot}
                  className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 shadow focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  + Item
                </button>
              </div>
            )}
            {tree.length === 0 ? (
              <EmptyState
                framed
                icon="inbox"
                title="No items yet"
                body="Add a requirement to start building the portfolio checklist."
                cta={
                  isStaff
                    ? { label: "+ Item", onClick: openAddRoot }
                    : undefined
                }
              />
            ) : (
              <PortfolioTreeView
                tree={tree}
                cb={nodeCallbacks}
                draggedNode={draggedNode}
                dropTargetRef={dropTargetRef}
                setDropTarget={setDropTarget}
                onCommitDrop={onCommitDrop}
              />
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {overviewError && (
              <p
                role="alert"
                className="text-sm text-rose-700 dark:text-rose-300"
              >
                {overviewError}
              </p>
            )}
            {overviewLoading || rosterLoading ? (
              <SkeletonTable rows={5} cols={4} />
            ) : (
              <PortfolioOverviewGrid
                leaves={leaves}
                roster={roster}
                statusByPair={statusByPair}
                onCellClick={(student, item) => setDrawer({ student, item })}
              />
            )}
          </div>
        )}
      </div>

      {showAdd && template && (
        <PortfolioItemFormModal
          open={true}
          mode="create"
          templateId={template.id}
          parentItemId={pendingChildOfId}
          nextPosition={
            pendingChildOfId ? Number.MAX_SAFE_INTEGER : nextRootPosition
          }
          onClose={() => {
            setShowAdd(false);
            setPendingChildOfId(null);
          }}
          onSaved={() => {
            void refresh();
          }}
        />
      )}

      {editTarget && template && (
        <PortfolioItemFormModal
          open={true}
          mode="edit"
          templateId={template.id}
          nextPosition={editTarget.position}
          initial={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            void refresh();
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete this item?"
          body={
            <div className="space-y-2">
              <p>
                <span className="font-semibold">{deleteTarget.title}</span> and
                every student submission for it (and every sub-item) will be
                removed.
              </p>
            </div>
          }
          confirmLabel="Delete item"
          destructive
          busy={actionBusy}
          onConfirm={() => {
            void onDelete(deleteTarget);
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {movingNode && (
        <MovePicker
          item={movingNode}
          tree={tree}
          forbiddenIds={(() => {
            const s = new Set<string>([movingNode.id]);
            for (const id of collectDescendantIds(movingNode)) s.add(id);
            return s;
          })()}
          onApply={async (newParentId, newPosition) => {
            await movePortfolioItem(movingNode.id, newParentId, newPosition);
            setMovingNode(null);
          }}
          onClose={() => setMovingNode(null)}
        />
      )}

      {drawer && (
        <SubmissionDetailDrawer
          open={true}
          item={drawer.item}
          studentId={drawer.student.student_id}
          studentLabel={studentLabel(drawer.student)}
          authorId={authorId}
          onClose={() => setDrawer(null)}
        />
      )}

    </>
  );
}
