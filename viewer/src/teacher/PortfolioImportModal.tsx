/**
 * PortfolioImportModal
 * ====================
 * "Import items from another course's portfolio" picker.
 *
 * Two-step UI inside one modal:
 *   Step 1 — Pick a source course (dropdown of teacher-owned courses with
 *            at least one portfolio item).
 *   Step 2 — Tree of items in that template, each with a checkbox; selecting
 *            a parent auto-selects its descendants (and they import as a
 *            subtree). Provides "Select all" + "Clear" affordances.
 *
 * Footer: Cancel · "Import N items" primary. On success → toast, parent
 * refreshes, modal closes. On failure → toast.error, modal stays open with
 * selection intact for retry.
 *
 * Submissions DON'T transfer — surfaced in the subtitle.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Combobox, ResponsiveModal, useToast } from "@/components";
import { SkeletonRows } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import {
  buildSourceTree,
  collectSubtreeIds,
  fetchSourceTemplateItems,
  fetchTargetTemplateItems,
  flattenTargetItems,
  type PortfolioImportSource,
  type SourceItem,
  type SourceItemNode,
  type TargetItemOption,
} from "./usePortfolioImport";

interface PortfolioImportModalProps {
  open: boolean;
  /** Sources the teacher can import from. */
  availableSources: PortfolioImportSource[];
  /** True while parent's source list is still loading. */
  sourcesLoading: boolean;
  /** Surface a load error from the parent hook. */
  sourcesError: string | null;
  /** Whether the target template exists yet — guard, just in case. */
  hasTargetTemplate: boolean;
  /**
   * Target template id — used to fetch existing items so the teacher can
   * choose to insert the imported subtree UNDER one of them (Round 19).
   * When null/empty the anchor picker hides and "root" is implicit.
   */
  targetTemplateId?: string | null;
  /**
   * RPC caller — returns the imported count. Optional 3rd arg is the
   * target parent id; when omitted/null the import lands at root.
   */
  onImport: (
    sourceTemplateId: string,
    itemIds: string[],
    targetParentId?: string | null,
  ) => Promise<number>;
  /** Called after a successful import so the parent can refresh + close. */
  onImported: (count: number) => void;
  onClose: () => void;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

