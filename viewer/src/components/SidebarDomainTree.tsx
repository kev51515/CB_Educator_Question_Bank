/**
 * SidebarDomainTree
 * =================
 * Renders the collapsible "Domain & Skill" facet section.
 *
 * Each domain row contains:
 *   - an expand/collapse chevron
 *   - a checkbox for the domain itself (toggles `filters.domains`)
 *   - the domain's facet count
 *   - on expansion, a nested list of skill checkboxes (toggles `filters.skills`)
 *
 * The tree itself is pre-computed by `buildDomainTree` (see `SidebarShared`)
 * and passed in via the `tree` prop — this component is purely presentational.
 *
 * Expansion is hybrid:
 *   - Manual expansion is owned here (a local Set of lowercased domain names)
 *   - A domain is also "auto-expanded" when its own checkbox is checked, or
 *     when any of its skills are checked. This guarantees the active filter is
 *     always visible, matching the behavior of the pre-refactor Sidebar.
 */
import { useState } from "react";
import type { Filters } from "@/types";
import {
  Chevron,
  CheckRow,
  ciHas,
  Section,
  type DomainTreeNode,
} from "@/components/SidebarShared";

interface SidebarDomainTreeProps {
  tree: DomainTreeNode[];
  filters: Filters;
  onToggleDomain: (domain: string) => void;
  onToggleSkill: (skill: string) => void;
}

export function SidebarDomainTree({
  tree,
  filters,
  onToggleDomain,
  onToggleSkill,
}: SidebarDomainTreeProps) {
  const [manualExpanded, setManualExpanded] = useState<Set<string>>(new Set());

  const isExpanded = (domain: string): boolean => {
    if (manualExpanded.has(domain.toLowerCase())) return true;
    if (ciHas(filters.domains, domain)) return true;
    const node = tree.find((d) => d.domain.toLowerCase() === domain.toLowerCase());
    if (!node) return false;
    return node.skills.some((s) => ciHas(filters.skills, s.name));
  };

  const toggleManual = (domain: string) => {
    const low = domain.toLowerCase();
    setManualExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(low)) next.delete(low);
      else next.add(low);
      return next;
    });
  };

  return (
    <Section label="Domain & Skill" hint="Expand a domain to filter by skill.">
      <div className="flex flex-col gap-0.5">
        {tree.map((d) => (
          <DomainGroup
            key={d.domain}
            domain={d.domain}
            domainCount={d.count}
            skills={d.skills}
            filters={filters}
            expanded={isExpanded(d.domain)}
            onToggleExpanded={() => toggleManual(d.domain)}
            onToggleDomain={() => onToggleDomain(d.domain)}
            onToggleSkill={onToggleSkill}
          />
        ))}
        {tree.length === 0 && (
          <p className="text-[12.5px] text-ink-400 px-3 py-1">
            No domains match the current filters.
          </p>
        )}
      </div>
    </Section>
  );
}

interface DomainGroupProps {
  domain: string;
  domainCount: number;
  skills: { name: string; count: number }[];
  filters: Filters;
  expanded: boolean;
  onToggleExpanded: () => void;
  onToggleDomain: () => void;
  onToggleSkill: (skill: string) => void;
}

function DomainGroup({
  domain,
  domainCount,
  skills,
  filters,
  expanded,
  onToggleExpanded,
  onToggleDomain,
  onToggleSkill,
}: DomainGroupProps) {
  const checked = ciHas(filters.domains, domain);
  const isZero = domainCount === 0 && !checked;
  return (
    <div>
      <div
        className={
          "group flex items-center gap-1.5 pr-2.5 rounded-md transition-colors " +
          (isZero ? "opacity-55" : "hover:bg-ink-200/60")
        }
      >
        <button
          type="button"
          onClick={onToggleExpanded}
          className="flex items-center justify-center w-5 h-7 -mr-1 text-ink-400 hover:text-ink-700 focus-ring rounded"
          aria-label={expanded ? `Collapse ${domain}` : `Expand ${domain}`}
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
              <svg viewBox="0 0 16 16" className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3.5,8.5 6.5,11.5 12.5,5" />
              </svg>
            )}
          </span>
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggleDomain}
            disabled={isZero}
            className="sr-only"
            aria-label={domain}
          />
          <span
            className={
              "flex-1 truncate text-[13.5px] " +
              (checked ? "text-ink-800 font-medium" : "text-ink-700")
            }
          >
            {domain}
          </span>
          <span
            className={
              "tabular-nums text-[12px] " +
              (isZero ? "text-ink-300" : "text-ink-400")
            }
          >
            {domainCount.toLocaleString()}
          </span>
        </label>
      </div>
      <div
        className={
          "grid transition-[grid-template-rows] duration-200 ease-out " +
          (expanded && skills.length > 0 ? "grid-rows-[1fr]" : "grid-rows-[0fr]")
        }
      >
        <div className="overflow-hidden">
          <div className="ml-[26px] pl-2 border-l border-ink-200 mt-0.5 mb-1.5 flex flex-col gap-0.5">
            {skills.map((s) => (
              <CheckRow
                key={s.name}
                label={s.name}
                count={s.count}
                checked={ciHas(filters.skills, s.name)}
                onChange={() => onToggleSkill(s.name)}
                size="sm"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
