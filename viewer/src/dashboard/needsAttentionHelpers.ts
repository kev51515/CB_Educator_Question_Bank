// ─── localStorage persistence ─────────────────────────────────────────────

const STORAGE_KEY = "dashboard.attention.collapse";
const COURSE_FILTER_KEY = "dashboard.attention.courseFilter";

export interface CollapseState {
  toGrade: boolean;
  pastDue: boolean;
  replies: boolean;
}

const DEFAULT_COLLAPSE: CollapseState = {
  toGrade: false,
  pastDue: false,
  replies: false,
};

export function loadCollapse(): CollapseState {
  if (typeof window === "undefined") return DEFAULT_COLLAPSE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_COLLAPSE;
    const parsed = JSON.parse(raw) as Partial<CollapseState>;
    return {
      toGrade: typeof parsed.toGrade === "boolean" ? parsed.toGrade : false,
      pastDue: typeof parsed.pastDue === "boolean" ? parsed.pastDue : false,
      replies: typeof parsed.replies === "boolean" ? parsed.replies : false,
    };
  } catch {
    return DEFAULT_COLLAPSE;
  }
}

export function saveCollapse(state: CollapseState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage may be unavailable (Safari private mode etc.) — silent.
  }
}

export function loadCourseFilter(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(COURSE_FILTER_KEY);
    if (!raw) return null;
    return raw;
  } catch {
    return null;
  }
}

export function saveCourseFilter(courseShortCode: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (courseShortCode === null) {
      window.localStorage.removeItem(COURSE_FILTER_KEY);
    } else {
      window.localStorage.setItem(COURSE_FILTER_KEY, courseShortCode);
    }
  } catch {
    // silent
  }
}

// ─── Time-ago formatter ───────────────────────────────────────────────────

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const seconds = Math.round(diffMs / 1000);
  if (seconds < 60) return seconds <= 5 ? "just now" : `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 8) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString();
}

export function timeUntil(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = then - Date.now();
  const overdue = diffMs < 0;
  const abs = Math.abs(diffMs);
  const minutes = Math.round(abs / 60000);
  if (minutes < 60)
    return overdue ? `${minutes}m overdue` : `in ${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48)
    return overdue ? `${hours}h overdue` : `in ${hours}h`;
  const days = Math.round(hours / 24);
  return overdue ? `${days}d overdue` : `in ${days}d`;
}

// ─── Initial avatar ───────────────────────────────────────────────────────

export function initialOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const ch = trimmed[0];
  return (ch ?? "?").toUpperCase();
}
