/**
 * calendar/helpers
 * ================
 * Pure types, view-mode persistence, Intl date/time formatters, and date-math
 * helpers for the Calendar surface. No React/JSX — extracted verbatim from
 * CalendarPage. All top-level decls are exported.
 */
import type { Domain } from "@/lib/domain";

export type EventKind = "assignment" | "portfolio";

export interface CalendarEvent {
  kind: EventKind;
  id: string;
  title: string;
  due_at: Date;
  courseName: string;
  courseId: string;
  /** Workspace domain of the owning course (from courses.course_type). */
  domain: Domain;
}

export interface AssignmentRow {
  id: string;
  short_code: string;
  title: string | null;
  due_at: string | null;
  course_id: string;
  courses:
    | { name: string | null; short_code: string; course_type: string | null }
    | { name: string | null; short_code: string; course_type: string | null }[]
    | null;
}

export interface PortfolioTemplate {
  course_id: string;
  courses:
    | { name: string | null; short_code?: string; course_type: string | null }
    | { name: string | null; short_code?: string; course_type: string | null }[]
    | null;
}

export interface PortfolioRow {
  id: string;
  title: string | null;
  due_at: string | null;
  portfolio_templates: PortfolioTemplate | PortfolioTemplate[] | null;
}

export type ViewMode = "month" | "list";

// View mode persists globally — not per-course — because the Calendar surface
// itself is global. Wrapping in try/catch protects against Safari private mode
// throwing on localStorage access.
export const CALENDAR_VIEW_KEY = "calendar-view";

export function readCalendarView(): ViewMode {
  try {
    const raw = window.localStorage.getItem(CALENDAR_VIEW_KEY);
    if (raw === "month" || raw === "list") return raw;
  } catch {
    /* localStorage unavailable (Safari private mode, quota, etc.) */
  }
  return "month";
}

export function writeCalendarView(value: ViewMode): void {
  try {
    window.localStorage.setItem(CALENDAR_VIEW_KEY, value);
  } catch {
    /* ignore */
  }
}

export const MONTH_FMT = new Intl.DateTimeFormat(undefined, {
  month: "long",
  year: "numeric",
});

export const WEEKDAY_FMT = new Intl.DateTimeFormat(undefined, { weekday: "short" });

export const DATE_FMT = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
});

export const FULL_DATE_FMT = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
});

export const TIME_FMT = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

/** Normalize Supabase's "one or many" relation shape into a single record. */
export function pickOne<T>(value: T | T[] | null): T | null {
  if (value === null) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Build a rectangular grid covering the entire month plus leading days from
 * the previous month and trailing days from the next month so each row has
 * exactly 7 cells. */
export function buildMonthGrid(anchor: Date): Date[] {
  const first = startOfMonth(anchor);
  const last = endOfMonth(anchor);
  const leading = first.getDay(); // 0 = Sun
  const totalDays = leading + last.getDate();
  const trailing = (7 - (totalDays % 7)) % 7;
  const cells: Date[] = [];
  const gridStart = addDays(first, -leading);
  const totalCells = totalDays + trailing;
  for (let i = 0; i < totalCells; i += 1) {
    cells.push(addDays(gridStart, i));
  }
  return cells;
}

export function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** True when the active element is a typing surface (so we don't hijack ←/T/etc.
 * while the user is filling out a form somewhere on the page). */
export function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}
