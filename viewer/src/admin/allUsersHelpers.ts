/**
 * allUsersHelpers
 * ===============
 * Pure helpers, constants, and types extracted from AllUsersView. No React,
 * no JSX — value/type definitions and side-effect-free utilities only.
 */
import type { ProfileRole } from "../lib/profile";

export interface AdminUser {
  id: string;
  email: string;
  display_name: string | null;
  role: ProfileRole;
  created_at: string;
}

export const PAGE_SIZE = 50;

export type RoleFilter = "all" | "student" | "teacher" | "admin";
export type SortKey = "created_desc" | "created_asc" | "name" | "role";

export const ROLE_FILTERS: ReadonlyArray<RoleFilter> = ["all", "student", "teacher", "admin"];
export const SORT_KEYS: ReadonlyArray<SortKey> = ["created_desc", "created_asc", "name", "role"];

export const DEFAULT_FILTER: RoleFilter = "all";
export const DEFAULT_SORT: SortKey = "created_desc";

export const STORAGE_KEY = "admin.users.view";

export interface PersistedView {
  filter: RoleFilter;
  sort: SortKey;
}

export function loadPersistedView(): PersistedView {
  if (typeof window === "undefined") {
    return { filter: DEFAULT_FILTER, sort: DEFAULT_SORT };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { filter: DEFAULT_FILTER, sort: DEFAULT_SORT };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { filter: DEFAULT_FILTER, sort: DEFAULT_SORT };
    }
    const obj = parsed as Record<string, unknown>;
    const filter =
      typeof obj.filter === "string" && (ROLE_FILTERS as readonly string[]).includes(obj.filter)
        ? (obj.filter as RoleFilter)
        : DEFAULT_FILTER;
    const sort =
      typeof obj.sort === "string" && (SORT_KEYS as readonly string[]).includes(obj.sort)
        ? (obj.sort as SortKey)
        : DEFAULT_SORT;
    return { filter, sort };
  } catch {
    return { filter: DEFAULT_FILTER, sort: DEFAULT_SORT };
  }
}

export function savePersistedView(view: PersistedView): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(view));
  } catch {
    // localStorage may be unavailable (private mode, quota); silently skip.
  }
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Failed to load users.";
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export function toUser(row: unknown): AdminUser | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (
    typeof r.id !== "string" ||
    typeof r.email !== "string" ||
    typeof r.role !== "string" ||
    typeof r.created_at !== "string"
  ) {
    return null;
  }
  const role = r.role;
  if (role !== "student" && role !== "teacher" && role !== "admin") return null;
  return {
    id: r.id,
    email: r.email,
    display_name: typeof r.display_name === "string" ? r.display_name : null,
    role,
    created_at: r.created_at,
  };
}

export function roleBadgeClass(role: ProfileRole): string {
  switch (role) {
    case "admin":
      return "bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300";
    case "teacher":
      return "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300";
    case "student":
    default:
      return "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300";
  }
}

/**
 * Roles are sorted admin → teacher → student when the user picks "Role"
 * sort — admins are the rarest and most operationally interesting, so
 * floating them to the top is the useful ordering, not alphabetical.
 */
export const ROLE_SORT_WEIGHT: Record<ProfileRole, number> = {
  admin: 0,
  teacher: 1,
  student: 2,
};

export function sortLabel(sort: SortKey): string {
  switch (sort) {
    case "created_desc":
      return "Joined (newest first)";
    case "created_asc":
      return "Joined (oldest first)";
    case "name":
      return "Name";
    case "role":
      return "Role";
  }
}

export function filterLabel(filter: RoleFilter): string {
  switch (filter) {
    case "all":
      return "All";
    case "student":
      return "Students";
    case "teacher":
      return "Teachers";
    case "admin":
      return "Admins";
  }
}
