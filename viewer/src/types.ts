export interface IndexEntry {
  id: string;
  number?: number; // user-facing question number, assigned at index build time
  section: string;
  difficulty: string;
  domain: string;
  skill: string;
  type: string;
  preview?: string;
  searchText?: string; // lowercased, MathML-stripped stem+stimulus for full-text search
  mathText?: string;
  path: string;
  hasStimulus?: boolean; // whether the question has a passage/stimulus
  updateDate?: number | null; // Unix timestamp ms — latest of updateDate/createDate
  /**
   * Sub-type aspects within a skill — kebab-case slugs from the aspects
   * catalog. Usually 1 slug per question; may be empty/omitted for "Other".
   * Populated by a separate build step (catalog at /data/aspects/catalog.json).
   */
  aspects?: string[];
}

/**
 * Entry from the runtime-fetched aspects catalog
 * (`/data/aspects/catalog.json`). One entry per globally-unique aspect slug.
 */
export interface AspectCatalogEntry {
  slug: string;
  label: string;
  skill: string;
  domain: string;
  section: string;
  count: number;
}

export interface AnswerOption {
  id: string;
  content: string;
}

export interface Question {
  questionId: string;
  section: string;
  difficulty: string;
  domain: string;
  skill: string;
  type: string; // "mcq" | "spr" | ...
  stimulus?: string;
  stem: string;
  answerOptions?: AnswerOption[];
  keys?: string[];
  rationale?: string;
}

export type StatusFilter = "bookmarked" | "done" | "selected";

export interface Filters {
  sections: Set<string>;
  difficulties: Set<string>;
  domains: Set<string>;
  skills: Set<string>;
  status: Set<StatusFilter>;
  search: string;
}

export function emptyFilters(): Filters {
  return {
    sections: new Set(),
    difficulties: new Set(),
    domains: new Set(),
    skills: new Set(),
    status: new Set(),
    search: "",
  };
}

export interface UrlState {
  selectedId: string | null;
  filters: Filters;
  setId: string; // "" = original, "set-1" = Set #1, etc.
}

const KEY = {
  q: "q",
  sec: "sec",
  diff: "diff",
  dom: "dom",
  skl: "skl",
  st: "st",
  s: "s",
  set: "set",
} as const;

function parseSet(raw: string | null): Set<string> {
  if (!raw) return new Set();
  // URLSearchParams already decodes; just split on the pipe delimiter.
  return new Set(raw.split("|").filter(Boolean));
}

function encodeSet(set: Set<string>): string {
  // URLSearchParams will URL-encode; we only need our own delimiter.
  return [...set].join("|");
}

export function parseUrlState(hash: string): UrlState {
  const filters = emptyFilters();
  if (!hash || hash === "#") return { selectedId: null, filters, setId: "" };
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  filters.sections = parseSet(params.get(KEY.sec));
  filters.difficulties = parseSet(params.get(KEY.diff));
  filters.domains = parseSet(params.get(KEY.dom));
  filters.skills = parseSet(params.get(KEY.skl));
  const st = parseSet(params.get(KEY.st));
  filters.status = new Set(
    [...st].filter(
      (v): v is StatusFilter => v === "bookmarked" || v === "done" || v === "selected",
    ),
  );
  filters.search = params.get(KEY.s) ?? "";
  return {
    selectedId: params.get(KEY.q),
    filters,
    setId: params.get(KEY.set) ?? "",
  };
}

export function buildHash(state: UrlState): string {
  const params = new URLSearchParams();
  if (state.selectedId) params.set(KEY.q, state.selectedId);
  if (state.setId) params.set(KEY.set, state.setId);
  if (state.filters.sections.size) params.set(KEY.sec, encodeSet(state.filters.sections));
  if (state.filters.difficulties.size) params.set(KEY.diff, encodeSet(state.filters.difficulties));
  if (state.filters.domains.size) params.set(KEY.dom, encodeSet(state.filters.domains));
  if (state.filters.skills.size) params.set(KEY.skl, encodeSet(state.filters.skills));
  if (state.filters.status.size) params.set(KEY.st, encodeSet(state.filters.status));
  if (state.filters.search.trim()) params.set(KEY.s, state.filters.search);
  const s = params.toString();
  return s ? `#${s}` : "";
}

export function filtersEqual(a: Filters, b: Filters): boolean {
  if (a.search !== b.search) return false;
  const setEq = (x: Set<string>, y: Set<string>): boolean => {
    if (x.size !== y.size) return false;
    for (const v of x) if (!y.has(v)) return false;
    return true;
  };
  return (
    setEq(a.sections, b.sections) &&
    setEq(a.difficulties, b.difficulties) &&
    setEq(a.domains, b.domains) &&
    setEq(a.skills, b.skills) &&
    setEq(a.status as Set<string>, b.status as Set<string>)
  );
}
