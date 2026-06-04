import { useState } from "react";
import type { FacetDef } from "@/lib/facets";
import { IDENTITY, groupIdentity } from "@/lib/designTokens";

/* ─────────────────────────────────────────── MultiFilter ───────────── */

interface MultiFilterProps {
  def: FacetDef;
  value: string[];
  counts: Map<string, number>;
  onChange: (next: string[]) => void;
  size?: "md" | "sm";
  /** Optional renderer: map raw key (e.g. slug) to human-readable label. */
  labelFor?: (key: string) => string;
}

export function MultiFilter({
  def,
  value,
  counts,
  onChange,
  size = "md",
  labelFor,
}: MultiFilterProps) {
  // Use canonical ordering if provided; otherwise sort by count desc.
  const allKeys = new Set<string>(value);
  for (const k of counts.keys()) allKeys.add(k);
  const ordering = (def.ordering as string[] | undefined) ?? null;
  const keys = ordering
    ? ordering.filter((k) => allKeys.has(k))
    : [...allKeys].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
  const checked = new Set(value);
  return (
    <div className="flex flex-col gap-0.5">
      {keys.map((k) => {
        const c = counts.get(k) ?? 0;
        const isZero = c === 0 && !checked.has(k);
        const isChecked = checked.has(k);
        const txt = size === "sm" ? "text-[12px]" : "text-[13px]";
        return (
          <label
            key={k}
            className={
              "group flex items-center gap-2.5 px-2.5 py-1 rounded-md transition-colors select-none " +
              (isZero ? "cursor-default opacity-55" : "cursor-pointer hover:bg-ink-200/60")
            }
          >
            <span
              className={
                "relative inline-flex items-center justify-center w-[16px] h-[16px] rounded-[4px] border transition-colors " +
                (isChecked
                  ? "bg-accent-600 border-accent-600"
                  : isZero
                    ? "bg-white border-ink-200"
                    : "bg-white border-ink-300 group-hover:border-ink-400")
              }
              aria-hidden
            >
              {isChecked && (
                <svg viewBox="0 0 16 16" className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3.5,8.5 6.5,11.5 12.5,5" />
                </svg>
              )}
            </span>
            <input
              type="checkbox"
              checked={isChecked}
              onChange={() => {
                if (isChecked) onChange(value.filter((v) => v !== k));
                else onChange([...value, k]);
              }}
              disabled={isZero}
              className="sr-only"
              aria-label={labelFor ? labelFor(k) : k}
            />
            <span className={"flex-1 truncate " + txt + " " + (isChecked ? "text-ink-800" : "text-ink-700")}>
              {labelFor ? labelFor(k) : k}
            </span>
            <span className={"tabular-nums text-[12px] " + (isZero ? "text-ink-300" : "text-ink-400 group-hover:text-ink-600")}>
              {c.toLocaleString()}
            </span>
          </label>
        );
      })}
      {keys.length === 0 && (
        <p className="text-[11.5px] text-ink-400 px-2.5 py-1">No options match the current filters.</p>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────── RangeFilter ───────────── */

interface RangeFilterProps {
  def: FacetDef;
  value: [number, number] | undefined;
  onChange: (next: [number, number] | undefined) => void;
}

export function RangeFilter({ def, value, onChange }: RangeFilterProps) {
  const min = def.range?.min ?? 0;
  const max = def.range?.max ?? 100;
  const step = def.range?.step ?? 1;
  const [lo, hi] = value ?? [min, max];
  const isDefault = lo === min && hi === max;
  return (
    <div className="px-2.5 py-1">
      <div className="flex items-center justify-between mb-1.5 text-[11px] text-ink-500">
        <span className="tabular-nums">{lo}</span>
        <button
          type="button"
          onClick={() => onChange(undefined)}
          disabled={isDefault}
          className="text-[10.5px] text-accent-600 hover:text-accent-700 disabled:opacity-40 focus-ring rounded"
        >
          {isDefault ? "any" : "reset"}
        </button>
        <span className="tabular-nums">{hi}</span>
      </div>
      <div className="flex gap-2 items-center">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={lo}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v <= hi) onChange([v, hi]);
          }}
          className="flex-1 accent-accent-600"
          aria-label={def.label + " minimum"}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={hi}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v >= lo) onChange([lo, v]);
          }}
          className="flex-1 accent-accent-600"
          aria-label={def.label + " maximum"}
        />
      </div>
      {def.hint && <p className="text-[10.5px] text-ink-400 mt-1.5 leading-snug">{def.hint}</p>}
    </div>
  );
}

