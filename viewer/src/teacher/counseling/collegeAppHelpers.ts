/**
 * collegeAppHelpers
 * =================
 * Shared helpers + a batch catalog-fetch hook for the college-application
 * surfaces. The rich `public.colleges` catalog (admit rate, per-plan deadlines,
 * essay prompts, requirements, website) is fetched-by-id but historically never
 * surfaced — this module is what finally exposes it. Imported by BOTH the
 * counselor panel (CollegeApplicationsPanel.tsx) and the student card
 * (StudentCollegeListCard.tsx, which already imports from "../../teacher/...").
 *
 * Conventions per CLAUDE.md: `@/lib/supabase`, the `aliveRef` mounted-guard for
 * every setState-after-await, no `any`, no emojis.
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Shared row + catalog types
// ---------------------------------------------------------------------------

export type Tier = "reach" | "target" | "safety" | "likely";

export type CollegeType = "public" | "private" | "community" | "other";

/** One essay prompt from `colleges.essay_prompts` jsonb. */
export interface EssayPrompt {
  prompt: string;
  words?: number | null;
}

/** Per-plan deadlines from `colleges.deadlines` jsonb (e.g. {"ED":"2025-11-01"}). */
export type CatalogDeadlines = Record<string, string>;

/** Free-form requirements jsonb (e.g. {"rec_letters":2,"test_optional":true}). */
export type CatalogRequirements = Record<string, unknown>;

/** The subset of `public.colleges` we surface in the catalog-detail panel. */
export interface CatalogCollege {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  website: string | null;
  type: CollegeType | null;
  size: number | null;
  admit_rate: number | null;
  common_app: boolean | null;
  deadlines: CatalogDeadlines | null;
  essay_prompts: EssayPrompt[] | null;
  requirements: CatalogRequirements | null;
}

/** Minimal shape used by both consumers when reasoning about an application. */
export interface AppForBalance {
  tier: Tier | null;
}

/** Minimal shape used to fall back to a catalog deadline when an app has none. */
export interface AppDeadlineSource {
  deadline: string | null;
  plan: string | null;
  college_id: string | null;
}

// The catalog `select(...)` column list — single source of truth for the hook.
const CATALOG_COLUMNS =
  "id,name,city,state,website,type,size,admit_rate,common_app,deadlines,essay_prompts,requirements";

// ---------------------------------------------------------------------------
// deadlineUrgency — a colored countdown chip descriptor
// ---------------------------------------------------------------------------

export interface UrgencyChip {
  label: string;
  className: string;
}

const URGENCY_ROSE =
  "ring-rose-300 dark:ring-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300";
const URGENCY_AMBER =
  "ring-amber-300 dark:ring-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300";
const URGENCY_SLATE =
  "ring-slate-200 dark:ring-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300";

/**
 * deadlineUrgency — given a YYYY-MM-DD date, return a human countdown label and
 * a Tailwind className colored by urgency:
 *   past-due -> rose, <=7d -> rose, <=30d -> amber, else -> slate.
 * Returns null when there is no usable deadline.
 */
export function deadlineUrgency(date: string | null): UrgencyChip | null {
  if (!date) return null;
  const target = new Date(`${date}T12:00:00`);
  if (Number.isNaN(target.getTime())) return null;

  // Normalize "today" to local noon so the diff is whole-day stable.
  const now = new Date();
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    12,
    0,
    0,
  );
  const msPerDay = 24 * 60 * 60 * 1000;
  const days = Math.round((target.getTime() - today.getTime()) / msPerDay);

  if (days < 0) {
    const ago = Math.abs(days);
    return {
      label: ago === 1 ? "Past due (1 day)" : `Past due (${ago} days)`,
      className: URGENCY_ROSE,
    };
  }
  if (days === 0) return { label: "Due today", className: URGENCY_ROSE };
  if (days === 1) return { label: "Due tomorrow", className: URGENCY_ROSE };

  const label = `Due in ${days} days`;
  if (days <= 7) return { label, className: URGENCY_ROSE };
  if (days <= 30) return { label, className: URGENCY_AMBER };
  return { label, className: URGENCY_SLATE };
}

