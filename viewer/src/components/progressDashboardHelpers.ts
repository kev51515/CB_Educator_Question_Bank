import type { IndexEntry } from "@/types";

// ─────────────────────────── helpers ─────────────────────────────

export const DIFFICULTY_ORDER = ["Easy", "Medium", "Hard"] as const;
export const SECTIONS = ["Math", "Reading and Writing"] as const;

export function pct(n: number, total: number): number {
  return total > 0 ? (n / total) * 100 : 0;
}

export function fmtPct(n: number, total: number): string {
  if (total === 0) return "0%";
  const p = (n / total) * 100;
  if (p === 0) return "0%";
  if (p < 1) return "<1%";
  return `${Math.round(p)}%`;
}

/** Match an IndexEntry to one of the two SAT sections (case-insensitive partial match). */
export function matchSection(entry: IndexEntry): "Math" | "Reading and Writing" | null {
  const s = entry.section.toLowerCase();
  if (s.includes("math")) return "Math";
  if (s.includes("reading") || s.includes("writing")) return "Reading and Writing";
  return null;
}

/** Determine a single "best" confidence level for a question based on the rating map. */
export function confLevel(id: string, confMap: Record<string, number>): 0 | 1 | 2 | 3 {
  const v = confMap[id];
  if (v === 1 || v === 2 || v === 3) return v;
  return 0;
}
