import type { IndexEntry } from "@/types";
import { ciIncludes, type FacetDef } from "./facets";

/**
 * Filter registry. Add a new filter dimension by appending an entry here.
 *
 * Depth tiers:
 *   "simple"   — always shown (default sidebar width)
 *   "advanced" — Advanced mode only (widest sidebar)
 *
 * Legacy "detailed" tier is treated as "advanced" for backwards compatibility.
 */
export const FILTERS: FacetDef[] = [
  {
    key: "section",
    label: "Section",
    group: "Content",
    control: "multi",
    depth: "simple",
    accessor: (e) => e.section,
    matches: (ev, fv) => typeof ev === "string" && ciIncludes(fv as string[], ev),
    ordering: ["Math", "Reading and Writing"],
  },
  {
    key: "difficulty",
    label: "Difficulty",
    group: "Difficulty",
    control: "multi",
    depth: "simple",
    accessor: (e) => e.difficulty,
    matches: (ev, fv) => typeof ev === "string" && ciIncludes(fv as string[], ev),
    ordering: ["Easy", "Medium", "Hard"],
  },
  {
    key: "domain",
    label: "Domain",
    group: "Topic",
    control: "multi",
    depth: "simple",
    accessor: (e) => e.domain,
    matches: (ev, fv) => typeof ev === "string" && ciIncludes(fv as string[], ev),
  },
  {
    key: "skill",
    label: "Skill",
    group: "Topic",
    control: "tree",
    depth: "simple",
    parent: "domain",
    accessor: (e) => e.skill,
    matches: (ev, fv) => typeof ev === "string" && ciIncludes(fv as string[], ev),
  },
  {
    key: "aspect",
    label: "Sub-type within skill",
    group: "Topic",
    control: "multi",
    depth: "advanced",
    accessor: (e) => e.aspects ?? [],
    matches: (ev, fv) => {
      if (!Array.isArray(ev) || !Array.isArray(fv)) return false;
      const entryArr = ev as string[];
      const filterArr = fv as string[];
      return filterArr.some((v) => entryArr.includes(v));
    },
    hint: "Narrow within a skill (e.g. factor a polynomial)",
  },
  {
    key: "type",
    label: "Question type",
    group: "Format",
    control: "multi",
    depth: "advanced",
    accessor: (e) => e.type,
    matches: (ev, fv) => typeof ev === "string" && ciIncludes(fv as string[], ev),
    ordering: ["mcq", "spr"],
    hint: "MCQ = multiple choice · SPR = student-produced response",
  },
  {
    key: "hasStimulus",
    label: "Has passage/stimulus",
    group: "Format",
    control: "boolean",
    depth: "advanced",
    accessor: (e) => e.hasStimulus,
    matches: (ev, fv) => Boolean(ev) === Boolean(fv),
    hint: "Passage-based questions only",
  },
  {
    key: "updateDate",
    label: "Freshness",
    group: "Format",
    control: "daterange",
    depth: "advanced",
    accessor: (e) => e.updateDate,
    matches: (ev, fv) => {
      if (typeof ev !== "number") return false;
      const [lo, hi] = fv as [number, number];
      return ev >= lo && ev <= hi;
    },
    hint: "When CB last updated this question",
  },
  {
    key: "status",
    label: "Status",
    group: "Status",
    control: "multi",
    depth: "simple",
    // accessor returns the *array* of statuses this entry holds — must be
    // computed at runtime via injected bookmarks/done/selected sets.
    // For now, register as a passthrough; the engine accepts this and the UI
    // layer injects the per-entry value via a wrapper.
    accessor: () => undefined,
    matches: () => true,
    ordering: ["bookmarked", "done", "selected"],
  },
];

/** Lookup by key (memoised). */
const byKey = new Map(FILTERS.map((f) => [f.key, f]));
export function getFilterDef(key: string): FacetDef | undefined {
  return byKey.get(key);
}

/** Filter the registry by depth tier.
 *
 * Two-tier model: "simple" (0) and "advanced" (1). Any legacy registry entry
 * tagged with the deprecated "detailed" tier is treated as "advanced".
 */
export function visibleFilters(mode: "simple" | "advanced"): FacetDef[] {
  const tier = { simple: 0, advanced: 1 } as const;
  const resolve = (d: "simple" | "detailed" | "advanced" | undefined): 0 | 1 => {
    if (d === "advanced" || d === "detailed") return 1;
    return 0;
  };
  return FILTERS.filter((f) => resolve(f.depth) <= tier[mode]);
}

// IndexEntry is referenced in the FacetDef<IndexEntry> default generic
// inferred for FILTERS entries; this import suppresses unused-import noise.
export type { IndexEntry };