/**
 * effectiveDeadline — the app's own deadline, falling back to the catalog
 * deadline for the app's plan (or the earliest catalog deadline) when the app
 * has none. Returns a YYYY-MM-DD string or null.
 */
export function effectiveDeadline(
  app: AppDeadlineSource,
  catalog: CatalogCollege | undefined,
): string | null {
  if (app.deadline) return app.deadline;
  if (!catalog?.deadlines) return null;
  const deadlines = catalog.deadlines;
  // Prefer the matching plan, then a sensible priority order, then earliest.
  if (app.plan && deadlines[app.plan]) return deadlines[app.plan];
  const PRIORITY = ["ED", "ED2", "REA", "EA", "RD", "rolling"];
  for (const key of PRIORITY) {
    if (deadlines[key]) return deadlines[key];
  }
  const all = Object.values(deadlines).filter(Boolean);
  if (all.length === 0) return null;
  return all.sort()[0];
}

// ---------------------------------------------------------------------------
// tierBalance — counts per tier + gentle advice
// ---------------------------------------------------------------------------

export interface TierBalance {
  reach: number;
  target: number;
  safety: number;
  likely: number;
  total: number;
  advice: string | null;
}

/**
 * tierBalance — tally the applications by tier and surface a single gentle
 * piece of advice when the list looks unbalanced. The advice is intentionally
 * soft (this is guidance, not a gate).
 */
export function tierBalance(apps: AppForBalance[]): TierBalance {
  const balance: TierBalance = {
    reach: 0,
    target: 0,
    safety: 0,
    likely: 0,
    total: apps.length,
    advice: null,
  };
  for (const app of apps) {
    if (app.tier) balance[app.tier] += 1;
  }

  // "safety net" = safety OR likely; either covers the floor.
  const safetyNet = balance.safety + balance.likely;
  if (balance.total === 0) {
    balance.advice = null;
  } else if (safetyNet === 0) {
    balance.advice =
      "No safety or likely school yet — add at least one to round out the list.";
  } else if (balance.target === 0) {
    balance.advice =
      "No target schools yet — these are usually the heart of a balanced list.";
  } else if (balance.reach === 0 && balance.total >= 3) {
    balance.advice =
      "No reach school yet — consider adding one or two ambitious options.";
  } else if (balance.reach > safetyNet + balance.target) {
    balance.advice =
      "Heavy on reaches — balance with a few more targets or safeties.";
  }
  return balance;
}

// ---------------------------------------------------------------------------
// formatRequirements — humanize the requirements jsonb
// ---------------------------------------------------------------------------

/**
 * formatRequirements — turn the free-form `requirements` jsonb into a small set
 * of human-readable bullet strings. Known keys get tailored phrasing; unknown
 * keys are title-cased generically so nothing is silently dropped.
 */
export function formatRequirements(
  req: CatalogRequirements | null | undefined,
): string[] {
  if (!req || typeof req !== "object") return [];
  const out: string[] = [];

  const recLetters = req["rec_letters"];
  if (typeof recLetters === "number") {
    out.push(
      `${recLetters} recommendation ${recLetters === 1 ? "letter" : "letters"}`,
    );
  }

  const testOptional = req["test_optional"];
  if (typeof testOptional === "boolean") {
    out.push(testOptional ? "Test optional" : "Test scores required");
  }

  const interview = req["interview"];
  if (typeof interview === "boolean" && interview) {
    out.push("Interview offered");
  } else if (typeof interview === "string" && interview.trim()) {
    out.push(`Interview: ${interview}`);
  }

  const supplement = req["supplemental_essays"] ?? req["supplements"];
  if (typeof supplement === "number") {
    out.push(
      `${supplement} supplemental ${supplement === 1 ? "essay" : "essays"}`,
    );
  } else if (typeof supplement === "boolean" && supplement) {
    out.push("Supplemental essays required");
  }

  const portfolio = req["portfolio"];
  if (typeof portfolio === "boolean" && portfolio) out.push("Portfolio required");

  // Generic fall-through for any other keys, so nothing is hidden.
  const HANDLED = new Set([
    "rec_letters",
    "test_optional",
    "interview",
    "supplemental_essays",
    "supplements",
    "portfolio",
  ]);
  for (const [key, value] of Object.entries(req)) {
    if (HANDLED.has(key)) continue;
    const label = humanizeKey(key);
    if (typeof value === "boolean") {
      if (value) out.push(label);
    } else if (typeof value === "number" || typeof value === "string") {
      const v = String(value).trim();
      if (v) out.push(`${label}: ${v}`);
    }
  }
  return out;
}

