/**
 * Filters
 * =======
 * Pure functions over the `Filters` shape:
 *   - `applyFilters`     — narrow the index to entries matching the filters
 *   - `sanitizeFilters`  — drop orphan filter values (e.g. from stale URLs)
 *   - `missingRequired`  — list facets that the user MUST select before results
 *
 * These are deliberately side-effect-free so they're easy to memoize, test,
 * and reuse across App, Sidebar, and CommandPalette.
 */
import type { Filters, IndexEntry } from "@/types";

/**
 * Facets that block results until the user picks at least one value.
 * Currently empty — the original safeguard was relaxed once the list virtualized
 * well at 3,400+ entries. Keep the type so we can re-tighten without rewriting.
 */
export const REQUIRED_FACETS: ReadonlyArray<keyof Pick<Filters, "difficulties">> = [];

/**
 * Case-insensitive membership for Set<string>.
 * Defensive against URL casings that don't match the canonical index case.
 */
export function ciHas(set: Set<string>, value: string): boolean {
  if (set.has(value)) return true;
  const low = value.toLowerCase();
  for (const v of set) if (v.toLowerCase() === low) return true;
  return false;
}

/**
 * Return the list of REQUIRED facets the user hasn't yet selected.
 *
 * If the user has narrowed by status (Bookmarked / Done / Selected), that
 * counts as explicit intent — required facets are then waived.
 */
export function missingRequired(f: Filters): readonly (typeof REQUIRED_FACETS)[number][] {
  if (f.status.size > 0) return [];
  return REQUIRED_FACETS.filter((k) => f[k].size === 0);
}

/**
 * Narrow the index to entries matching the current filters.
 * Returns an empty array if a required facet is missing (see `missingRequired`).
 *
 * Search semantics:
 *   - "#123"   → number prefix match (per-skill question number)
 *   - "stem"   → id/skill/domain/preview substring (case-insensitive)
 */
export function applyFilters(
  index: IndexEntry[],
  f: Filters,
  bookmarks: Set<string>,
  done: Set<string>,
  selected: Set<string>,
): IndexEntry[] {
  if (missingRequired(f).length > 0) return [];
  const search = f.search.trim().toLowerCase();
  return index.filter((e) => {
    if (f.sections.size && !ciHas(f.sections, e.section)) return false;
    if (f.difficulties.size && !ciHas(f.difficulties, e.difficulty)) return false;
    if (f.domains.size && !ciHas(f.domains, e.domain)) return false;
    if (f.skills.size && !ciHas(f.skills, e.skill)) return false;
    if (f.status.size) {
      const wantBM = f.status.has("bookmarked");
      const wantDone = f.status.has("done");
      const wantSel = f.status.has("selected");
      const isBM = bookmarks.has(e.id);
      const isDone = done.has(e.id);
      const isSel = selected.has(e.id);
      // OR semantics across statuses (matches typical "show me X OR Y" UX).
      if (!((wantBM && isBM) || (wantDone && isDone) || (wantSel && isSel))) return false;
    }
    if (search) {
      const num = search.replace(/^#/, "");
      if (/^\d+$/.test(num) && e.number != null) {
        if (String(e.number) === num || String(e.number).startsWith(num)) return true;
      }
      return (
        e.id.toLowerCase().includes(search) ||
        e.skill.toLowerCase().includes(search) ||
        e.domain.toLowerCase().includes(search) ||
        (e.searchText ?? e.preview ?? "").includes(search)
      );
    }
    return true;
  });
}

/**
 * Drop filter values that don't match any entry in the current index. This
 * handles two cases:
 *
 *   1. URLs hand-edited or out-of-date
 *   2. Cascade — user picked Skill X, then changed Section, and the skill no
 *      longer exists in the new scope
 *
 * Returns the SAME `Filters` reference when nothing changed, so callers can
 * safely feed the result back into a state setter without infinite loops.
 */
export function sanitizeFilters(index: IndexEntry[], f: Filters): Filters {
  if (index.length === 0) return f;
  const valid = {
    sections: new Set(index.map((e) => e.section.toLowerCase())),
    difficulties: new Set(index.map((e) => e.difficulty.toLowerCase())),
    domains: new Set(index.map((e) => e.domain.toLowerCase())),
    skills: new Set(index.map((e) => e.skill.toLowerCase())),
  };
  let changed = false;
  const prune = <T extends string>(set: Set<T>, ok: Set<string>): Set<T> => {
    const next = new Set<T>();
    for (const v of set) {
      if (ok.has(v.toLowerCase())) next.add(v);
      else changed = true;
    }
    return next;
  };
  // NOTE: previously this function dropped `f.status`. Preserved here as the
  // status facet is independent of the index dictionary and should never be
  // sanitized away.
  const next: Filters = {
    sections: prune(f.sections, valid.sections),
    difficulties: prune(f.difficulties, valid.difficulties),
    domains: prune(f.domains, valid.domains),
    skills: prune(f.skills, valid.skills),
    status: f.status,
    search: f.search,
  };

  // Cascade pruning: only keep domains that exist within the chosen
  // sections+difficulties, and only keep skills that exist within that scope.
  // This addresses the "I picked Skill X then switched Section, now 0 results"
  // UX problem.
  const inSecDiff = index.filter((e) => {
    if (next.sections.size && !ciHas(next.sections, e.section)) return false;
    if (next.difficulties.size && !ciHas(next.difficulties, e.difficulty)) return false;
    return true;
  });
  const allowedDomains = new Set(inSecDiff.map((e) => e.domain.toLowerCase()));
  const prunedDomains = prune(next.domains, allowedDomains);
  if (prunedDomains.size !== next.domains.size) {
    next.domains = prunedDomains;
    changed = true;
  }
  const inDom = inSecDiff.filter(
    (e) => next.domains.size === 0 || ciHas(next.domains, e.domain),
  );
  const allowedSkills = new Set(inDom.map((e) => e.skill.toLowerCase()));
  const prunedSkills = prune(next.skills, allowedSkills);
  if (prunedSkills.size !== next.skills.size) {
    next.skills = prunedSkills;
    changed = true;
  }
  return changed ? next : f;
}
