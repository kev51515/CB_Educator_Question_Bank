/**
 * AdminAuditPage
 * ==============
 * Admin-only viewer for the `public.audit_events` ledger introduced in
 * migration 0022. Renders a paginated table (50/page, server-side via
 * PostgREST `range()` + exact count) of every captured event, with filters
 * for action, actor email/uuid, and an inclusive date range.
 *
 * Why a dedicated page: the audit ledger is append-only and admin-read-only
 * (RLS), so we surface it under `/account/admin/audit` alongside the other
 * admin power-tools (stats / users / invites). The right pane should feel
 * like the existing `AllUsersView` — paginated table, top-of-page filter row,
 * inline error reporting.
 *
 * Actor email resolution: we join client-side. The events table only stores
 * `actor_id` (uuid), so on every page load we fetch the corresponding
 * profiles in one batch and stitch them into the rows. This keeps the
 * trigger-side payload small and avoids stale denormalised emails.
 *
 * Details column: JSONB. We render a collapsible <details> with the JSON
 * pretty-printed — no fancy viewer dependency, no `any`.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { EmptyState, Skeleton } from "../components";
import { SmartDatePicker } from "../components/SmartDatePicker";

interface AuditEvent {
  id: number;
  actor_id: string | null;
  action: string;
  target_kind: string | null;
  target_id: string | null;
  details: unknown;
  created_at: string;
}

interface AuditRowView extends AuditEvent {
  actor_email: string | null;
}

const PAGE_SIZE = 50;

/**
 * Action-kind registry.
 *
 * Every action string written to `public.audit_events` by a migration is
 * mapped here to a friendly label + group. The `id` MUST match the DB value
 * verbatim (these are the literal strings inserted by the SECURITY DEFINER
 * triggers / helpers in 0022, 0027, 0050, 0056, 0062, 0063).
 *
 * Keep this registry in sync when new audit emitters land. Unknown actions
 * surfaced by the live data are tolerated — they get bucketed into "Other"
 * in the filter dropdown after the first page loads.
 */
interface ActionKindMeta {
  id: string;
  label: string;
  group: ActionGroup;
  description?: string;
}

type ActionGroup = "Security" | "Grading" | "Content" | "Lifecycle" | "Other";

const ACTION_GROUP_ORDER: ActionGroup[] = [
  "Security",
  "Lifecycle",
  "Grading",
  "Content",
  "Other",
];

const KNOWN_ACTION_KINDS: ActionKindMeta[] = [
  // Security — auth, role, identity, invite minting.
  {
    id: "role.change",
    label: "Role change",
    group: "Security",
    description: "An admin promoted or demoted a profile's role.",
  },
  {
    id: "invite.mint",
    label: "Invite minted",
    group: "Security",
    description: "Staff issued a new teacher invite code.",
  },
  {
    id: "profile.delete",
    label: "Profile delete",
    group: "Security",
    description:
      "A user profile was deleted. Details record cascade counts for forensics.",
  },
  // Lifecycle — destructive deletes of top-level course content.
  {
    id: "course.delete",
    label: "Course delete",
    group: "Lifecycle",
    description: "A course (a.k.a. class) was deleted.",
  },
  {
    id: "assignment.delete",
    label: "Assignment delete",
    group: "Lifecycle",
  },
  {
    id: "material.delete",
    label: "Material delete",
    group: "Lifecycle",
  },
  {
    id: "announcement.delete",
    label: "Announcement delete",
    group: "Lifecycle",
  },
  // Grading
  {
    id: "assignment_grade",
    label: "Grade applied",
    group: "Grading",
    description: "Teacher recorded or overrode an assignment grade.",
  },
  // Content
  {
    id: "teacher_note_change",
    label: "Teacher note edited",
    group: "Content",
    description: "A private teacher-on-student note was created or updated.",
  },
  {
    id: "portfolio_import",
    label: "Portfolio import",
    group: "Content",
    description:
      "A teacher imported a portfolio template from another course.",
  },
];

