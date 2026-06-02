/**
 * SidebarShared
 * =============
 * Shared primitives used by the Sidebar and its extracted sub-components.
 *
 * Contents:
 *   - `ciHas`, `toggle`, `toggleStatus` — case-insensitive Set helpers used to
 *     keep the canonical-cased label while comparing loosely
 *   - `matchesSearch`, `countBy`, `buildDomainTree` — pure index-query helpers
 *     used to derive facet counts and the Domain → Skill tree
 *   - `<Section>` — the visual section wrapper (uppercase label + optional
 *     hint) used for every facet block in the sidebar
 *   - `<CheckRow>` — the styled checkbox row (label + count + toggle)
 *   - `<Chevron>` — small triangle icon used by the domain tree
 *
 * These pieces are intentionally headless of any Sidebar-specific state so
 * each sub-component (`SidebarSearchBox`, `SidebarStatusFilter`,
 * `SidebarDomainTree`, etc.) can import them directly.
 */
import type { ReactNode } from "react";
import type { Filters, IndexEntry, StatusFilter } from "@/types";

// ─── Case-insensitive Set helpers ──────────────────────────────────────────

/** Case-insensitive membership. */
export function ciHas(set: Set<string>, value: string): boolean {
  if (set.has(value)) return true;
  const low = value.toLowerCase();
  for (const v of set) if (v.toLowerCase() === low) return true;
  return false;
}

/** Toggle (case-insensitive compare; store the canonical incoming value). */
export function toggle(set: Set<string>, value: string): Set<string> {
  const next = new Set(set);
  const low = value.toLowerCase();
  let removed = false;
  for (const v of next) {
    if (v.toLowerCase() === low) {
      next.delete(v);
      removed = true;
      break;
    }
  }
  if (!removed) next.add(value);
  return next;
}

/** Status filter toggle (typed). */
export function toggleStatus(set: Set<StatusFilter>, value: StatusFilter): Set<StatusFilter> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

// ─── Search + counting helpers ─────────────────────────────────────────────

