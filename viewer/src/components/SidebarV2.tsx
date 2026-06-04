import { useEffect, useMemo, useState } from "react";
import type { JSX } from "react";
import { useLocalStorageJSON } from "@/hooks";
import {
  applyFacets,
  facetCounts,
  isFacetActive,
  type FacetDef,
  type FacetState,
} from "@/lib/facets";
import { FILTERS, visibleFilters } from "@/lib/filterRegistry";
import { IDENTITY } from "@/lib/designTokens";
import { loadAspectCatalog } from "@/lib/aspects";
import type { AspectCatalogEntry, IndexEntry } from "@/types";
import {
  BooleanFilter,
  DateRangeFilter,
  DepthSelector,
  FilterSection,
  MultiFilter,
  RangeFilter,
  type SidebarDepth,
} from "./FilterControls";
import { TagFilterSection, type Tag } from "./TagSystem";
import type { FilterPreset } from "./FilterPresets";
import { asStringArray, omitKey } from "./sidebarHelpers";
import { DomainSkillTree } from "./DomainSkillTree";
import { StatusFilter } from "./StatusFilter";

/* ─────────────────────────────────── Props ────────────────────────────── */

export interface SidebarV2Props {
  index: IndexEntry[];
  state: FacetState;
  onChange: (next: FacetState) => void;
  onReset: () => void;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
  search: string;
  onSearchChange: (v: string) => void;

  // Sidebar bookmarks/done/selected — needed for the status facet which
  // can't be accessed via IndexEntry alone.
  bookmarks: Set<string>;
  done: Set<string>;
  selected: Set<string>;

  // Set switcher (kept from current sidebar).
  setId: string;
  onSetChange: (id: string) => void;
  availableSets: { id: string; label: string }[];

  // Tag filter (kept from current sidebar).
  tags?: Tag[];
  tagCounts?: Record<string, number>;
  activeTagFilter?: Set<string>;
  onToggleTagFilter?: (tagId: string) => void;

  // Presets (kept from current sidebar).
  presets?: FilterPreset[];
  onSavePreset?: (name: string) => void;
  onApplyPreset?: (state: FacetState) => void;
  onRemovePreset?: (id: string) => void;
}

/* ───────────────────────────── SidebarV2 ──────────────────────────────── */

