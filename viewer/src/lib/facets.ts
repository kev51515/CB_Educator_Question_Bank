import type { IndexEntry } from "@/types";

/** A control type determines how the filter is rendered AND what shape its
 *  value takes in the filter state. */
export type FacetControl =
  | "multi"      // value: string[]    — checkboxes
  | "range"      // value: [number, number] — min/max slider
  | "boolean"    // value: boolean | null   — three-state toggle (null = "any")
  | "tree"       // value: string[]    — hierarchical multi-select (parent-aware)
  | "daterange"; // value: [number, number] — unix ms range

export interface FacetDef<E = IndexEntry> {
  /** Unique key — used in state, URL hash, DSL, presets. */
  key: string;
  /** Display label in the sidebar. */
  label: string;
  /** Sidebar grouping ("Content", "Difficulty", "Aspects", "Status"). */
  group?: string;
  /** Control type drives rendering. */
  control: FacetControl;
  /** Depth tier: when shown. "simple" = always. "detailed" = mode>=Detailed. "advanced" = mode>=Advanced. */
  depth?: "simple" | "detailed" | "advanced";
  /** Parent facet key — for hierarchical / scoped filters. */
  parent?: string;
  /** Only render this facet when this predicate matches the current state. */
  scopeWhen?: (state: FacetState) => boolean;
  /** Extract the value(s) of this facet from an entry. May return undefined. */
  accessor: (e: E) => unknown;
  /** Predicate: does this entry match the given filter value? */
  matches: (entryValue: unknown, filterValue: unknown) => boolean;
  /** Canonical ordering for UI (e.g. ["Easy","Medium","Hard"]). Optional. */
  ordering?: unknown[];
  /** For range/daterange: bounds + step. */
  range?: { min: number; max: number; step?: number };
  /** Short hint shown under the label. Optional. */
  hint?: string;
}

/** The unified filter state — Record keyed by facet key. */
export type FacetState = Record<string, unknown>;

/** Empty/default state. */
export function emptyFacetState(): FacetState {
  return {};
}

/** Is this facet "active" (i.e. has a non-default value)? */
export function isFacetActive(def: FacetDef, value: unknown): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) {
    if (def.control === "range" || def.control === "daterange") {
      // Range is active only if min/max diverge from bounds — defer to caller
      return value.length === 2 && (value[0] != null || value[1] != null);
    }
    return value.length > 0;
  }
  if (typeof value === "boolean") return true;
  return false;
}

/** Does an entry pass a single facet's filter? */
export function entryMatches(def: FacetDef, entry: IndexEntry, value: unknown): boolean {
  if (!isFacetActive(def, value)) return true;
  const entryValue = def.accessor(entry);
  return def.matches(entryValue, value);
}

/** Apply all facets to filter the entry list. */
export function applyFacets(
  defs: FacetDef[],
  state: FacetState,
  entries: IndexEntry[],
): IndexEntry[] {
  return entries.filter((e) =>
    defs.every((def) => entryMatches(def, e, state[def.key])),
  );
}

/** Compute facet counts: for each value in this facet, how many entries
 *  match all OTHER facets and have this value? Returns a Map per facet. */
export function facetCounts(
  defs: FacetDef[],
  state: FacetState,
  entries: IndexEntry[],
): Record<string, Map<string, number>> {
  const result: Record<string, Map<string, number>> = {};
  for (const def of defs) {
    // Scope = all OTHER facets applied (proper faceted-search behaviour).
    const others = defs.filter((d) => d.key !== def.key);
    const scope = entries.filter((e) =>
      others.every((o) => entryMatches(o, e, state[o.key])),
    );
    const counts = new Map<string, number>();
    for (const e of scope) {
      const v = def.accessor(e);
      if (v == null) continue;
      const values = Array.isArray(v) ? v : [v];
      for (const val of values) {
        const k = String(val);
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
    }
    result[def.key] = counts;
  }
  return result;
}

/** Drop filter values that don't exist in the current entry set.
 *  Used to clean up after section/skill changes (cascade pruning). */
export function sanitizeFacetState(
  defs: FacetDef[],
  state: FacetState,
  entries: IndexEntry[],
): FacetState {
  const next: FacetState = {};
  let changed = false;
  for (const def of defs) {
    const value = state[def.key];
    if (!isFacetActive(def, value)) continue;
    if (def.control === "multi" || def.control === "tree") {
      const valid = new Set<string>();
      for (const e of entries) {
        const v = def.accessor(e);
        if (v == null) continue;
        const values = Array.isArray(v) ? v : [v];
        for (const val of values) valid.add(String(val));
      }
      const pruned = (value as string[]).filter((v) => valid.has(String(v)));
      if (pruned.length !== (value as string[]).length) changed = true;
      if (pruned.length > 0) next[def.key] = pruned;
    } else {
      next[def.key] = value;
    }
  }
  // Apply cascade: re-prune children given pruned parents.
  // Repeat until stable (max 3 passes).
  for (let i = 0; i < 3; i++) {
    const scoped = applyFacets(defs, next, entries);
    let changedThisPass = false;
    for (const def of defs) {
      if (!def.parent) continue;
      const value = next[def.key];
      if (!isFacetActive(def, value)) continue;
      const valid = new Set<string>();
      for (const e of scoped) {
        const v = def.accessor(e);
        if (v == null) continue;
        const values = Array.isArray(v) ? v : [v];
        for (const val of values) valid.add(String(val));
      }
      const pruned = (value as string[]).filter((v) => valid.has(String(v)));
      if (pruned.length !== (value as string[]).length) {
        changedThisPass = true;
        changed = true;
        if (pruned.length > 0) next[def.key] = pruned;
        else delete next[def.key];
      }
    }
    if (!changedThisPass) break;
  }
  return changed ? next : state;
}

/** Serialize a facet state to URL hash params. */
export function facetStateToParams(
  defs: FacetDef[],
  state: FacetState,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const def of defs) {
    const v = state[def.key];
    if (!isFacetActive(def, v)) continue;
    if (def.control === "multi" || def.control === "tree") {
      params.set(def.key, (v as string[]).join("|"));
    } else if (def.control === "range" || def.control === "daterange") {
      params.set(def.key, (v as [number, number]).join(","));
    } else if (def.control === "boolean") {
      params.set(def.key, v ? "1" : "0");
    }
  }
  return params;
}

/** Parse params back to facet state. */
export function paramsToFacetState(
  defs: FacetDef[],
  params: URLSearchParams,
): FacetState {
  const state: FacetState = {};
  for (const def of defs) {
    const raw = params.get(def.key);
    if (raw == null) continue;
    if (def.control === "multi" || def.control === "tree") {
      const list = raw.split("|").filter(Boolean);
      if (list.length > 0) state[def.key] = list;
    } else if (def.control === "range" || def.control === "daterange") {
      const parts = raw.split(",").map((s) => Number(s));
      if (parts.length === 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
        state[def.key] = parts as [number, number];
      }
    } else if (def.control === "boolean") {
      state[def.key] = raw === "1";
    }
  }
  return state;
}

/** Case-insensitive Set.has helper for `multi` matchers. */
export function ciIncludes(values: string[], target: string): boolean {
  const low = target.toLowerCase();
  return values.some((v) => v.toLowerCase() === low);
}