function humanizeKey(key: string): string {
  const spaced = key.replace(/[_-]+/g, " ").trim();
  if (!spaced) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Format an admit rate (0..1) as a percentage string, or null when absent. */
export function formatAdmitRate(rate: number | null): string | null {
  if (rate == null || Number.isNaN(rate)) return null;
  const pct = rate <= 1 ? rate * 100 : rate; // tolerate already-pct values
  const rounded = pct < 10 ? Math.round(pct * 10) / 10 : Math.round(pct);
  return `${rounded}% admit rate`;
}

/** Format type + size into a single descriptor (e.g. "Private · 7,000 students"). */
export function formatTypeSize(
  type: CollegeType | null,
  size: number | null,
): string | null {
  const parts: string[] = [];
  if (type) parts.push(type.charAt(0).toUpperCase() + type.slice(1));
  if (typeof size === "number" && size > 0) {
    parts.push(`${size.toLocaleString()} students`);
  }
  return parts.length ? parts.join(" · ") : null;
}

/** A normalized [plan, date] list from a catalog `deadlines` jsonb. */
export function listCatalogDeadlines(
  deadlines: CatalogDeadlines | null,
): { plan: string; date: string }[] {
  if (!deadlines) return [];
  const ORDER = ["ED", "ED2", "REA", "EA", "RD", "rolling"];
  const entries = Object.entries(deadlines).filter(([, d]) => !!d);
  entries.sort((a, b) => {
    const ai = ORDER.indexOf(a[0]);
    const bi = ORDER.indexOf(b[0]);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  return entries.map(([plan, date]) => ({ plan, date }));
}

// ---------------------------------------------------------------------------
// useCollegeCatalog — batch-fetch catalog rows by id
// ---------------------------------------------------------------------------

export interface UseCollegeCatalogResult {
  byId: Record<string, CatalogCollege>;
  loading: boolean;
}

/**
 * useCollegeCatalog — batch-fetch the catalog rows for a set of college ids.
 * Re-runs whenever the id SET changes (serialized + sorted so the same ids in a
 * different order don't refetch). aliveRef-guarded per CLAUDE.md.
 */
export function useCollegeCatalog(
  collegeIds: (string | null | undefined)[],
): UseCollegeCatalogResult {
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const [byId, setById] = useState<Record<string, CatalogCollege>>({});
  const [loading, setLoading] = useState(false);

  // Stable key: unique, sorted, comma-joined.
  const ids = Array.from(
    new Set(collegeIds.filter((id): id is string => !!id)),
  ).sort();
  const key = ids.join(",");

  useEffect(() => {
    if (ids.length === 0) {
      setById({});
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("colleges")
        .select(CATALOG_COLUMNS)
        .in("id", ids);
      if (cancelled || !aliveRef.current) return;
      setLoading(false);
      if (error) {
        // Non-fatal: catalog detail just won't render. The hook stays silent
        // (the consuming surfaces still work without catalog enrichment).
        setById({});
        return;
      }
      const next: Record<string, CatalogCollege> = {};
      for (const row of (data ?? []) as CatalogCollege[]) {
        next[row.id] = row;
      }
      setById(next);
    })();
    return () => {
      cancelled = true;
    };
    // `key` captures the id set; ids is derived from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { byId, loading };
}
