/**
 * useCourseModules
 * ================
 * Loads all course_modules for a course plus their nested module_items in a
 * single embedded-select query. Returns the modules array sorted by
 * `position`, with each module's `items` sub-array also sorted by `position`.
 *
 * RLS handles visibility: a teacher / staff sees everything in their course;
 * an enrolled student sees the same set of modules + items but can't mutate
 * them (the staff-only INSERT/UPDATE/DELETE policies enforce that).
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type ModuleItemType =
  | "assignment"
  | "header"
  | "link"
  | "page"
  | "file"
  | "note"
  | "divider"
  | "video";

export interface ModuleItem {
  id: string;
  module_id: string;
  position: number;
  item_type: ModuleItemType;
  item_ref_id: string | null;
  title: string;
  url: string | null;
  indent: number;
  published: boolean;
  /** Scheduled auto-publish time (0219). Null = manual publishing only. */
  publish_at: string | null;
  /**
   * Due date for assignment-backed items (Assignment / Practice Test /
   * Question Set), resolved from the linked `assignments.due_at` via the soft
   * FK `item_ref_id`. Null for headers, links, and undated assignments.
   */
  due_at: string | null;
  /** Start time for assignment-backed items (`assignments.opens_at`). */
  opens_at: string | null;
  /** Per-type inline payload (0225) — e.g. note body+tone, page body. {} if unset. */
  config: Record<string, unknown>;
}

export interface CourseModule {
  id: string;
  course_id: string;
  name: string;
  position: number;
  published: boolean;
  opens_at: string | null;
  lock_at: string | null;
  /** Scheduled auto-publish time (0219). Null = manual publishing only. */
  publish_at: string | null;
  parent_module_id: string | null;
  created_at: string;
  updated_at: string;
  items: ModuleItem[];
}

/**
 * Tree-shaped projection of `CourseModule`. Each node carries the full module
 * shape plus a sorted `children` array and a derived `depth` value (root = 0).
 * `path` is a list of positions from root to this node (handy for breadcrumbs
 * and for sorting cross-level lookups deterministically).
 */
export interface ModuleNode extends CourseModule {
  depth: number;
  path: number[];
  children: ModuleNode[];
}

