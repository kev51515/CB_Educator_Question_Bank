import { useState } from "react";
import type { JSX } from "react";
import type { FacetDef, FacetState } from "@/lib/facets";
import type { IndexEntry } from "@/types";
import { asStringArray, ciHas, omitKey } from "./sidebarHelpers";

/* ───────────────────────────── Chevron ────────────────────────────────── */

function Chevron({ expanded }: { expanded: boolean }): JSX.Element {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden
      className={
        "w-2.5 h-2.5 text-ink-400 transition-transform " +
        (expanded ? "rotate-90" : "")
      }
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="4,2 9,6 4,10" />
    </svg>
  );
}

/* ───────────────────────── DomainSkillTree ────────────────────────────── */

interface DomainSkillTreeProps {
  domainDef: FacetDef;
  skillDef: FacetDef;
  state: FacetState;
  domainCounts: Map<string, number>;
  skillCounts: Map<string, number>;
  /** All entries scoped by every facet EXCEPT skill — used to discover
   *  which (domain → skills) rows to render. */
  treeScope: IndexEntry[];
  onChange: (next: FacetState) => void;
}

export function DomainSkillTree({
  state,
  domainCounts,
  skillCounts,
  treeScope,
  onChange,
}: DomainSkillTreeProps): JSX.Element {
  const domainSelected = asStringArray(state.domain);
  const skillSelected = asStringArray(state.skill);

  // Build the (domain → skills) tree from treeScope, picking canonical
  // display casing as the most common variant.
  type SkillBucket = { count: number; variants: Map<string, number> };
  type DomainBucket = {
    display: string;
    skills: Map<string, SkillBucket>; // key: lower(skill)
  };
  const domains = new Map<string, DomainBucket>(); // key: lower(domain)

  for (const e of treeScope) {
    const dRaw = e.domain || "(unknown)";
    const sRaw = e.skill || "(unknown)";
    const dKey = dRaw.toLowerCase();
    const sKey = sRaw.toLowerCase();

    let dBucket = domains.get(dKey);
    if (!dBucket) {
      dBucket = { display: dRaw, skills: new Map() };
      domains.set(dKey, dBucket);
    }
    // Track canonical display by frequency (overwrite if more common).
    // (Cheap heuristic: keep first; finalise below by counting variants.)

    let sBucket = dBucket.skills.get(sKey);
    if (!sBucket) {
      sBucket = { count: 0, variants: new Map() };
      dBucket.skills.set(sKey, sBucket);
    }
    sBucket.count += 1;
    sBucket.variants.set(sRaw, (sBucket.variants.get(sRaw) ?? 0) + 1);
  }

  // Determine canonical display per domain by collecting variants seen.
  const domainVariants = new Map<string, Map<string, number>>(); // lower → display → count
  for (const e of treeScope) {
    const d = e.domain || "(unknown)";
    const k = d.toLowerCase();
    if (!domainVariants.has(k)) domainVariants.set(k, new Map());
    const m = domainVariants.get(k)!;
    m.set(d, (m.get(d) ?? 0) + 1);
  }
  for (const [low, variants] of domainVariants) {
    const display = [...variants.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const bucket = domains.get(low);
    if (bucket) bucket.display = display;
  }

  const tree = [...domains.entries()]
    .sort((a, b) => a[1].display.localeCompare(b[1].display))
    .map(([lowDomain, bucket]) => ({
      lowDomain,
      domain: bucket.display,
      count: domainCounts.get(bucket.display) ?? domainCounts.get(lowDomain) ?? 0,
      skills: [...bucket.skills.values()]
        .map((s) => {
          const name = [...s.variants.entries()].sort((a, b) => b[1] - a[1])[0][0];
          return {
            name,
            count: skillCounts.get(name) ?? skillCounts.get(name.toLowerCase()) ?? 0,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));

  // Manual expansion state (per domain).
  const [manualExpanded, setManualExpanded] = useState<Set<string>>(new Set());
  const isExpanded = (domain: string): boolean => {
    if (manualExpanded.has(domain.toLowerCase())) return true;
    if (ciHas(domainSelected, domain)) return true;
    const node = tree.find((d) => d.lowDomain === domain.toLowerCase());
    if (!node) return false;
    return node.skills.some((s) => ciHas(skillSelected, s.name));
  };
  const toggleManual = (domain: string): void => {
    const low = domain.toLowerCase();
    setManualExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(low)) next.delete(low);
      else next.add(low);
      return next;
    });
  };

  const toggleDomain = (domain: string): void => {
    const has = ciHas(domainSelected, domain);
    const next = has
      ? domainSelected.filter((v) => v.toLowerCase() !== domain.toLowerCase())
      : [...domainSelected, domain];
    onChange(
      next.length > 0
        ? { ...state, domain: next }
        : omitKey(state, "domain"),
    );
  };

  const toggleSkill = (skill: string): void => {
    const has = ciHas(skillSelected, skill);
    const next = has
      ? skillSelected.filter((v) => v.toLowerCase() !== skill.toLowerCase())
      : [...skillSelected, skill];
    onChange(
      next.length > 0
        ? { ...state, skill: next }
        : omitKey(state, "skill"),
    );
  };

  return (
    <div className="flex flex-col gap-0.5">
      {tree.map((d) => {
        const checked = ciHas(domainSelected, d.domain);
        const isZero = d.count === 0 && !checked;
        const expanded = isExpanded(d.domain);
        return (
          <div key={d.lowDomain}>
            <div
              className={
                "group flex items-center gap-1.5 pr-2.5 rounded-md transition-colors " +
                (isZero ? "opacity-55" : "hover:bg-ink-200/60")
              }
            >
              <button
                type="button"
                onClick={() => toggleManual(d.domain)}
                className="flex items-center justify-center w-5 h-7 -mr-1 text-ink-400 hover:text-ink-700 focus-ring rounded"
                aria-label={expanded ? `Collapse ${d.domain}` : `Expand ${d.domain}`}
                aria-expanded={expanded}
              >
                <Chevron expanded={expanded} />
              </button>
              <label
                className={
                  "flex items-center gap-2.5 flex-1 py-1 select-none " +
                  (isZero ? "cursor-default" : "cursor-pointer")
                }
              >
                <span
                  className={
                    "relative inline-flex items-center justify-center w-[16px] h-[16px] rounded-[4px] border transition-colors " +
                    (checked
                      ? "bg-accent-600 border-accent-600"
                      : isZero
                        ? "bg-white border-ink-200"
                        : "bg-white border-ink-300 group-hover:border-ink-400")
                  }
                  aria-hidden
                >
                  {checked && (
                    <svg
                      viewBox="0 0 16 16"
                      className="w-3 h-3 text-white"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="3.5,8.5 6.5,11.5 12.5,5" />
                    </svg>
                  )}
                </span>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleDomain(d.domain)}
                  disabled={isZero}
                  className="sr-only"
                  aria-label={d.domain}
                />
                <span
                  className={
                    "flex-1 truncate text-[13.5px] " +
                    (checked ? "text-ink-800 font-medium" : "text-ink-700")
                  }
                >
                  {d.domain}
                </span>
                <span
                  className={
                    "tabular-nums text-[12px] " +
                    (isZero ? "text-ink-300" : "text-ink-400")
                  }
                >
                  {d.count.toLocaleString()}
                </span>
              </label>
            </div>
            <div
              className={
                "grid transition-[grid-template-rows] duration-200 ease-out " +
                (expanded && d.skills.length > 0
                  ? "grid-rows-[1fr]"
                  : "grid-rows-[0fr]")
              }
            >
              <div className="overflow-hidden">
                <div className="ml-[26px] pl-2 border-l border-ink-200 mt-0.5 mb-1.5 flex flex-col gap-0.5">
                  {d.skills.map((s) => {
                    const sChecked = ciHas(skillSelected, s.name);
                    const sIsZero = s.count === 0 && !sChecked;
                    return (
                      <label
                        key={s.name}
                        className={
                          "group flex items-center gap-2.5 px-2.5 py-1 rounded-md transition-colors select-none " +
                          (sIsZero
                            ? "cursor-default opacity-55"
                            : "cursor-pointer hover:bg-ink-200/60")
                        }
                      >
                        <span
                          className={
                            "relative inline-flex items-center justify-center w-[16px] h-[16px] rounded-[4px] border transition-colors " +
                            (sChecked
                              ? "bg-accent-600 border-accent-600"
                              : sIsZero
                                ? "bg-white border-ink-200"
                                : "bg-white border-ink-300 group-hover:border-ink-400")
                          }
                          aria-hidden
                        >
                          {sChecked && (
                            <svg
                              viewBox="0 0 16 16"
                              className="w-3 h-3 text-white"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="3.5,8.5 6.5,11.5 12.5,5" />
                            </svg>
                          )}
                        </span>
                        <input
                          type="checkbox"
                          checked={sChecked}
                          onChange={() => toggleSkill(s.name)}
                          disabled={sIsZero}
                          className="sr-only"
                          aria-label={s.name}
                        />
                        <span
                          className={
                            "flex-1 truncate text-[12px] " +
                            (sChecked ? "text-ink-800" : "text-ink-700")
                          }
                        >
                          {s.name}
                        </span>
                        <span
                          className={
                            "tabular-nums text-[12px] " +
                            (sIsZero
                              ? "text-ink-300"
                              : "text-ink-400 group-hover:text-ink-600")
                          }
                        >
                          {s.count.toLocaleString()}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })}
      {tree.length === 0 && (
        <p className="text-[12.5px] text-ink-400 px-3 py-1">
          No domains match the current filters.
        </p>
      )}
    </div>
  );
}
