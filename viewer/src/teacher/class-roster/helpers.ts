/**
 * class-roster/helpers
 * ====================
 * Sort state (types + persistence + comparator), a debounce hook, and small
 * format/error helpers for the roster table. Extracted verbatim from
 * ClassRoster. All top-level decls exported.
 */
import { useEffect, useState } from "react";
import { type RosterStudent } from "@/teacher/useClassRoster";
export type SortKey = "name" | "joined";
export type SortDir = "asc" | "desc";

export interface SortState {
  key: SortKey;
  dir: SortDir;
}

export const DEFAULT_SORT: SortState = { key: "name", dir: "asc" };

export const sortStorageKey = (userId: string | null, courseId: string): string =>
  `roster.sort:${userId ?? "anon"}:${courseId}`;

export function readSortState(key: string): SortState {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return DEFAULT_SORT;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return DEFAULT_SORT;
    const obj = parsed as { key?: unknown; dir?: unknown };
    const k = obj.key === "name" || obj.key === "joined" ? obj.key : null;
    const d = obj.dir === "asc" || obj.dir === "desc" ? obj.dir : null;
    if (!k || !d) return DEFAULT_SORT;
    return { key: k, dir: d };
  } catch {
    return DEFAULT_SORT;
  }
}

export function writeSortState(key: string, state: SortState): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // localStorage may be unavailable (private mode); ignore.
  }
}

export function compareStudents(
  a: RosterStudent,
  b: RosterStudent,
  sort: SortState,
): number {
  const dirMul = sort.dir === "asc" ? 1 : -1;
  if (sort.key === "name") {
    const an = (a.display_name ?? a.email ?? "").toLowerCase();
    const bn = (b.display_name ?? b.email ?? "").toLowerCase();
    const cmp = an.localeCompare(bn);
    if (cmp !== 0) return cmp * dirMul;
    // Stable tiebreaker: email asc.
    return a.email.localeCompare(b.email) * dirMul;
  }
  // joined
  const at = new Date(a.joined_at).getTime();
  const bt = new Date(b.joined_at).getTime();
  const aValid = Number.isFinite(at);
  const bValid = Number.isFinite(bt);
  if (!aValid && !bValid) return 0;
  if (!aValid) return 1;
  if (!bValid) return -1;
  if (at !== bt) return (at - bt) * dirMul;
  // Stable tiebreaker: name asc.
  return (a.display_name ?? a.email)
    .toLowerCase()
    .localeCompare((b.display_name ?? b.email).toLowerCase()) * dirMul;
}

// -----------------------------------------------------------------------------
// Sortable column header button
// -----------------------------------------------------------------------------

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export function formatRelative(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return iso;
  const diffMs = then.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const minutes = Math.round(diffMs / 60_000);
  const hours = Math.round(diffMs / 3_600_000);
  const days = Math.round(diffMs / 86_400_000);
  if (abs < 60_000) return "just now";
  try {
    const fmt = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    if (abs < 3_600_000) return fmt.format(minutes, "minute");
    if (abs < 86_400_000) return fmt.format(hours, "hour");
    if (abs < 30 * 86_400_000) return fmt.format(days, "day");
    return then.toLocaleDateString();
  } catch {
    return then.toLocaleString();
  }
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

