/**
 * usePortfolio — staff-facing hook backing the Portfolio tab.
 *
 * Auto-bootstraps a portfolio_templates row for the course (via the
 * `ensure_portfolio_template` RPC) the first time staff lands on the tab,
 * then fetches the items ordered by position. RLS guarantees only staff can
 * mutate; the student-facing surface uses `useStudentPortfolio` instead.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type PortfolioItemType =
  | "short_text"
  | "long_text"
  | "file"
  | "link"
  | "number"
  | "date"
  | "choice"
  | "multi_choice";

export interface PortfolioTemplate {
  id: string;
  course_id: string;
  name: string;
  description: string | null;
  published: boolean;
  created_at: string;
  updated_at: string;
}

export interface PortfolioItemSettings {
  /** Max characters for short_text / long_text. */
  max_chars?: number;
  /** Allowed choices for choice / multi_choice. */
  options?: string[];
}

export interface PortfolioItem {
  id: string;
  template_id: string;
  position: number;
  title: string;
  prompt: string | null;
  item_type: PortfolioItemType;
  required: boolean;
  due_at: string | null;
  settings: PortfolioItemSettings;
  parent_item_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Tree-shaped projection of `PortfolioItem`. Each node carries the full item
 * plus a sorted `children` array. Root nodes have `parent_item_id === null`.
 */
export interface PortfolioItemNode extends PortfolioItem {
  children: PortfolioItemNode[];
}

export interface UsePortfolio {
  template: PortfolioTemplate | null;
  items: PortfolioItem[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

interface TemplateRow {
  id: string;
  course_id: string;
  name: string;
  description: string | null;
  published: boolean;
  created_at: string;
  updated_at: string;
}

interface ItemRow {
  id: string;
  template_id: string;
  position: number;
  title: string;
  prompt: string | null;
  item_type: string;
  required: boolean;
  due_at: string | null;
  settings: unknown;
  parent_item_id: string | null;
  created_at: string;
  updated_at: string;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Failed to load portfolio.";
}

function isItemType(value: string): value is PortfolioItemType {
  return (
    value === "short_text" ||
    value === "long_text" ||
    value === "file" ||
    value === "link" ||
    value === "number" ||
    value === "date" ||
    value === "choice" ||
    value === "multi_choice"
  );
}

function toSettings(raw: unknown): PortfolioItemSettings {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: PortfolioItemSettings = {};
  if (typeof r.max_chars === "number") out.max_chars = r.max_chars;
  if (Array.isArray(r.options)) {
    out.options = r.options.filter((v): v is string => typeof v === "string");
  }
  return out;
}

export function usePortfolio(courseId: string | null): UsePortfolio {
  const [template, setTemplate] = useState<PortfolioTemplate | null>(null);
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!courseId) {
      setTemplate(null);
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Lazy bootstrap: server idempotently returns the existing template or
      // creates one on demand.
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        "ensure_portfolio_template",
        { p_course_id: courseId, p_name: "Portfolio" },
      );
      if (rpcError) {
        setTemplate(null);
        setItems([]);
        setError(rpcError.message);
        return;
      }
      const tplRow = (rpcData ?? null) as unknown as TemplateRow | null;
      if (!tplRow) {
        setTemplate(null);
        setItems([]);
        setError("Could not load template.");
        return;
      }
      const tpl: PortfolioTemplate = {
        id: tplRow.id,
        course_id: tplRow.course_id,
        name: tplRow.name,
        description: tplRow.description,
        published: tplRow.published,
        created_at: tplRow.created_at,
        updated_at: tplRow.updated_at,
      };
      setTemplate(tpl);

      const { data: itemData, error: itemError } = await supabase
        .from("portfolio_items")
        .select(
          "id, template_id, position, title, prompt, item_type, required, due_at, settings, parent_item_id, created_at, updated_at",
        )
        .eq("template_id", tpl.id)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });

      if (itemError) {
        setItems([]);
        setError(itemError.message);
        return;
      }

      const rows = (itemData ?? []) as unknown as ItemRow[];
      const mapped: PortfolioItem[] = rows
        .filter((r) => isItemType(r.item_type))
        .map((r) => ({
          id: r.id,
          template_id: r.template_id,
          position: r.position,
          title: r.title,
          prompt: r.prompt,
          item_type: r.item_type as PortfolioItemType,
          required: r.required,
          due_at: r.due_at,
          settings: toSettings(r.settings),
          parent_item_id: r.parent_item_id ?? null,
          created_at: r.created_at,
          updated_at: r.updated_at,
        }));
      setItems(mapped);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { template, items, loading, error, refresh };
}

/**
 * Build a nested tree of portfolio items from a flat list using
 * `parent_item_id`. Children at each level are sorted by `position` then
 * `created_at`. Orphans (rows whose parent isn't in the input — should only
 * happen mid-refresh) are promoted to roots so they never disappear.
 */
export function buildPortfolioTree(
  items: readonly PortfolioItem[],
): PortfolioItemNode[] {
  const ids = new Set<string>();
  for (const i of items) ids.add(i.id);

  const byParent = new Map<string | null, PortfolioItem[]>();
  for (const item of items) {
    const key =
      item.parent_item_id && ids.has(item.parent_item_id)
        ? item.parent_item_id
        : null;
    const bucket = byParent.get(key);
    if (bucket) bucket.push(item);
    else byParent.set(key, [item]);
  }

  const sortLevel = (a: PortfolioItem, b: PortfolioItem): number => {
    if (a.position !== b.position) return a.position - b.position;
    return a.created_at.localeCompare(b.created_at);
  };

  const build = (parentId: string | null): PortfolioItemNode[] => {
    const siblings = (byParent.get(parentId) ?? []).slice().sort(sortLevel);
    return siblings.map((item) => ({
      ...item,
      children: build(item.id),
    }));
  };

  return build(null);
}

/**
 * Walk a nested tree and return only leaf items (no children). Useful for
 * surfaces that operate on the actual submission targets — header items can
 * be parents of other items but never accept submissions themselves.
 */
export function flattenLeaves(
  nodes: readonly PortfolioItemNode[],
): PortfolioItem[] {
  const out: PortfolioItem[] = [];
  const walk = (level: readonly PortfolioItemNode[]): void => {
    for (const node of level) {
      if (node.children.length === 0) {
        out.push(node);
      } else {
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return out;
}

/**
 * Collect the descendant ids of a given root node (excluding the root itself).
 * Used to prevent cycle creation when computing valid drop targets / move
 * destinations.
 */
export function collectDescendantIds(
  root: PortfolioItemNode,
): Set<string> {
  const out = new Set<string>();
  const walk = (level: readonly PortfolioItemNode[]): void => {
    for (const node of level) {
      out.add(node.id);
      walk(node.children);
    }
  };
  walk(root.children);
  return out;
}

/**
 * Flat list of (node, depth) tuples in pre-order traversal. Handy for
 * rendering the parent dropdown in the Move-To picker with indentation.
 */
export interface FlatTreeEntry {
  node: PortfolioItemNode;
  depth: number;
}

export function flattenTree(
  nodes: readonly PortfolioItemNode[],
): FlatTreeEntry[] {
  const out: FlatTreeEntry[] = [];
  const walk = (level: readonly PortfolioItemNode[], depth: number): void => {
    for (const node of level) {
      out.push({ node, depth });
      walk(node.children, depth + 1);
    }
  };
  walk(nodes, 0);
  return out;
}