export interface UseCourseModules {
  modules: CourseModule[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Optimistic local update of one module (no refetch) — e.g. publish toggle. */
  patchModule: (id: string, patch: Partial<CourseModule>) => void;
  /** Optimistic local update of one nested item (no refetch). */
  patchItem: (itemId: string, patch: Partial<ModuleItem>) => void;
}

interface ModuleItemRow {
  id: string;
  module_id: string;
  position: number;
  item_type: string;
  item_ref_id: string | null;
  title: string;
  url: string | null;
  indent: number;
  published: boolean;
  publish_at: string | null;
  config: Record<string, unknown> | null;
}

interface CourseModuleRow {
  id: string;
  course_id: string;
  name: string;
  position: number;
  published: boolean;
  opens_at: string | null;
  lock_at: string | null;
  publish_at: string | null;
  parent_module_id: string | null;
  created_at: string;
  updated_at: string;
  items: ModuleItemRow[] | null;
}

const VALID_ITEM_TYPES: ReadonlySet<string> = new Set([
  "assignment",
  "header",
  "link",
  "page",
  "file",
  "note",
  "divider",
  "video",
]);

function asItemType(value: string): ModuleItemType {
  return VALID_ITEM_TYPES.has(value) ? (value as ModuleItemType) : "header";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Failed to load modules.";
}

export function useCourseModules(classId: string | null): UseCourseModules {
  const [modules, setModules] = useState<CourseModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!classId) {
      setModules([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Single round-trip: PostgREST nested select walks
      // course_modules → module_items and applies the FK relationship.
      const { data, error: queryError } = await supabase
        .from("course_modules")
        .select(
          [
            "id",
            "course_id",
            "name",
            "position",
            "published",
            "opens_at",
            "lock_at",
            "publish_at",
            "parent_module_id",
            "created_at",
            "updated_at",
            // Inline items so we don't fire one query per module. The
            // server-side order isn't guaranteed across nested rows, so we
            // sort again on the client below.
            "items:module_items(id, module_id, position, item_type, item_ref_id, title, url, indent, published, publish_at, config)",
          ].join(", "),
        )
        .eq("course_id", classId)
        .order("position", { ascending: true });

      if (queryError) {
        setModules([]);
        setError(queryError.message);
        return;
      }

      // Resolve assignment due dates for assignment-backed items. `item_ref_id`
      // is a SOFT FK (header/link rows hold NULL), so PostgREST can't embed it
      // — a small second query keyed by course is cheaper than per-item lookups
      // and keeps the nested module select simple.
      const dueByAssignment = new Map<
        string,
        { due_at: string | null; opens_at: string | null }
      >();
      const { data: asnData } = await supabase
        .from("assignments")
        .select("id, due_at, opens_at")
        .eq("course_id", classId);
      for (const a of (asnData ?? []) as {
        id: string;
        due_at: string | null;
        opens_at: string | null;
      }[]) {
        dueByAssignment.set(a.id, { due_at: a.due_at, opens_at: a.opens_at });
      }

      const rows = (data ?? []) as unknown as CourseModuleRow[];
      const mapped: CourseModule[] = rows
        .map((row) => {
          const itemRows = row.items ?? [];
          const items: ModuleItem[] = itemRows
            .map((item) => ({
              id: item.id,
              module_id: item.module_id,
              position: item.position,
              item_type: asItemType(item.item_type),
              item_ref_id: item.item_ref_id,
              title: item.title,
              url: item.url,
              indent: item.indent,
              published: item.published,
              publish_at: item.publish_at,
              due_at: item.item_ref_id
                ? (dueByAssignment.get(item.item_ref_id)?.due_at ?? null)
                : null,
              opens_at: item.item_ref_id
                ? (dueByAssignment.get(item.item_ref_id)?.opens_at ?? null)
                : null,
              config: (item.config ?? {}) as Record<string, unknown>,
            }))
            .sort((a, b) => a.position - b.position);

          return {
            id: row.id,
            course_id: row.course_id,
            name: row.name,
            position: row.position,
            published: row.published,
            opens_at: row.opens_at,
            lock_at: row.lock_at ?? null,
            publish_at: row.publish_at ?? null,
            parent_module_id: row.parent_module_id ?? null,
            created_at: row.created_at,
            updated_at: row.updated_at,
            items,
          };
        })
        .sort((a, b) => a.position - b.position);

      setModules(mapped);
    } catch (err: unknown) {
      setModules([]);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [classId]);

  const patchModule = useCallback((id: string, patch: Partial<CourseModule>): void => {
    setModules((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  const patchItem = useCallback((itemId: string, patch: Partial<ModuleItem>): void => {
    setModules((prev) =>
      prev.map((m) => ({
        ...m,
        items: m.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)),
      })),
    );
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { modules, loading, error, refresh, patchModule, patchItem };
}

/**
 * Build a nested tree from a flat list of modules using `parent_module_id`.
 * Each level's children are sorted by `position`. Orphans (rows whose parent
 * isn't in the input — should only happen mid-refresh) are promoted to roots
 * so they never disappear from the UI.
 *
 * Derives `depth` (root = 0) and `path` (positions from root to node) so the
 * caller doesn't need to thread them through render code.
 */
export function buildTree(modules: readonly CourseModule[]): ModuleNode[] {
  const byParent = new Map<string | null, CourseModule[]>();
  const ids = new Set<string>();
  for (const m of modules) ids.add(m.id);
  for (const m of modules) {
    const key = m.parent_module_id && ids.has(m.parent_module_id)
      ? m.parent_module_id
      : null;
    const bucket = byParent.get(key);
    if (bucket) bucket.push(m);
    else byParent.set(key, [m]);
  }

  const build = (
    parentId: string | null,
    depth: number,
    parentPath: readonly number[],
  ): ModuleNode[] => {
    const siblings = (byParent.get(parentId) ?? [])
      .slice()
      .sort((a, b) => a.position - b.position);
    return siblings.map((m) => {
      const path = [...parentPath, m.position];
      return {
        ...m,
        depth,
        path,
        children: build(m.id, depth + 1, path),
      };
    });
  };

  return build(null, 0, []);
}
