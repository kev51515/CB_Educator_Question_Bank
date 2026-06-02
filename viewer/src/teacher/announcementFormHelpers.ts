/**
 * announcementFormHelpers
 * =======================
 * Pure helpers, constants, and types extracted from AnnouncementFormModal.
 * No React / component dependencies — schedule preset math, relative-time
 * hints, validation limits, and small formatting utilities live here so the
 * modal file stays focused on its form + JSX.
 */

/**
 * Schedule-specific quick presets — these complement (don't replace) the
 * generic presets baked into <SmartDatePicker/>. The picker's defaults
 * (Today, Tomorrow, Friday, In 1 week, …) snap to *end of day*, which is
 * the right default for "due dates" but the wrong one for "publish at".
 * Maya wanted morning-of presets so a Sunday-night scheduled post arrives
 * in students' inboxes at a sensible hour.
 */
export type SchedulePresetKey = "1h" | "tomorrow-9" | "next-mon-9";

export interface SchedulePreset {
  key: SchedulePresetKey;
  label: string;
  /** Returns ISO string at the preset's intended moment, computed from `now`. */
  toIso: (now: Date) => string;
}

function addHours(d: Date, n: number): Date {
  const x = new Date(d);
  x.setHours(x.getHours() + n);
  return x;
}

function nextCalendarDayAt(now: Date, hour: number, minute = 0): Date {
  const x = new Date(now);
  x.setDate(x.getDate() + 1);
  x.setHours(hour, minute, 0, 0);
  return x;
}

/**
 * Next Monday at the given local hour. If today *is* Monday, returns the
 * Monday after next (i.e. 7 days from today), per the requested spec — we
 * never schedule for "today" under a label that says "Next Monday".
 */
function nextMondayAt(now: Date, hour: number, minute = 0): Date {
  // JS getDay(): Sun=0, Mon=1, …
  const today = now.getDay();
  const daysUntilNextMonday = ((1 - today + 7) % 7) || 7;
  const x = new Date(now);
  x.setDate(x.getDate() + daysUntilNextMonday);
  x.setHours(hour, minute, 0, 0);
  return x;
}

export const SCHEDULE_PRESETS: SchedulePreset[] = [
  {
    key: "1h",
    label: "In 1 hour",
    toIso: (now) => addHours(now, 1).toISOString(),
  },
  {
    key: "tomorrow-9",
    label: "Tomorrow 9am",
    toIso: (now) => nextCalendarDayAt(now, 9).toISOString(),
  },
  {
    key: "next-mon-9",
    label: "Next Monday 9am",
    toIso: (now) => nextMondayAt(now, 9).toISOString(),
  },
];

/** Match a stored ISO value against a preset, within a 60-second window. */
export function matchSchedulePreset(value: string | null): SchedulePresetKey | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return null;
  const now = new Date();
  for (const p of SCHEDULE_PRESETS) {
    if (Math.abs(new Date(p.toIso(now)).getTime() - t) < 60_000) return p.key;
  }
  return null;
}

/**
 * Humanized "in X" hint built on Intl.RelativeTimeFormat. Returns null for
 * invalid or past times — the caller renders the rose error in those cases
 * instead of a misleading "in -3 minutes".
 */
export function relativePublishHint(iso: string | null): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const ms = t - Date.now();
  if (ms <= 0) return null;
  try {
    const fmt = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    const minutes = Math.round(ms / 60_000);
    const hours = Math.round(ms / 3_600_000);
    const days = Math.round(ms / 86_400_000);
    if (ms < 3_600_000) return fmt.format(minutes, "minute");
    if (ms < 86_400_000) return fmt.format(hours, "hour");
    return fmt.format(days, "day");
  } catch {
    const days = Math.round(ms / 86_400_000);
    if (days === 0) return "today";
    if (days === 1) return "tomorrow";
    return `in ${days} days`;
  }
}

export const MAX_TITLE_LEN = 200;
export const MAX_BODY_LEN = 10000;

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

/** Format a scheduled date in the same compact style SmartDatePicker uses. */
export function formatScheduled(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
