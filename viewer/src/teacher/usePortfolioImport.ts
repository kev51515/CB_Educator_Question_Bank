/**
 * usePortfolioImport — backing data layer for the "Import items from another
 * course's portfolio" modal on CoursePortfolio.tsx.
 *
 * Two responsibilities:
 *   1. List the OTHER courses the current teacher owns that have a portfolio
 *      template with at least one item — these are the candidate sources.
 *   2. Call the `import_portfolio_items` RPC and return the count.
 *
 * RLS already lets a teacher SELECT their own courses' portfolio_templates +
 * portfolio_items, so this is plain PostgREST — no extra RPC needed for the
 * source listing.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface PortfolioImportSource {
  courseId: string;
  courseName: string;
  templateId: string;
  itemCount: number;
}

export interface UsePortfolioImport {
  availableSources: PortfolioImportSource[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  importItems: (
    sourceTemplateId: string,
    itemIds: string[],
    targetParentId?: string | null,
  ) => Promise<number>;
}

interface TemplateRow {
  id: string;
  course_id: string;
  courses: { id: string; name: string | null } | null;
}

interface ItemCountRow {
  template_id: string;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

export function usePortfolioImport(
  currentCourseId: string,
  currentTemplateId: string | null,
): UsePortfolioImport {
  const [availableSources, setAvailableSources] = useState<
    PortfolioImportSource[]
  >([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      // 1. Templates the teacher can see (RLS limits to courses they teach).
      //    Exclude the current course's template — importing into yourself is
      //    blocked at the RPC layer anyway, but no point in offering it.
      const { data: templates, error: tplError } = await supabase
        .from("portfolio_templates")
        .select("id, course_id, courses:course_id(id, name)")
        .neq("course_id", currentCourseId);

      if (tplError) {
        setError(tplError.message);
        setAvailableSources([]);
        return;
      }
      const tplRows = (templates ?? []) as unknown as TemplateRow[];
      if (tplRows.length === 0) {
        setAvailableSources([]);
        return;
      }

      // 2. Item counts per template. We just pull template_id from
      //    portfolio_items where template_id IN (...), group client-side.
      const templateIds = tplRows.map((t) => t.id);
      const { data: itemRows, error: itemError } = await supabase
        .from("portfolio_items")
        .select("template_id")
        .in("template_id", templateIds);

      if (itemError) {
        setError(itemError.message);
        setAvailableSources([]);
        return;
      }
      const countByTemplate = new Map<string, number>();
      for (const row of (itemRows ?? []) as unknown as ItemCountRow[]) {
        countByTemplate.set(
          row.template_id,
          (countByTemplate.get(row.template_id) ?? 0) + 1,
        );
      }

      // 3. Project + filter to non-empty templates, sort alphabetically by
      //    course name (nulls last). Tie-break on courseId for stability.
      const sources: PortfolioImportSource[] = tplRows
        .map((t) => ({
          courseId: t.course_id,
          courseName: t.courses?.name?.trim() || "(untitled course)",
          templateId: t.id,
          itemCount: countByTemplate.get(t.id) ?? 0,
        }))
        .filter((s) => s.itemCount > 0)
        .sort((a, b) => {
          const byName = a.courseName.localeCompare(b.courseName);
          if (byName !== 0) return byName;
          return a.courseId.localeCompare(b.courseId);
        });

      setAvailableSources(sources);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to load source courses."));
      setAvailableSources([]);
    } finally {
      setLoading(false);
    }
  }, [currentCourseId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const importItems = useCallback(
    async (
      sourceTemplateId: string,
      itemIds: string[],
      targetParentId?: string | null,
    ): Promise<number> => {
      if (!currentTemplateId) {
        throw new Error("Target portfolio template not initialized.");
      }
      if (itemIds.length === 0) return 0;

      // Round 19: optional anchor parent. When unset/NULL the RPC's default
      // (mig 0064) preserves 0063's root-level behavior.
      const params: {
        p_source_template_id: string;
        p_target_template_id: string;
        p_item_ids: string[];
        p_target_parent_id?: string | null;
      } = {
        p_source_template_id: sourceTemplateId,
        p_target_template_id: currentTemplateId,
        p_item_ids: itemIds,
      };
      if (targetParentId) {
        params.p_target_parent_id = targetParentId;
      }

      const { data, error: rpcError } = await supabase.rpc(
        "import_portfolio_items",
        params,
      );
      if (rpcError) {
        throw new Error(rpcError.message);
      }
      // RPC returns integer count.
      return typeof data === "number" ? data : 0;
    },
    [currentTemplateId],
  );

  return { availableSources, loading, error, refresh, importItems };
}

// -----------------------------------------------------------------------------
// Source-template item fetch (used by the modal once a source is picked).
// Co-located here so the modal stays a pure UI component.
// -----------------------------------------------------------------------------

export interface SourceItem {
  id: string;
  parent_item_id: string | null;
  position: number;
  title: string;
  item_type: string;
}

export interface SourceItemNode extends SourceItem {
  children: SourceItemNode[];
}

export async function fetchSourceTemplateItems(
  templateId: string,
): Promise<SourceItem[]> {
  const { data, error: itemError } = await supabase
    .from("portfolio_items")
    .select("id, parent_item_id, position, title, item_type")
    .eq("template_id", templateId)
    .order("position", { ascending: true });

  if (itemError) {
    throw new Error(itemError.message);
  }
  return (data ?? []) as unknown as SourceItem[];
}

/** Build a tree from flat source items. Mirrors usePortfolio's buildTree. */
export function buildSourceTree(items: SourceItem[]): SourceItemNode[] {
  const byId = new Map<string, SourceItemNode>();
  for (const it of items) {
    byId.set(it.id, { ...it, children: [] });
  }
  const roots: SourceItemNode[] = [];
  for (const node of byId.values()) {
    if (node.parent_item_id && byId.has(node.parent_item_id)) {
      byId.get(node.parent_item_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortRec = (nodes: SourceItemNode[]): void => {
    nodes.sort((a, b) => a.position - b.position);
    for (const n of nodes) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}

/** Flatten ALL ids in a subtree (including the root) for batch selection. */
export function collectSubtreeIds(node: SourceItemNode): string[] {
  const out: string[] = [node.id];
  for (const c of node.children) {
    out.push(...collectSubtreeIds(c));
  }
  return out;
}

// -----------------------------------------------------------------------------
// Target-template item fetch + flatten (Round 19 — anchor picker support).
// Used by the modal to present "insert under…" choices. RLS already lets the
// teacher SELECT their own course's items, so plain PostgREST works.
// -----------------------------------------------------------------------------

export interface TargetItemOption {
  id: string;
  title: string;
  depth: number;
}

/** Fetch all items in the target template (id, parent, title, position). */
export async function fetchTargetTemplateItems(
  templateId: string,
): Promise<SourceItem[]> {
  const { data, error: itemError } = await supabase
    .from("portfolio_items")
    .select("id, parent_item_id, position, title, item_type")
    .eq("template_id", templateId)
    .order("position", { ascending: true });

  if (itemError) {
    throw new Error(itemError.message);
  }
  return (data ?? []) as unknown as SourceItem[];
}

/**
 * Flatten target items into a depth-aware ordered list suitable for an
 * indented <select> or radio group. Order: depth-first, position-sorted.
 */
export function flattenTargetItems(items: SourceItem[]): TargetItemOption[] {
  const tree = buildSourceTree(items);
  const out: TargetItemOption[] = [];
  const walk = (nodes: SourceItemNode[], depth: number): void => {
    for (const n of nodes) {
      out.push({ id: n.id, title: n.title, depth });
      if (n.children.length > 0) walk(n.children, depth + 1);
    }
  };
  walk(tree, 0);
  return out;
}