export function PortfolioImportModal({
  open,
  availableSources,
  sourcesLoading,
  sourcesError,
  hasTargetTemplate,
  targetTemplateId,
  onImport,
  onImported,
  onClose,
}: PortfolioImportModalProps) {
  const toast = useToast();

  const [sourceTemplateId, setSourceTemplateId] = useState<string>("");
  const [sourceItems, setSourceItems] = useState<SourceItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState<boolean>(false);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState<boolean>(false);

  // ---- Round 19: target anchor picker state -------------------------------
  // "" → root (default). Any other value → existing item id in target template.
  const [targetParentId, setTargetParentId] = useState<string>("");
  const [targetOptions, setTargetOptions] = useState<TargetItemOption[]>([]);
  const [targetLoading, setTargetLoading] = useState<boolean>(false);
  const [targetError, setTargetError] = useState<string | null>(null);

  // Default-pick the first source when the list resolves and nothing chosen.
  useEffect(() => {
    if (!open) return;
    if (sourceTemplateId) return;
    if (availableSources.length > 0) {
      setSourceTemplateId(availableSources[0].templateId);
    }
  }, [open, availableSources, sourceTemplateId]);

  // Fetch existing target-template items so the teacher can pick an anchor.
  // We refetch each time the modal opens or the target template changes —
  // the surface mounts rarely so this is cheap and keeps the picker fresh
  // after the user has just added/removed items behind the modal.
  useEffect(() => {
    if (!open || !targetTemplateId) {
      setTargetOptions([]);
      setTargetParentId("");
      setTargetError(null);
      return;
    }
    let cancelled = false;
    setTargetLoading(true);
    setTargetError(null);
    fetchTargetTemplateItems(targetTemplateId)
      .then((rows) => {
        if (cancelled) return;
        setTargetOptions(flattenTargetItems(rows));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setTargetError(
          getErrorMessage(err, "Failed to load target items."),
        );
        setTargetOptions([]);
      })
      .finally(() => {
        if (cancelled) return;
        setTargetLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, targetTemplateId]);

  // Fetch items when a source is chosen.
  useEffect(() => {
    if (!sourceTemplateId) {
      setSourceItems([]);
      setSelectedIds(new Set());
      return;
    }
    let cancelled = false;
    setItemsLoading(true);
    setItemsError(null);
    setSelectedIds(new Set());
    fetchSourceTemplateItems(sourceTemplateId)
      .then((rows) => {
        if (cancelled) return;
        setSourceItems(rows);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setItemsError(getErrorMessage(err, "Failed to load source items."));
        setSourceItems([]);
      })
      .finally(() => {
        if (cancelled) return;
        setItemsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sourceTemplateId]);

  const tree = useMemo<SourceItemNode[]>(
    () => buildSourceTree(sourceItems),
    [sourceItems],
  );

  // Index every node by id for fast subtree lookups during selection logic.
  const nodeById = useMemo<Map<string, SourceItemNode>>(() => {
    const m = new Map<string, SourceItemNode>();
    const walk = (nodes: SourceItemNode[]): void => {
      for (const n of nodes) {
        m.set(n.id, n);
        walk(n.children);
      }
    };
    walk(tree);
    return m;
  }, [tree]);

  // Toggle a node: ON → mark this node + all descendants. OFF → unmark same.
  // Parent isn't auto-toggled if you uncheck a child — that's noisy. The
  // import RPC treats every selected id as a root anyway and will pull
  // descendants on the server, so a parent's selection alone is enough.
  const toggleNode = useCallback(
    (id: string): void => {
      const node = nodeById.get(id);
      if (!node) return;
      const subtreeIds = collectSubtreeIds(node);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        const isOn = next.has(id);
        if (isOn) {
          for (const sid of subtreeIds) next.delete(sid);
        } else {
          for (const sid of subtreeIds) next.add(sid);
        }
        return next;
      });
    },
    [nodeById],
  );

  const selectAll = useCallback((): void => {
    const all = new Set<string>();
    for (const id of nodeById.keys()) all.add(id);
    setSelectedIds(all);
  }, [nodeById]);

  const clearAll = useCallback((): void => {
    setSelectedIds(new Set());
  }, []);

  // Effective import payload: just the picked roots. Whichever subset of
  // currently-selected ids has NO ancestor in the set (each root of every
  // selected subtree) gets sent. The RPC re-expands descendants server-side,
  // so this avoids double-imports when both parent and child are checked.
  const effectiveRootIds = useMemo<string[]>(() => {
    if (selectedIds.size === 0) return [];
    const out: string[] = [];
    for (const id of selectedIds) {
      const node = nodeById.get(id);
      if (!node) continue;
      // Walk ancestors via parent_item_id chain; if any ancestor is selected,
      // skip this one — it's a descendant of an already-picked root.
      let cur: string | null = node.parent_item_id;
      let skip = false;
      while (cur) {
        if (selectedIds.has(cur)) {
          skip = true;
          break;
        }
        const parent = nodeById.get(cur);
        cur = parent ? parent.parent_item_id : null;
      }
      if (!skip) out.push(id);
    }
    return out;
  }, [selectedIds, nodeById]);

  // For the button label we show total selected items (including descendants),
  // which is what the user actually expects to see imported.
  const totalSelected = selectedIds.size;

  // Resolve which parent id (if any) to send. "" → root → undefined.
  const effectiveTargetParentId = targetParentId ? targetParentId : null;

  // Headline text on the toast adapts to whether we anchored or rooted.
  const anchorTitle = useMemo<string | null>(() => {
    if (!effectiveTargetParentId) return null;
    return (
      targetOptions.find((o) => o.id === effectiveTargetParentId)?.title ?? null
    );
  }, [effectiveTargetParentId, targetOptions]);

  const onClickImport = useCallback(async (): Promise<void> => {
    if (!sourceTemplateId || effectiveRootIds.length === 0) return;
    if (!hasTargetTemplate) {
      toast.error("Couldn't import", "Target portfolio isn't initialized yet.");
      return;
    }
    setSubmitting(true);
    try {
      const count = await onImport(
        sourceTemplateId,
        effectiveRootIds,
        effectiveTargetParentId,
      );
      const headline =
        count === 1 ? "Imported 1 item" : `Imported ${count} items`;
      const subtitle = effectiveTargetParentId
        ? anchorTitle
          ? `Added as children of "${anchorTitle}".`
          : "Added as children of the selected item."
        : "Items appended to the end of this course's portfolio.";
      toast.success(headline, subtitle);
      onImported(count);
    } catch (err: unknown) {
      toast.error("Couldn't import", getErrorMessage(err, "Import failed."));
    } finally {
      setSubmitting(false);
    }
  }, [
    sourceTemplateId,
    effectiveRootIds,
    effectiveTargetParentId,
    anchorTitle,
    hasTargetTemplate,
    onImport,
    onImported,
    toast,
  ]);

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      dismissible={!submitting}
      size="lg"
      title="Import items from another course's portfolio"
      subtitle="Items will be added to the end of this course's portfolio. Student submissions don't transfer."
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              if (!submitting) onClose();
            }}
            disabled={submitting}
            className="min-h-[40px] md:min-h-0 rounded-lg px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              void onClickImport();
            }}
            disabled={
              submitting ||
              totalSelected === 0 ||
              !sourceTemplateId ||
              !hasTargetTemplate
            }
            className="min-h-[40px] md:min-h-0 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 shadow focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting
              ? "Importing…"
              : totalSelected === 0
              ? "Import"
              : totalSelected === 1
              ? "Import 1 item"
              : `Import ${totalSelected} items`}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Step 1: source picker */}
        <section className="space-y-2">
          <label
            htmlFor="portfolio-import-source"
            className="block text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            Source course
          </label>
          {sourcesLoading ? (
            <div className="rounded-xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900 p-3">
              <SkeletonRows count={2} rowClassName="h-8" />
            </div>
          ) : sourcesError ? (
            <p
              role="alert"
              className="text-sm text-rose-700 dark:text-rose-300"
            >
              {sourcesError}
            </p>
          ) : availableSources.length === 0 ? (
            <EmptyState
              framed
              icon="inbox"
              title="No source courses available"
              body="You can import only from courses you teach that already have portfolio items."
            />
          ) : (
            <Combobox
              id="portfolio-import-source"
              ariaLabel="Source course"
              value={sourceTemplateId || null}
              onChange={(v) => setSourceTemplateId(v)}
              disabled={submitting}
              className="w-full"
              placeholder="Choose a source course…"
              options={availableSources.map((src) => ({
                value: src.templateId,
                label: `${src.courseName} · ${src.itemCount} ${
                  src.itemCount === 1 ? "item" : "items"
                }`,
              }))}
            />
          )}
        </section>

        {/* Step 1b (Round 19): "Insert at…" anchor picker.
            Hidden when the target template has no items — root is implicit. */}
        {hasTargetTemplate && (targetLoading || targetOptions.length > 0 || targetError) && (
          <section className="space-y-2">
            <label
              htmlFor="portfolio-import-anchor"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Insert at
            </label>
            {targetLoading ? (
              <div className="rounded-xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900 p-3">
                <SkeletonRows count={2} rowClassName="h-8" />
              </div>
            ) : targetError ? (
              <p
                role="alert"
                className="text-sm text-rose-700 dark:text-rose-300"
              >
                {targetError}
              </p>
            ) : (
              <>
                <Combobox
                  id="portfolio-import-anchor"
                  ariaLabel="Insert at"
                  value={targetParentId || null}
                  onChange={(v) => setTargetParentId(v)}
                  disabled={submitting}
                  className="w-full"
                  placeholder="Top level (root)"
                  options={targetOptions.map((opt) => ({
                    value: opt.id,
                    // Indent with non-breaking spaces so the nesting reads in
                    // the single-line label (leading whitespace collapses).
                    label: `${"  ".repeat(opt.depth + 1)}${opt.title}`,
                  }))}
                />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {targetParentId
                    ? "Picked items will be inserted as children of this."
                    : "Picked items will be added at the top level."}
                </p>
              </>
            )}
          </section>
        )}

        {/* Step 2: item tree */}
        {sourceTemplateId && availableSources.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Items
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={selectAll}
                  disabled={
                    submitting || itemsLoading || sourceItems.length === 0
                  }
                  className="min-h-[40px] md:min-h-0 rounded-md px-3 py-1 text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={clearAll}
                  disabled={submitting || selectedIds.size === 0}
                  className="min-h-[40px] md:min-h-0 rounded-md px-3 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="rounded-xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900 p-3 max-h-72 overflow-y-auto">
              {itemsLoading ? (
                <SkeletonRows count={4} rowClassName="h-8" />
              ) : itemsError ? (
                <p
                  role="alert"
                  className="text-sm text-rose-700 dark:text-rose-300"
                >
                  {itemsError}
                </p>
              ) : tree.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 px-1 py-2">
                  This template has no items.
                </p>
              ) : (
                <ul className="space-y-1">
                  {tree.map((n) => (
                    <ImportTreeRow
                      key={n.id}
                      node={n}
                      depth={0}
                      selectedIds={selectedIds}
                      onToggle={toggleNode}
                      disabled={submitting}
                    />
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}
      </div>
    </ResponsiveModal>
  );
}

// -----------------------------------------------------------------------------
// Recursive row for the item tree. Indents by depth, checkbox + title.
// -----------------------------------------------------------------------------

interface ImportTreeRowProps {
  node: SourceItemNode;
  depth: number;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  disabled: boolean;
}

function ImportTreeRow({
  node,
  depth,
  selectedIds,
  onToggle,
  disabled,
}: ImportTreeRowProps): JSX.Element {
  const checked = selectedIds.has(node.id);
  // 16px per depth level — readable but compact.
  const indent = { paddingLeft: `${depth * 16}px` };
  const inputId = `pi-import-${node.id}`;

  return (
    <li>
      <label
        htmlFor={inputId}
        style={indent}
        className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 ${
          disabled ? "opacity-60 cursor-not-allowed" : ""
        }`}
      >
        <input
          id={inputId}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={() => onToggle(node.id)}
          className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
        />
        <span className="text-slate-800 dark:text-slate-200 truncate">
          {node.title}
        </span>
        <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">
          {node.item_type}
        </span>
      </label>
      {node.children.length > 0 && (
        <ul className="space-y-1">
          {node.children.map((c) => (
            <ImportTreeRow
              key={c.id}
              node={c}
              depth={depth + 1}
              selectedIds={selectedIds}
              onToggle={onToggle}
              disabled={disabled}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