const ACTION_META_BY_ID: ReadonlyMap<string, ActionKindMeta> = new Map(
  KNOWN_ACTION_KINDS.map((k) => [k.id, k]),
);

function getActionLabel(id: string): string {
  return ACTION_META_BY_ID.get(id)?.label ?? id;
}

function getActionMeta(id: string): ActionKindMeta | undefined {
  return ACTION_META_BY_ID.get(id);
}

interface ActionOptionGroup {
  group: ActionGroup;
  items: ActionKindMeta[];
}

/**
 * Build the option list shown in the dropdown. Combines the static registry
 * with any unknown actions discovered in the live data (bucketed as "Other"),
 * preserving the canonical group ordering and alphabetising within a group.
 */
function buildActionOptionGroups(discovered: string[]): ActionOptionGroup[] {
  const known = new Set(KNOWN_ACTION_KINDS.map((k) => k.id));
  const extras: ActionKindMeta[] = discovered
    .filter((a) => !known.has(a))
    .sort()
    .map((id) => ({ id, label: id, group: "Other" as const }));

  const all = [...KNOWN_ACTION_KINDS, ...extras];
  const byGroup = new Map<ActionGroup, ActionKindMeta[]>();
  for (const meta of all) {
    const bucket = byGroup.get(meta.group) ?? [];
    bucket.push(meta);
    byGroup.set(meta.group, bucket);
  }

  const result: ActionOptionGroup[] = [];
  for (const group of ACTION_GROUP_ORDER) {
    const items = byGroup.get(group);
    if (!items || items.length === 0) continue;
    items.sort((a, b) => a.label.localeCompare(b.label));
    result.push({ group, items });
  }
  return result;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Failed to load audit events.";
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function toAuditEvent(row: unknown): AuditEvent | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== "number") return null;
  if (typeof r.action !== "string") return null;
  if (typeof r.created_at !== "string") return null;
  return {
    id: r.id,
    actor_id: typeof r.actor_id === "string" ? r.actor_id : null,
    action: r.action,
    target_kind: typeof r.target_kind === "string" ? r.target_kind : null,
    target_id: typeof r.target_id === "string" ? r.target_id : null,
    details: "details" in r ? r.details : null,
    created_at: r.created_at,
  };
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * Convert a yyyy-mm-dd <input type="date"> value to an ISO timestamp at the
 * local-day boundary. Returns null on empty/invalid input.
 */
