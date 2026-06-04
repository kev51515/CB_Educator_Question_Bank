/**
 * inviteCodesHelpers
 * ==================
 * Pure types, view (filter/sort) persistence, code classification, row
 * normalization, and date formatters for AdminInviteCodesPage. No JSX.
 */
export type FilterKey = "all" | "active" | "expired" | "revoked";
export type SortKey = "recent" | "oldest" | "expires" | "code";

export interface InviteCodesView {
  filter: FilterKey;
  sort: SortKey;
}

export const VIEW_STORAGE_KEY = "admin.invites.view";
export const DEFAULT_VIEW: InviteCodesView = { filter: "all", sort: "recent" };

export const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "expired", label: "Expired" },
  { key: "revoked", label: "Revoked" },
];

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "recent", label: "Most recent" },
  { key: "oldest", label: "Oldest first" },
  { key: "expires", label: "Expires soonest" },
  { key: "code", label: "Code (A–Z)" },
];

export function loadView(): InviteCodesView {
  try {
    const raw = localStorage.getItem(VIEW_STORAGE_KEY);
    if (!raw) return DEFAULT_VIEW;
    const parsed = JSON.parse(raw) as Partial<InviteCodesView>;
    const filter: FilterKey = ["all", "active", "expired", "revoked"].includes(
      parsed.filter as string,
    )
      ? (parsed.filter as FilterKey)
      : DEFAULT_VIEW.filter;
    const sort: SortKey = ["recent", "oldest", "expires", "code"].includes(
      parsed.sort as string,
    )
      ? (parsed.sort as SortKey)
      : DEFAULT_VIEW.sort;
    return { filter, sort };
  } catch {
    return DEFAULT_VIEW;
  }
}

export function saveView(view: InviteCodesView): void {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(view));
  } catch {
    // ignore quota / disabled storage
  }
}

export function classifyCode(c: InviteCode, now: number): FilterKey {
  if (c.revoked) return "revoked";
  if (c.expires_at) {
    const t = new Date(c.expires_at).getTime();
    if (Number.isFinite(t) && t < now) return "expired";
  }
  return "active";
}

export interface InviteCode {
  code: string;
  note: string | null;
  created_by: string;
  created_at: string;
  expires_at: string | null;
  max_uses: number | null;
  uses: number;
  revoked: boolean;
}

export interface Redemption {
  id: string;
  code: string;
  redeemed_at: string;
  redeemed_by_name: string | null;
  redeemed_by_email: string;
}

export interface RawRedemptionRow {
  id: string;
  code: string;
  redeemed_at: string;
  redeemed_by: { display_name: string | null; email: string } | null;
}

export function toInviteCode(row: unknown): InviteCode | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (
    typeof r.code !== "string" ||
    typeof r.created_by !== "string" ||
    typeof r.created_at !== "string" ||
    typeof r.uses !== "number" ||
    typeof r.revoked !== "boolean"
  ) {
    return null;
  }
  return {
    code: r.code,
    note: typeof r.note === "string" ? r.note : null,
    created_by: r.created_by,
    created_at: r.created_at,
    expires_at: typeof r.expires_at === "string" ? r.expires_at : null,
    max_uses: typeof r.max_uses === "number" ? r.max_uses : null,
    uses: r.uses,
    revoked: r.revoked,
  };
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function formatRelative(iso: string | null): string {
  if (!iso) return "—";
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