/* ─────────────────────────────────────────── BooleanFilter ─────────── */

interface BooleanFilterProps {
  def: FacetDef;
  value: boolean | undefined;
  onChange: (next: boolean | undefined) => void;
}

export function BooleanFilter({ def, value, onChange }: BooleanFilterProps) {
  // Three-state segmented control: Any / Yes / No
  const states: { label: string; v: boolean | undefined }[] = [
    { label: "Any", v: undefined },
    { label: "Yes", v: true },
    { label: "No", v: false },
  ];
  return (
    <div className="px-2.5 py-1">
      <div className="inline-flex rounded-md bg-ink-100 p-0.5 w-full">
        {states.map((s) => {
          const active = (value ?? undefined) === s.v;
          return (
            <button
              key={s.label}
              type="button"
              onClick={() => onChange(s.v)}
              aria-pressed={active}
              className={
                "flex-1 px-2 py-1 text-[11.5px] rounded transition-colors focus-ring " +
                (active ? "bg-white text-ink-800 font-medium shadow-sm" : "text-ink-600 hover:text-ink-800")
              }
            >
              {s.label}
            </button>
          );
        })}
      </div>
      {def.hint && <p className="text-[10.5px] text-ink-400 mt-1.5 leading-snug">{def.hint}</p>}
    </div>
  );
}

/* ─────────────────────────────────────────── DateRangeFilter ───────── */

interface DateRangeFilterProps {
  def: FacetDef;
  value: [number, number] | undefined;
  onChange: (next: [number, number] | undefined) => void;
}

const FRESHNESS_PRESETS: { label: string; days: number | null }[] = [
  { label: "Any time", days: null },
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last year", days: 365 },
];

export function DateRangeFilter({ def, value, onChange }: DateRangeFilterProps) {
  const now = Date.now();
  return (
    <div className="px-2.5 py-1">
      <div className="flex flex-wrap gap-1">
        {FRESHNESS_PRESETS.map((p) => {
          const active =
            p.days == null
              ? !value
              : value && value[0] === now - p.days * 86400_000;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                if (p.days == null) onChange(undefined);
                else onChange([now - p.days * 86400_000, now]);
              }}
              className={
                "px-2 py-0.5 text-[11px] rounded-md transition-colors focus-ring " +
                (active
                  ? "bg-accent-600 text-white"
                  : "bg-ink-100 text-ink-700 hover:bg-ink-200")
              }
            >
              {p.label}
            </button>
          );
        })}
      </div>
      {def.hint && <p className="text-[10.5px] text-ink-400 mt-1.5 leading-snug">{def.hint}</p>}
    </div>
  );
}

/* ─────────────────────────────────────────── FilterSection ─────────── */

/** Wraps a control with a label/header for the sidebar. */
interface FilterSectionProps {
  def: FacetDef;
  children: React.ReactNode;
}

export function FilterSection({ def, children }: FilterSectionProps) {
  const identity = IDENTITY[groupIdentity(def.group)];
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-1.5 px-3">
        <span className={"w-1.5 h-1.5 rounded-full " + identity.dot} aria-hidden />
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-500">
          {def.label}
        </span>
      </div>
      {children}
    </div>
  );
}

/* ─────────────────────────────────────────── DepthSelector ─────────── */

export type SidebarDepth = "simple" | "advanced";

interface DepthSelectorProps {
  value: SidebarDepth;
  onChange: (d: SidebarDepth) => void;
}

/** Small segmented control toggling sidebar depth modes. */
export function DepthSelector({ value, onChange }: DepthSelectorProps) {
  const opts: { v: SidebarDepth; label: string; tooltip: string }[] = [
    { v: "simple", label: "Basic", tooltip: "Section, difficulty, topic" },
    { v: "advanced", label: "Advanced", tooltip: "Full facets + aspects within skills" },
  ];
  return (
    <div className="inline-flex rounded-md bg-ink-100 p-0.5 w-full mb-3">
      {opts.map((o) => {
        const active = value === o.v;
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            data-tooltip={o.tooltip}
            aria-pressed={active}
            className={
              "flex-1 px-2 py-1 text-[11px] rounded transition-colors focus-ring " +
              (active ? "bg-white text-ink-800 font-medium shadow-sm" : "text-ink-600 hover:text-ink-800")
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// (Hide unused state lint stub — only used during dev)
void useState;