function dayStartIso(date: string): string | null {
  if (!date) return null;
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function dayEndIso(date: string): string | null {
  if (!date) return null;
  const d = new Date(`${date}T23:59:59.999`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-fA-F-]{16,}$/.test(value);
}

export function AdminAuditPage() {
  const [rows, setRows] = useState<AuditRowView[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters (applied on Apply / Enter; debouncing not needed at 50/page).
  const [actionFilter, setActionFilter] = useState<string>("");
  const [actorFilter, setActorFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  // Distinct list of actions (best-effort, fetched once) so the dropdown
  // shows what's actually in the ledger rather than a hardcoded enum.
  const [knownActions, setKnownActions] = useState<string[]>([]);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from("audit_events")
        .select("id, actor_id, action, target_kind, target_id, details, created_at", {
          count: "exact",
        })
        .order("created_at", { ascending: false })
        .range(from, to);

      if (actionFilter) {
        query = query.eq("action", actionFilter);
      }
      // SmartDatePicker emits ISO strings; slice to YYYY-MM-DD for day-boundary helpers.
      const fromIso = dayStartIso(dateFrom ? dateFrom.slice(0, 10) : "");
      if (fromIso) {
        query = query.gte("created_at", fromIso);
      }
      const toIso = dayEndIso(dateTo ? dateTo.slice(0, 10) : "");
      if (toIso) {
        query = query.lte("created_at", toIso);
      }
      // Actor filter is best-effort: treat uuid-looking input as actor_id,
      // anything else (email substring) we resolve via a profiles lookup.
      if (actorFilter) {
        const trimmed = actorFilter.trim();
        if (isUuidLike(trimmed)) {
          query = query.eq("actor_id", trimmed);
        } else {
          // Lookup matching profile ids first; if none, short-circuit to
          // empty results rather than running an unconstrained query.
          const { data: profileRows, error: profileErr } = await supabase
            .from("profiles")
            .select("id")
            .ilike("email", `%${trimmed}%`)
            .limit(200);
          if (profileErr) {
            setError(profileErr.message);
            setRows([]);
            setTotal(0);
            return;
          }
          const ids: string[] = [];
          for (const row of profileRows ?? []) {
            const r = row as Record<string, unknown>;
            if (typeof r.id === "string") ids.push(r.id);
          }
          if (ids.length === 0) {
            setRows([]);
            setTotal(0);
            return;
          }
          query = query.in("actor_id", ids);
        }
      }

      const { data, error: queryError, count } = await query;
      if (queryError) {
        setError(queryError.message);
        setRows([]);
        setTotal(0);
        return;
      }

      const parsed: AuditEvent[] = [];
      for (const row of data ?? []) {
        const e = toAuditEvent(row);
        if (e) parsed.push(e);
      }

      // Resolve actor emails in one batched query.
      const actorIds = Array.from(
        new Set(
          parsed
            .map((e) => e.actor_id)
            .filter((v): v is string => typeof v === "string"),
        ),
      );
      const emailById = new Map<string, string>();
      if (actorIds.length > 0) {
        const { data: profileRows, error: profileErr } = await supabase
          .from("profiles")
          .select("id, email")
          .in("id", actorIds);
        if (profileErr) {
          // Non-fatal: surface rows without email rather than blocking.
          setError(profileErr.message);
        } else {
          for (const row of profileRows ?? []) {
            const r = row as Record<string, unknown>;
            if (typeof r.id === "string" && typeof r.email === "string") {
              emailById.set(r.id, r.email);
            }
          }
        }
      }

      const view: AuditRowView[] = parsed.map((e) => ({
        ...e,
        actor_email: e.actor_id ? emailById.get(e.actor_id) ?? null : null,
      }));
      setRows(view);
      setTotal(count ?? 0);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter, actorFilter, dateFrom, dateTo]);

  // Load the distinct action set once. Cheap because most installs have
  // <10 distinct action codes.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("audit_events")
        .select("action")
        .order("action", { ascending: true })
        .limit(1000);
      if (cancelled) return;
      const seen = new Set<string>();
      for (const row of data ?? []) {
        const r = row as Record<string, unknown>;
        if (typeof r.action === "string") seen.add(r.action);
      }
      setKnownActions(Array.from(seen).sort());
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const pageCount = useMemo(
    () => Math.max(1, Math.ceil(total / PAGE_SIZE)),
    [total],
  );

  // Merge actions seen in the current page into the known set so the dropdown
  // forward-compats with new emitters before the registry catches up.
  const discoveredActions = useMemo(() => {
    const set = new Set<string>(knownActions);
    for (const r of rows) set.add(r.action);
    return Array.from(set);
  }, [knownActions, rows]);

  const optionGroups = useMemo(
    () => buildActionOptionGroups(discoveredActions),
    [discoveredActions],
  );

  const activeActionMeta = actionFilter
    ? getActionMeta(actionFilter)
    : undefined;

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Audit log
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Append-only ledger of sensitive events: role changes, invite-code
          mints, course deletes. Read-only.
        </p>
      </header>

      {/* Filter row */}
      <form
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(0);
          void refresh();
        }}
      >
        <label className="text-xs font-medium text-slate-600 dark:text-slate-400 flex flex-col gap-1">
          Action
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="min-h-[40px] rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            title={activeActionMeta?.description}
          >
            <option value="">All actions</option>
            {optionGroups.map(({ group, items }) => (
              <optgroup key={group} label={group}>
                {items.map((meta) => (
                  <option
                    key={meta.id}
                    value={meta.id}
                    title={meta.description}
                  >
                    {meta.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600 dark:text-slate-400 flex flex-col gap-1">
          Actor (email or uuid)
          <input
            type="text"
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            placeholder="alice@example.com"
            className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100"
          />
        </label>
        <div className="text-xs font-medium text-slate-600 dark:text-slate-400 flex flex-col gap-1">
          <span>From</span>
          <SmartDatePicker
            value={dateFrom || null}
            onChange={(next) => setDateFrom(next ?? "")}
          />
        </div>
        <div className="text-xs font-medium text-slate-600 dark:text-slate-400 flex flex-col gap-1">
          <span>To</span>
          <SmartDatePicker
            value={dateTo || null}
            onChange={(next) => setDateTo(next ?? "")}
          />
        </div>
        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="min-h-[40px] rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={() => {
              setActionFilter("");
              setActorFilter("");
              setDateFrom("");
              setDateTo("");
              setPage(0);
            }}
            className="min-h-[40px] rounded-md border border-slate-300 dark:border-slate-700 text-sm font-medium px-3 py-1.5 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
          >
            Reset
          </button>
        </div>
        {activeActionMeta?.description && (
          <p className="sm:col-span-2 lg:col-span-5 text-xs text-slate-500 dark:text-slate-400 -mt-1">
            <span className="font-medium text-slate-600 dark:text-slate-300">
              {activeActionMeta.label}:
            </span>{" "}
            {activeActionMeta.description}{" "}
            <span className="font-mono text-[10px] text-slate-400">
              ({activeActionMeta.id})
            </span>
          </p>
        )}
      </form>

      {error && (
        <div className="rounded-md border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left font-medium px-3 py-2">Time</th>
              <th className="text-left font-medium px-3 py-2">Action</th>
              <th className="text-left font-medium px-3 py-2">Actor</th>
              <th className="text-left font-medium px-3 py-2">Target</th>
              <th className="text-left font-medium px-3 py-2">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <>
                {Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`skeleton-${i}`}>
                    <td colSpan={5} className="px-3 py-2">
                      <Skeleton className="h-8 w-full rounded" />
                    </td>
                  </tr>
                ))}
              </>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-0 py-0">
                  <EmptyState
                    icon="inbox"
                    title="No audit events yet"
                    body="No events match the current filters. Try widening the date range or clearing filters."
                  />
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.id}
                  className="text-slate-800 dark:text-slate-200 align-top"
                >
                  <td className="px-3 py-2 whitespace-nowrap text-xs">
                    {formatTimestamp(r.created_at)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs">
                    <span
                      title={r.action}
                      className="inline-flex items-center rounded-md bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 font-medium text-slate-700 dark:text-slate-200"
                    >
                      {getActionLabel(r.action)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {r.actor_email ?? (
                      <span className="text-slate-500 dark:text-slate-400">
                        {r.actor_id ?? "system"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {r.target_kind ? (
                      <span>
                        <span className="text-slate-500 dark:text-slate-400">
                          {r.target_kind}
                        </span>
                        {r.target_id ? (
                          <>
                            <span className="text-slate-400">:</span>{" "}
                            <span className="font-mono">{r.target_id}</span>
                          </>
                        ) : null}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {r.details === null || r.details === undefined ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <details>
                        <summary className="cursor-pointer text-indigo-600 dark:text-indigo-400">
                          view
                        </summary>
                        <pre className="mt-1 max-w-md whitespace-pre-wrap break-words rounded bg-slate-100 dark:bg-slate-800 p-2 text-[11px] leading-snug">
                          {safeStringify(r.details)}
                        </pre>
                      </details>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
        <span>
          {total === 0
            ? "0 events"
            : `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} of ${total}`}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page === 0 || loading}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="rounded-md border border-slate-300 dark:border-slate-700 px-3 py-1 disabled:opacity-50"
          >
            Prev
          </button>
          <span className="text-xs">
            Page {page + 1} / {pageCount}
          </span>
          <button
            type="button"
            disabled={page + 1 >= pageCount || loading}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-md border border-slate-300 dark:border-slate-700 px-3 py-1 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
