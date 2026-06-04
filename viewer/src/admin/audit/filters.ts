/**
 * admin/audit/filters
 * ===================
 * localStorage-backed persistence + helpers for the audit-log filters
 * (course, actor, date range). Pure functions/types, extracted verbatim from
 * AdminAuditPage. All top-level decls are exported for the page to consume.
 */
export const COURSE_FILTER_STORAGE_KEY = "admin.audit.courseFilter";

export interface CourseOption {
  id: string;
  name: string;
  short_code: string | null;
}

/**
 * Actor filter — restricts audit_events to a single staff profile (teacher
 * or admin). Persisted per-admin so a focused investigation sticks across
 * reloads. We store both the id (for the .eq("actor_id", id) query) and the
 * display name (so chips/empty-states render without a second fetch on hydrate).
 *
 * Storage shape (validated on hydrate):
 *   { actorId: string, actorName: string | null }
 */
export const ACTOR_FILTER_STORAGE_KEY = "admin.audit.actorFilter";

export interface ActorOption {
  id: string;
  display_name: string | null;
  email: string;
  role: string;
}

export interface ActorFilterState {
  actorId: string | null;
  actorName: string | null;
}

export const DEFAULT_ACTOR_FILTER: ActorFilterState = {
  actorId: null,
  actorName: null,
};

export function readPersistedActorFilter(): ActorFilterState {
  try {
    const raw = window.localStorage.getItem(ACTOR_FILTER_STORAGE_KEY);
    if (!raw) return DEFAULT_ACTOR_FILTER;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return DEFAULT_ACTOR_FILTER;
    const obj = parsed as Record<string, unknown>;
    const actorId =
      typeof obj.actorId === "string" && obj.actorId.length > 0
        ? obj.actorId
        : null;
    if (!actorId) return DEFAULT_ACTOR_FILTER;
    const actorName =
      typeof obj.actorName === "string" && obj.actorName.length > 0
        ? obj.actorName
        : null;
    return { actorId, actorName };
  } catch {
    return DEFAULT_ACTOR_FILTER;
  }
}

export function writePersistedActorFilter(value: ActorFilterState): void {
  try {
    if (value.actorId) {
      window.localStorage.setItem(
        ACTOR_FILTER_STORAGE_KEY,
        JSON.stringify(value),
      );
    } else {
      window.localStorage.removeItem(ACTOR_FILTER_STORAGE_KEY);
    }
  } catch {
    /* ignore quota / disabled storage */
  }
}

export function actorOptionLabel(opt: ActorOption): string {
  const name = opt.display_name?.trim();
  const tag = opt.role === "admin" ? " (admin)" : "";
  if (name && name.length > 0) {
    return `${name} <${opt.email}>${tag}`;
  }
  return `${opt.email}${tag}`;
}

export function readPersistedCourseFilter(): string {
  try {
    const v = window.localStorage.getItem(COURSE_FILTER_STORAGE_KEY);
    return typeof v === "string" ? v : "";
  } catch {
    return "";
  }
}

export function writePersistedCourseFilter(value: string): void {
  try {
    if (value) {
      window.localStorage.setItem(COURSE_FILTER_STORAGE_KEY, value);
    } else {
      window.localStorage.removeItem(COURSE_FILTER_STORAGE_KEY);
    }
  } catch {
    /* ignore quota / disabled storage */
  }
}

/**
 * Date-range filter — preset chips ("All time", "24h", "7d", "30d", "Custom")
 * plus an optional From/To pair when "custom" is active. Persisted per-admin
 * so a focused audit session sticks across reloads.
 *
 * Storage shape (validated on hydrate):
 *   { preset: '24h' | '7d' | '30d' | 'all' | 'custom', from?: 'YYYY-MM-DD', to?: 'YYYY-MM-DD' }
 */
export type DateRangePreset = "all" | "24h" | "7d" | "30d" | "custom";
export interface DateRangeState {
  preset: DateRangePreset;
  /** YYYY-MM-DD; only meaningful when preset === 'custom'. */
  from?: string;
  /** YYYY-MM-DD; only meaningful when preset === 'custom'. */
  to?: string;
}

export const DATE_RANGE_STORAGE_KEY = "admin.audit.dateRange";
export const DEFAULT_DATE_RANGE: DateRangeState = { preset: "all" };

export function isYmd(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function readPersistedDateRange(): DateRangeState {
  try {
    const raw = window.localStorage.getItem(DATE_RANGE_STORAGE_KEY);
    if (!raw) return DEFAULT_DATE_RANGE;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return DEFAULT_DATE_RANGE;
    const obj = parsed as Record<string, unknown>;
    const preset = obj.preset;
    if (
      preset !== "all" &&
      preset !== "24h" &&
      preset !== "7d" &&
      preset !== "30d" &&
      preset !== "custom"
    ) {
      return DEFAULT_DATE_RANGE;
    }
    const next: DateRangeState = { preset };
    if (preset === "custom") {
      if (isYmd(obj.from)) next.from = obj.from;
      if (isYmd(obj.to)) next.to = obj.to;
    }
    return next;
  } catch {
    return DEFAULT_DATE_RANGE;
  }
}

export function writePersistedDateRange(value: DateRangeState): void {
  try {
    if (value.preset === "all") {
      window.localStorage.removeItem(DATE_RANGE_STORAGE_KEY);
    } else {
      window.localStorage.setItem(
        DATE_RANGE_STORAGE_KEY,
        JSON.stringify(value),
      );
    }
  } catch {
    /* ignore quota / disabled storage */
  }
}

/** YYYY-MM-DD for "today" in the browser's local timezone. */
export function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Reduce a DateRangeState to the {fromIso, toIso} pair the query uses.
 * - 'all'    → both null (no date filter)
 * - '24h'    → from = now - 24h (precise instant), to = null
 * - '7d'     → from = now - 7d, to = null
 * - '30d'   → from = now - 30d, to = null
 * - 'custom' → from = midnight UTC of `from`, to = end-of-day UTC of `to`
 *
 * Custom uses the spec's literal `${date}T23:59:59.999Z` so a "to 2026-06-01"
 * includes everything up to that day's last millisecond. If from > to we
 * fall back to no-filter (UI shows the rose hint).
 */
export function resolveDateRange(state: DateRangeState): {
  fromIso: string | null;
  toIso: string | null;
  invalid: boolean;
} {
  const now = Date.now();
  if (state.preset === "all") {
    return { fromIso: null, toIso: null, invalid: false };
  }
  if (state.preset === "24h") {
    return {
      fromIso: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
      toIso: null,
      invalid: false,
    };
  }
  if (state.preset === "7d") {
    return {
      fromIso: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
      toIso: null,
      invalid: false,
    };
  }
  if (state.preset === "30d") {
    return {
      fromIso: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(),
      toIso: null,
      invalid: false,
    };
  }
  // custom
  const from = state.from;
  const to = state.to;
  const invalid = !!(from && to && from > to);
  if (invalid) {
    return { fromIso: null, toIso: null, invalid: true };
  }
  return {
    fromIso: from ? `${from}T00:00:00.000Z` : null,
    toIso: to ? `${to}T23:59:59.999Z` : null,
    invalid: false,
  };
}

export const PRESET_CHIPS: Array<{ id: DateRangePreset; label: string }> = [
  { id: "all", label: "All time" },
  { id: "24h", label: "Last 24 hours" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "custom", label: "Custom" },
];