export function SidebarV2({
  index,
  state,
  onChange,
  onReset,
  searchInputRef,
  search,
  onSearchChange,
  bookmarks,
  done,
  selected,
  setId,
  onSetChange,
  availableSets,
  tags,
  tagCounts,
  activeTagFilter,
  onToggleTagFilter,
}: SidebarV2Props): JSX.Element {
  // Stored value may include legacy "detailed" from previous releases; narrow
  // it back to "simple" so the two-mode UI stays in a valid state.
  const [storedDepth, setStoredDepth] = useLocalStorageJSON<string>(
    "sat:sidebar-depth",
    "simple",
  );
  const depth: SidebarDepth = storedDepth === "advanced" ? "advanced" : "simple";
  const setDepth = (d: SidebarDepth): void => setStoredDepth(d);

  const widthClass: Record<SidebarDepth, string> = {
    simple: "w-64",
    advanced: "w-96",
  };

  // Active facet defs for the current depth, gated by scopeWhen.
  const defs = useMemo<FacetDef[]>(() => {
    const base = visibleFilters(depth);
    return base.filter((d) => !d.scopeWhen || d.scopeWhen(state));
  }, [depth, state]);

  // Apply search separately — it's not a facet at this layer.
  const searchFiltered = useMemo<IndexEntry[]>(() => {
    const q = search.trim().toLowerCase();
    if (!q) return index;
    return index.filter(
      (e) =>
        e.id.toLowerCase().includes(q) ||
        (e.searchText ?? "").includes(q) ||
        (e.mathText ?? "").includes(q),
    );
  }, [index, search]);

  const counts = useMemo(
    () => facetCounts(defs, state, searchFiltered),
    [defs, state, searchFiltered],
  );

  // Group active defs by group label, preserving registry order.
  const groupedFilters = useMemo(() => {
    const groups: { label: string; defs: FacetDef[] }[] = [];
    const byLabel = new Map<string, FacetDef[]>();
    for (const def of defs) {
      // Skip skill — rendered together with domain in the tree.
      if (def.key === "skill") continue;
      // Skip aspect — rendered separately in the "Aspects within selected
      // skills" panel below.
      if (def.key === "aspect") continue;
      const label = def.group ?? "Other";
      if (!byLabel.has(label)) {
        byLabel.set(label, []);
        groups.push({ label, defs: byLabel.get(label)! });
      }
      byLabel.get(label)!.push(def);
    }
    return groups;
  }, [defs]);

  // For the "Aspects within selected skill" panel: always render the panel
  // when in advanced mode; only compute scoped counts when at least one
  // skill is selected (the placeholder copy handles the empty case).
  const isAdvancedMode = depth === "advanced";
  const skillSelected = asStringArray(state.skill);
  const hasSkillScope = skillSelected.length > 0;
  const shouldComputeAspects = isAdvancedMode && hasSkillScope;

  // Load the aspect catalog once (memoised at module scope). Empty array if
  // /data/aspects/catalog.json is missing — caller is responsible for hiding
  // the row when there's nothing to show.
  const [aspectCatalog, setAspectCatalog] = useState<AspectCatalogEntry[]>([]);
  useEffect(() => {
    let cancelled = false;
    loadAspectCatalog().then((entries) => {
      if (!cancelled) setAspectCatalog(entries);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Catalog entries scoped to the currently-selected skills (case-insensitive).
  const scopedCatalogEntries = useMemo<AspectCatalogEntry[]>(() => {
    if (!shouldComputeAspects || aspectCatalog.length === 0) return [];
    const selectedLower = new Set(skillSelected.map((s) => s.toLowerCase()));
    return aspectCatalog.filter((entry) =>
      selectedLower.has(entry.skill.toLowerCase()),
    );
  }, [shouldComputeAspects, aspectCatalog, skillSelected]);

  // Map from slug → label, for human-readable rendering in MultiFilter.
  const aspectLabelMap = useMemo<Map<string, string>>(() => {
    const map = new Map<string, string>();
    for (const entry of aspectCatalog) {
      map.set(entry.slug, entry.label);
    }
    return map;
  }, [aspectCatalog]);

  // Static catalog counts keyed by slug — used as fallback when no scoped
  // count has been computed yet (or for slugs the user has selected but
  // which aren't in the current scope).
  const catalogCountFallback = useMemo<Map<string, number>>(() => {
    const map = new Map<string, number>();
    for (const entry of scopedCatalogEntries) {
      map.set(entry.slug, entry.count);
    }
    return map;
  }, [scopedCatalogEntries]);

  const scopedScope = useMemo<IndexEntry[]>(() => {
    if (!shouldComputeAspects) return [];
    // Apply section/difficulty/domain/skill from current state to the
    // already-search-filtered universe.
    const scopeKeys = new Set(["section", "difficulty", "domain", "skill"]);
    const scopeDefs = defs.filter((d) => scopeKeys.has(d.key));
    return applyFacets(scopeDefs, state, searchFiltered);
  }, [shouldComputeAspects, defs, state, searchFiltered]);

  // Aspect filter rendered FIRST, then the existing type/hasStimulus/freshness
  // rows. Hide the "aspect" row entirely if the scoped catalog is empty.
  const aspectDefs = useMemo<FacetDef[]>(() => {
    if (!isAdvancedMode) return [];
    const keys: string[] = ["aspect", "type", "hasStimulus", "updateDate"];
    const lookup = new Set(keys);
    const ordered = FILTERS.filter((d) => lookup.has(d.key)).sort(
      (a, b) => keys.indexOf(a.key) - keys.indexOf(b.key),
    );
    // Hide "aspect" when the selected skill(s) have no catalog entries —
    // showing an empty multi-select would be a UX dead-end.
    if (scopedCatalogEntries.length === 0) {
      return ordered.filter((d) => d.key !== "aspect");
    }
    return ordered;
  }, [isAdvancedMode, scopedCatalogEntries]);

  const scopedAspectCounts = useMemo(
    () => (shouldComputeAspects ? facetCounts(aspectDefs, state, scopedScope) : {}),
    [shouldComputeAspects, aspectDefs, state, scopedScope],
  );

  // Per-key count map: for the aspect filter, prefer scoped counts (which
  // reflect actual entry matches) and fall back to the catalog's static
  // count when nothing has been computed for that slug yet. Limit the slug
  // universe to the scoped catalog entries so the row only lists aspects
  // belonging to the selected skill(s).
  const aspectFilterCounts = useMemo<Map<string, number>>(() => {
    const merged = new Map<string, number>();
    const scoped = scopedAspectCounts.aspect ?? new Map<string, number>();
    for (const entry of scopedCatalogEntries) {
      const scopedCount = scoped.get(entry.slug);
      merged.set(
        entry.slug,
        scopedCount ?? catalogCountFallback.get(entry.slug) ?? 0,
      );
    }
    return merged;
  }, [scopedAspectCounts, scopedCatalogEntries, catalogCountFallback]);

  // Determine if any filter (including search) is active for Reset button.
  const hasFilters =
    search.trim().length > 0 ||
    FILTERS.some((d) => isFacetActive(d, state[d.key]));

  // Render a control for a given facet def.
  const renderControl = (def: FacetDef, countMap: Map<string, number>): JSX.Element => {
    const value = state[def.key];

    if (def.key === "status") {
      return (
        <StatusFilter
          counts={{
            bookmarked: bookmarks.size,
            done: done.size,
            selected: selected.size,
          }}
          value={asStringArray(value)}
          onChange={(v) =>
            onChange(v.length > 0 ? { ...state, status: v } : omitKey(state, "status"))
          }
        />
      );
    }

    if (def.key === "aspect") {
      return (
        <MultiFilter
          def={def}
          value={asStringArray(value)}
          counts={countMap}
          labelFor={(slug) => aspectLabelMap.get(slug) ?? slug}
          onChange={(v) =>
            onChange(
              v.length > 0
                ? { ...state, aspect: v }
                : omitKey(state, "aspect"),
            )
          }
        />
      );
    }

    switch (def.control) {
      case "multi":
        return (
          <MultiFilter
            def={def}
            value={asStringArray(value)}
            counts={countMap}
            onChange={(v) =>
              onChange(
                v.length > 0
                  ? { ...state, [def.key]: v }
                  : omitKey(state, def.key),
              )
            }
          />
        );
      case "range":
        return (
          <RangeFilter
            def={def}
            value={value as [number, number] | undefined}
            onChange={(v) =>
              onChange(
                v === undefined
                  ? omitKey(state, def.key)
                  : { ...state, [def.key]: v },
              )
            }
          />
        );
      case "boolean":
        return (
          <BooleanFilter
            def={def}
            value={value as boolean | undefined}
            onChange={(v) =>
              onChange(
                v === undefined
                  ? omitKey(state, def.key)
                  : { ...state, [def.key]: v },
              )
            }
          />
        );
      case "daterange":
        return (
          <DateRangeFilter
            def={def}
            value={value as [number, number] | undefined}
            onChange={(v) =>
              onChange(
                v === undefined
                  ? omitKey(state, def.key)
                  : { ...state, [def.key]: v },
              )
            }
          />
        );
      case "tree": {
        // The skill tree is rendered separately together with domain — but
        // if a registry entry slips through with control: "tree" outside
        // the (domain, skill) pair, fall back to MultiFilter.
        return (
          <MultiFilter
            def={def}
            value={asStringArray(value)}
            counts={countMap}
            onChange={(v) =>
              onChange(
                v.length > 0
                  ? { ...state, [def.key]: v }
                  : omitKey(state, def.key),
              )
            }
          />
        );
      }
      default:
        return <></>;
    }
  };

  // Render the Topic group with a special domain → skill tree.
  const renderTopicGroup = (groupDefs: FacetDef[]): JSX.Element => {
    const domainDef = groupDefs.find((d) => d.key === "domain");
    const skillDef = FILTERS.find((d) => d.key === "skill");
    if (!domainDef || !skillDef) return <></>;

    // For tree: compute scopes the same way `facetCounts` does.
    // domain counts are already in `counts.domain`; skill counts in `counts.skill`.
    // But skill is not in `defs` for the regular flow — compute it directly here.
    const treeDefs = [...defs.filter((d) => d.key !== "skill"), skillDef];
    const treeCounts = facetCounts(treeDefs, state, searchFiltered);
    const domainCounts = treeCounts.domain ?? new Map<string, number>();
    const skillCounts = treeCounts.skill ?? new Map<string, number>();

    // Tree scope: all filters EXCEPT domain and skill applied, so we see
    // the full landscape of (domain → skills) available given other facets.
    const treeScopeDefs = defs.filter((d) => d.key !== "domain" && d.key !== "skill");
    const treeScope = applyFacets(treeScopeDefs, state, searchFiltered);

    // Render other non-domain defs in the Topic group too (rare, but safe).
    const otherDefs = groupDefs.filter((d) => d.key !== "domain");

    return (
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-1.5 px-3">
          <span className={"w-1.5 h-1.5 rounded-full " + IDENTITY.topic.dot} aria-hidden />
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-500">
            Domain & Skill
          </span>
        </div>
        <DomainSkillTree
          domainDef={domainDef}
          skillDef={skillDef}
          state={state}
          domainCounts={domainCounts}
          skillCounts={skillCounts}
          treeScope={treeScope}
          onChange={onChange}
        />
        <p className="text-[11px] text-ink-400 px-3 mt-1.5 leading-snug">
          Expand a domain to filter by skill.
        </p>
        {otherDefs.map((def) => (
          <div key={def.key} className="mt-3">
            {renderControl(def, counts[def.key] ?? new Map())}
          </div>
        ))}
      </div>
    );
  };

  return (
    <aside
      aria-label="Filters"
      className={
        widthClass[depth] +
        " min-[900px]:" + widthClass[depth] +
        " max-[899px]:w-full shrink-0 border-r border-ink-150 bg-ink-50 overflow-y-auto thin-scrollbar transition-[width] duration-200 ease-out"
      }
    >
      <div className="px-4 py-5">
        {availableSets.length > 1 && (
          <div className="mb-5">
            <div
              className="flex items-center gap-2 mb-1.5 px-1"
              title="Switch between the full question bank and your saved sets"
            >
              <span className={"w-1.5 h-1.5 rounded-full " + IDENTITY.content.dot} aria-hidden />
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-500">
                Question Set
              </span>
            </div>
            <div
              className="inline-flex rounded-lg bg-ink-100 p-0.5 w-full"
              role="radiogroup"
              aria-label="Question set"
              data-testid="set-toggle"
            >
              {availableSets.map((s) => {
                const active = s.id === setId;
                return (
                  <button
                    key={s.id || "orig"}
                    type="button"
                    onClick={() => onSetChange(s.id)}
                    role="radio"
                    aria-checked={active}
                    className={
                      "flex-1 px-2 py-1 text-[12px] rounded-md transition-colors focus-ring " +
                      (active
                        ? "bg-white text-ink-800 font-medium shadow-card"
                        : "text-ink-600 hover:text-ink-800")
                    }
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mb-3 px-1">
          <span className="flex items-center gap-2">
            <span className={"w-1.5 h-1.5 rounded-full " + IDENTITY.accent.dot} aria-hidden />
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-500">
              Filters
            </span>
          </span>
          <button
            type="button"
            onClick={onReset}
            disabled={!hasFilters}
            className="text-[11.5px] text-ink-500 hover:text-ink-800 disabled:opacity-55 disabled:cursor-not-allowed transition px-1.5 py-0.5 rounded focus-ring"
          >
            Reset
          </button>
        </div>

        <DepthSelector value={depth} onChange={setDepth} />

        <div className="relative mb-6">
          <svg
            viewBox="0 0 24 24"
            className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.5" y2="16.5" />
          </svg>
          <input
            ref={searchInputRef}
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search #number, skill, or text…"
            className="w-full pl-8 pr-3 py-2 rounded-lg text-[13px] bg-white border border-ink-200 placeholder:text-ink-450 focus:outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100 transition"
          />
        </div>

        {groupedFilters.map((group) => {
          // Topic gets the specialised tree rendering.
          if (group.label === "Topic") {
            return <div key={group.label}>{renderTopicGroup(group.defs)}</div>;
          }
          return (
            <div key={group.label}>
              {group.defs.map((def) => (
                <FilterSection key={def.key} def={def}>
                  {renderControl(def, counts[def.key] ?? new Map())}
                </FilterSection>
              ))}
            </div>
          );
        })}

        {isAdvancedMode && (
          <div className="mb-5 pl-3 border-l-2 border-l-accent-500">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={"w-1.5 h-1.5 rounded-full " + IDENTITY.accent.dot} aria-hidden />
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-500">
                Aspects within selected skills
              </span>
            </div>
            {hasSkillScope ? (
              <>
                <p className="text-[11px] text-ink-400 mb-2 px-3 leading-snug">
                  Narrowing within {skillSelected.length} skill
                  {skillSelected.length === 1 ? "" : "s"}:{" "}
                  {skillSelected.slice(0, 3).join(", ")}
                  {skillSelected.length > 3
                    ? `, +${skillSelected.length - 3} more`
                    : ""}
                </p>
                {aspectDefs.map((def) => {
                  const countMap =
                    def.key === "aspect"
                      ? aspectFilterCounts
                      : scopedAspectCounts[def.key] ?? new Map<string, number>();
                  return (
                    <FilterSection key={"scoped-" + def.key} def={def}>
                      {renderControl(def, countMap)}
                    </FilterSection>
                  );
                })}
              </>
            ) : (
              <div className="px-3 py-2 text-[11.5px] text-ink-400 italic leading-snug">
                Select one or more skills above to reveal sub-types and aspect
                filters scoped to those skills.
              </div>
            )}
          </div>
        )}

        {tags && tags.length > 0 && onToggleTagFilter && (
          <TagFilterSection
            tags={tags}
            activeTags={activeTagFilter ?? new Set()}
            counts={tagCounts ?? {}}
            onToggle={onToggleTagFilter}
          />
        )}
      </div>
    </aside>
  );
}
