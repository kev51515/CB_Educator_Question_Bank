/**
 * FilterAdapter
 * =============
 * Bridges the legacy Filters shape with the new declarative FacetState.
 *
 * The migration to the facet engine is done incrementally: App.tsx keeps a
 * legacy Filters around (so DSL/Presets/URL hash code paths continue to work)
 * while the new SidebarV2 + filtering pipeline operate on a FacetState.
 *
 * These helpers ensure both representations stay in sync.
 */
import type { Filters, IndexEntry, StatusFilter } from "@/types";
import { applyFacets, type FacetState } from "./facets";
import { FILTERS } from "./filterRegistry";

/** Convert legacy Filters → FacetState. Search lives outside facet state. */
export function filtersToFacetState(f: Filters): FacetState {
  const state: FacetState = {};
  if (f.sections.size) state.section = [...f.sections];
  if (f.difficulties.size) state.difficulty = [...f.difficulties];
  if (f.domains.size) state.domain = [...f.domains];
  if (f.skills.size) state.skill = [...f.skills];
  if (f.status.size) state.status = [...f.status];
  return state;
}

/** Convert FacetState → legacy Filters. Search is supplied separately because
 *  it lives outside the facet state. */
export function facetStateToFilters(s: FacetState, search: string): Filters {
  const sections = new Set<string>(((s.section as string[]) ?? []));
  const difficulties = new Set<string>(((s.difficulty as string[]) ?? []));
  const domains = new Set<string>(((s.domain as string[]) ?? []));
  const skills = new Set<string>(((s.skill as string[]) ?? []));
  const status = new Set<StatusFilter>(
    ((s.status as string[]) ?? []).filter(
      (v): v is StatusFilter =>
        v === "bookmarked" || v === "done" || v === "selected",
    ),
  );
  return { sections, difficulties, domains, skills, status, search };
}

/** The status facet is App-level (not derivable from IndexEntry).  Apply it
 *  on top of the facet engine's IndexEntry-based filtering. */
export function applyStatusFilter(
  entries: IndexEntry[],
  status: string[] | undefined,
  bookmarks: Set<string>,
  done: Set<string>,
  selected: Set<string>,
): IndexEntry[] {
  if (!status || status.length === 0) return entries;
  const wantBM = status.includes("bookmarked");
  const wantDone = status.includes("done");
  const wantSel = status.includes("selected");
  return entries.filter((e) => {
    const bm = bookmarks.has(e.id);
    const dn = done.has(e.id);
    const sl = selected.has(e.id);
    return (wantBM && bm) || (wantDone && dn) || (wantSel && sl);
  });
}

/** Apply free-text search to entries. Kept separate from the facet engine
 *  because the search box is logically distinct from the typed filters. */
export function applySearch(entries: IndexEntry[], search: string): IndexEntry[] {
  const q = search.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((e) => {
    const num = q.replace(/^#/, "");
    if (/^\d+$/.test(num) && e.number != null) {
      if (String(e.number) === num || String(e.number).startsWith(num)) return true;
    }
    return (
      e.id.toLowerCase().includes(q) ||
      e.skill.toLowerCase().includes(q) ||
      e.domain.toLowerCase().includes(q) ||
      (e.searchText ?? e.preview ?? "").includes(q) ||
      (e.mathText ?? "").includes(q)
    );
  });
}

/** Full filter pipeline: facets + status + search. */
export function applyAllFilters(
  entries: IndexEntry[],
  state: FacetState,
  search: string,
  bookmarks: Set<string>,
  done: Set<string>,
  selected: Set<string>,
): IndexEntry[] {
  // The status facet is not derivable from IndexEntry alone — exclude it
  // from the engine pass and apply it explicitly below.
  const facetDefs = FILTERS.filter((f) => f.key !== "status");
  let result = applyFacets(facetDefs, state, entries);
  result = applyStatusFilter(
    result,
    state.status as string[] | undefined,
    bookmarks,
    done,
    selected,
  );
  result = applySearch(result, search);
  return result;
}