export function matchesSearch(e: IndexEntry, search: string): boolean {
  if (!search) return true;
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

export function countBy(entries: IndexEntry[], key: keyof IndexEntry): { [k: string]: number } {
  const out: { [k: string]: number } = {};
  for (const e of entries) {
    const v = (e[key] as string) || "(unknown)";
    out[v] = (out[v] ?? 0) + 1;
  }
  return out;
}

// ─── Domain tree builder ───────────────────────────────────────────────────

export interface DomainTreeNode {
  domain: string;
  count: number;
  skills: { name: string; count: number }[];
}

/** Builds a Domain → ordered Skills tree using two pre-scoped lists:
 *   - domainCountScope: respects all filters EXCEPT domain — used for domain counts
 *   - skillCountScope:  respects all filters EXCEPT skill — used for skill counts
 *
 *  Domain rows shown: union of domains that appear in either scope, intersected
 *  with the universe constrained by section+difficulty (so unrelated domains
 *  don't appear for the wrong section). We pass `index` + the canonical
 *  `section+difficulty+search` predicates separately to derive this.
 */
export function buildDomainTree(
  index: IndexEntry[],
  search: string,
  filters: Filters,
  domainCountScope: IndexEntry[],
  skillCountScope: IndexEntry[],
): DomainTreeNode[] {
  const sectionDifficultyScope = index.filter(
    (e) =>
      matchesSearch(e, search) &&
      (filters.sections.size === 0 || ciHas(filters.sections, e.section)) &&
      (filters.difficulties.size === 0 || ciHas(filters.difficulties, e.difficulty)),
  );

  // All domains that exist in current section+difficulty scope (canonical case = most common)
  const domainVariants = new Map<string, Map<string, number>>();
  for (const e of sectionDifficultyScope) {
    const d = e.domain || "(unknown)";
    const k = d.toLowerCase();
    if (!domainVariants.has(k)) domainVariants.set(k, new Map());
    const m = domainVariants.get(k)!;
    m.set(d, (m.get(d) ?? 0) + 1);
  }
  const canonicalDomain = new Map<string, string>(); // lower → display
  for (const [low, variants] of domainVariants) {
    canonicalDomain.set(
      low,
      [...variants.entries()].sort((a, b) => b[1] - a[1])[0][0],
    );
  }

  // Domain counts: from domainCountScope (drops domain filter, keeps skill)
  const domainCount = new Map<string, number>();
  for (const e of domainCountScope) {
    const k = (e.domain || "(unknown)").toLowerCase();
    domainCount.set(k, (domainCount.get(k) ?? 0) + 1);
  }

  // Skill counts grouped by (domain, skill) from skillCountScope (drops skill filter, keeps domain)
  const skillByDomain = new Map<string, Map<string, { count: number; variants: Map<string, number> }>>();
  for (const e of skillCountScope) {
    const dk = (e.domain || "(unknown)").toLowerCase();
    const sk = (e.skill || "(unknown)").toLowerCase();
    if (!skillByDomain.has(dk)) skillByDomain.set(dk, new Map());
    const skMap = skillByDomain.get(dk)!;
    if (!skMap.has(sk)) skMap.set(sk, { count: 0, variants: new Map() });
    const entry = skMap.get(sk)!;
    entry.count += 1;
    const display = e.skill || "(unknown)";
    entry.variants.set(display, (entry.variants.get(display) ?? 0) + 1);
  }

  return [...canonicalDomain.entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([lowDomain, displayDomain]) => {
      const skMap = skillByDomain.get(lowDomain) ?? new Map();
      return {
        domain: displayDomain,
        count: domainCount.get(lowDomain) ?? 0,
        skills: [...skMap.values()]
          .map((s) => ({
            name: [...s.variants.entries()].sort((a, b) => b[1] - a[1])[0][0],
            count: s.count,
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      };
    });
}

// ─── Visual primitives ─────────────────────────────────────────────────────

interface SectionProps {
  label: string;
  hint?: string;
  children: ReactNode;
}

/** Standard sidebar facet section: uppercase label, vertical list of children,
 *  optional explanatory hint underneath. */
export function Section({ label, hint, children }: SectionProps) {
  return (
    <div className="mb-5">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-500 mb-1.5 px-3">
        {label}
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
      {hint && (
        <p className="text-[11px] text-ink-400 px-3 mt-1.5 leading-snug">{hint}</p>
      )}
    </div>
  );
}

export interface CheckRowProps {
  label: string;
  count?: number;
  checked: boolean;
  onChange: () => void;
  size?: "md" | "sm";
  disabled?: boolean;
}

/** Styled checkbox row used by every facet (Section, Difficulty, Skill, …). */
export function CheckRow({
  label,
  count,
  checked,
  onChange,
  size = "md",
  disabled = false,
}: CheckRowProps) {
  const txt = size === "sm" ? "text-[12px]" : "text-[13px]";
  const isZero = count === 0 && !checked;
  return (
    <label
      className={
        "group flex items-center gap-2.5 px-2.5 py-1 rounded-md transition-colors select-none " +
        (disabled || isZero
          ? "cursor-default opacity-55"
          : "cursor-pointer hover:bg-ink-200/60")
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
        onChange={onChange}
        disabled={disabled || isZero}
        className="sr-only"
        aria-label={label}
      />
      <span
        className={
          "flex-1 truncate " +
          txt +
          " " +
          (checked ? "text-ink-800" : "text-ink-700")
        }
      >
        {label}
      </span>
      {typeof count === "number" && (
        <span
          className={
            "tabular-nums text-[12px] " +
            (isZero ? "text-ink-300" : "text-ink-400 group-hover:text-ink-600")
          }
        >
          {count.toLocaleString()}
        </span>
      )}
    </label>
  );
}

/** Right-pointing chevron used to indicate domain-row expansion state. */
export function Chevron({ expanded }: { expanded: boolean }) {
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
