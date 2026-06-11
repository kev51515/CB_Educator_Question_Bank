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
 * Details column: JSONB. We render via the per-action formatter registry
 * (`FORMATTERS`) when the action is recognised — a small key/value table
 * with humanised labels, relative timestamps and truncated UUIDs. A
 * "View raw JSON" button flips to the pretty-printed JSON for forensics.
 * Unknown actions fall back to the raw JSON view.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "@/lib/supabase";
import { EmptyState, Skeleton } from "@/components";
import {
  actorOptionLabel,
  buildActionOptionGroups,
  DEFAULT_ACTOR_FILTER,
  DEFAULT_DATE_RANGE,
  DetailsCell,
  getActionLabel,
  getActionMeta,
  PRESET_CHIPS,
  readPersistedActorFilter,
  readPersistedCourseFilter,
  readPersistedDateRange,
  resolveDateRange,
  todayYmd,
  writePersistedActorFilter,
  writePersistedCourseFilter,
  writePersistedDateRange,
  type ActorFilterState,
  type ActorOption,
  type CourseOption,
  type DateRangeState,
} from "@/admin/audit";

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

// localStorage key for the action filter. The actor / course / date-range
// filters get their own persistence helpers in `@/admin/audit` (filters.ts);
// the action filter is a plain string so we persist it inline here rather
// than threading a fourth helper through the module barrel.
const ACTION_FILTER_STORAGE_KEY = "admin.audit.actionFilter";

function readPersistedActionFilter(): string {
  try {
    return window.localStorage.getItem(ACTION_FILTER_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function writePersistedActionFilter(value: string): void {
  try {
    if (value) {
      window.localStorage.setItem(ACTION_FILTER_STORAGE_KEY, value);
    } else {
      window.localStorage.removeItem(ACTION_FILTER_STORAGE_KEY);
    }
  } catch {
    /* localStorage unavailable (private mode / quota) — non-fatal. */
  }
}

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


export function AdminAuditPage() {
  const [rows, setRows] = useState<AuditRowView[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters (applied on Apply / Enter; debouncing not needed at 50/page).
  // Persisted per-admin so a focused investigation against a single action
  // kind sticks across reloads (matches the actor / course / date-range
  // filters below).
  const [actionFilter, setActionFilter] = useState<string>(() =>
    readPersistedActionFilter(),
  );
  // Actor filter — staff profile (teacher/admin) whose actions to scope to.
  // Persisted per-admin; stores both id (for query) and display name (for
  // chip + empty-state rendering without a second fetch on hydrate).
  const [actorFilter, setActorFilter] = useState<ActorFilterState>(() =>
    readPersistedActorFilter(),
  );
  // Typeahead text inside the actor combobox — hides non-matching options
  // as the user types. Not persisted; resets on reload.
  const [actorSearch, setActorSearch] = useState<string>("");
  // Date-range filter — preset chips + optional custom From/To pair.
  // Persisted per-admin so a focused window sticks across reloads.
  const [dateRange, setDateRange] = useState<DateRangeState>(() =>
    readPersistedDateRange(),
  );
  // Course filter is a uuid (courses.id) or "" for "All courses".
  // Initialised from localStorage so a focused audit session sticks across reloads.
  const [courseFilter, setCourseFilter] = useState<string>(() =>
    readPersistedCourseFilter(),
  );

  // Resolved ISO bounds for the current date-range state. invalid=true when a
  // custom range is inverted (from > to) — we fall back to no-filter so the
  // table still returns rows; the UI shows a rose hint pointing at the input.
  const resolvedDateRange = useMemo(
    () => resolveDateRange(dateRange),
    [dateRange],
  );

  // Distinct list of actions (best-effort, fetched once) so the dropdown
  // shows what's actually in the ledger rather than a hardcoded enum.
  const [knownActions, setKnownActions] = useState<string[]>([]);

  // Course picker options, fetched once. Admins see all courses via RLS.
  const [courseOptions, setCourseOptions] = useState<CourseOption[]>([]);

  // Actor picker options, fetched once. Only staff (teachers + admins) — the
  // ones who actually appear in audit_events as actor_id. Capped at 100; if
  // a deployment ever exceeds that the typeahead still works because the
  // server-side actor_id filter is the source of truth, not the dropdown.
  const [actorOptions, setActorOptions] = useState<ActorOption[]>([]);

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
      // Course scope: an event "belongs to" a course if either the top-level
      // target points at it (course_delete) OR the JSONB details payload
      // carries a course id under one of the known keys:
      //   - course_id           (assignment_delete, material_delete,
      //                          announcement_delete, teacher_note_change)
      //   - target_course_id    (portfolio_import — destination)
      //   - source_course_id    (portfolio_import — origin)
      // PostgREST's `.or()` accepts JSONB key extraction via `details->>key.eq.value`.
      if (courseFilter) {
        const id = courseFilter;
        query = query.or(
          [
            `and(target_kind.eq.course,target_id.eq.${id})`,
            `details->>course_id.eq.${id}`,
            `details->>target_course_id.eq.${id}`,
            `details->>source_course_id.eq.${id}`,
          ].join(","),
        );
      }
      // Date-range filter (preset chips + optional custom From/To).
      // resolveDateRange() returns `${date}T23:59:59.999Z` for custom-to so
      // a "to 2026-06-01" includes all of that day. Inverted custom ranges
      // (invalid=true) fall back to no-filter; UI surfaces the rose hint.
      const { fromIso, toIso } = resolvedDateRange;
      if (fromIso) {
        query = query.gte("created_at", fromIso);
      }
      if (toIso) {
        query = query.lte("created_at", toIso);
      }
      // Actor filter — a single staff profile id. Combobox-driven, so we
      // can rely on the value being either a clean uuid (selected from the
      // dropdown) or null (no filter). No email-substring fallback: the
      // typeahead lives in the combobox itself.
      if (actorFilter.actorId) {
        query = query.eq("actor_id", actorFilter.actorId);
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
  }, [page, actionFilter, actorFilter.actorId, resolvedDateRange, courseFilter]);

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

  // Persist the active action filter across reloads. Admins auditing a single
  // action kind shouldn't have to re-pick it every session.
  useEffect(() => {
    writePersistedActionFilter(actionFilter);
  }, [actionFilter]);

  // Persist the active course filter across reloads. Admins auditing a single
  // course shouldn't have to re-pick it every session.
  useEffect(() => {
    writePersistedCourseFilter(courseFilter);
  }, [courseFilter]);

  // Persist the date-range filter (preset + optional custom from/to).
  useEffect(() => {
    writePersistedDateRange(dateRange);
  }, [dateRange]);

  // Persist the active actor filter so a focused investigation against a
  // single teacher/admin sticks across reloads. We store both id + display
  // name to avoid a second profiles fetch on hydrate.
  useEffect(() => {
    writePersistedActorFilter(actorFilter);
  }, [actorFilter]);

  // Load the actor option list once. Only staff (teachers + admins) — the
  // only roles that emit audit_events as actor_id. Capped at 100; if a
  // deployment exceeds that we'd switch the combobox to a server-side
  // typeahead, but a 2-teacher / few-admin shop is the canonical case here.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error: actorErr } = await supabase
        .from("profiles")
        .select("id, display_name, email, role")
        .in("role", ["teacher", "admin"])
        .order("display_name", { ascending: true, nullsFirst: false })
        .limit(100);
      if (cancelled) return;
      if (actorErr) {
        // Non-fatal: leave the dropdown empty. Audit table still works.
        return;
      }
      const opts: ActorOption[] = [];
      for (const row of data ?? []) {
        const r = row as Record<string, unknown>;
        const id = typeof r.id === "string" ? r.id : null;
        const email = typeof r.email === "string" ? r.email : null;
        const role = typeof r.role === "string" ? r.role : null;
        const displayName =
          typeof r.display_name === "string" ? r.display_name : null;
        if (id && email && role) {
          opts.push({ id, display_name: displayName, email, role });
        }
      }
      setActorOptions(opts);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load the course list once. Admins see all courses via RLS. We cap at 200
  // courses — this is an admin debugging tool, not a directory; if a deployment
  // ever exceeds that we can switch to a typeahead.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error: courseErr } = await supabase
        .from("courses")
        .select("id, name, short_code")
        .eq("archived", false)
        .order("name", { ascending: true })
        .limit(200);
      if (cancelled) return;
      if (courseErr) {
        // Non-fatal: leave the dropdown empty. The audit table still works.
        return;
      }
      const opts: CourseOption[] = [];
      for (const row of data ?? []) {
        const r = row as Record<string, unknown>;
        const id = typeof r.id === "string" ? r.id : null;
        const name = typeof r.name === "string" ? r.name : null;
        const shortCode =
          typeof r.short_code === "string" ? r.short_code : null;
        if (id && name) opts.push({ id, name, short_code: shortCode });
      }
      setCourseOptions(opts);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeCourse = useMemo(
    () =>
      courseFilter
        ? courseOptions.find((c) => c.id === courseFilter) ?? null
        : null,
    [courseFilter, courseOptions],
  );

  // Filter actor options by the combobox search box. Matches name OR email,
  // case-insensitive. When the active actor is no longer in the matched set
  // (e.g. user typed in the search), still keep them as the leading option so
  // the selection remains visible.
  const filteredActorOptions = useMemo(() => {
    const q = actorSearch.trim().toLowerCase();
    if (!q) return actorOptions;
    return actorOptions.filter((opt) => {
      const name = (opt.display_name ?? "").toLowerCase();
      const email = opt.email.toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [actorOptions, actorSearch]);

  // Resolve the active actor's display name from the loaded options once
  // they arrive — covers the case where the persisted name is stale (e.g.
  // the teacher updated their display_name since last visit).
  const activeActor = useMemo(() => {
    if (!actorFilter.actorId) return null;
    const fromOptions = actorOptions.find(
      (o) => o.id === actorFilter.actorId,
    );
    if (fromOptions) {
      return {
        id: fromOptions.id,
        name:
          fromOptions.display_name?.trim() && fromOptions.display_name.length
            ? fromOptions.display_name
            : fromOptions.email,
      };
    }
    // Fallback to the persisted name when options haven't loaded yet, or the
    // actor isn't in the top-100 set (e.g. former staff).
    return {
      id: actorFilter.actorId,
      name: actorFilter.actorName ?? actorFilter.actorId,
    };
  }, [actorFilter, actorOptions]);

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
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3"
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
          Course
          <div className="flex items-center gap-1">
            <select
              value={courseFilter}
              onChange={(e) => {
                setCourseFilter(e.target.value);
                setPage(0);
              }}
              className="min-h-[40px] flex-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              title={
                activeCourse
                  ? `Scoped to ${activeCourse.name}`
                  : "Filter by course"
              }
            >
              <option value="">All courses</option>
              {courseOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.short_code ? `${c.name} (${c.short_code})` : c.name}
                </option>
              ))}
            </select>
            {courseFilter && (
              <button
                type="button"
                onClick={() => {
                  setCourseFilter("");
                  setPage(0);
                }}
                title="Clear course filter"
                aria-label="Clear course filter"
                className="min-h-[40px] min-w-[40px] rounded-md border border-slate-300 dark:border-slate-700 px-2 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                ×
              </button>
            )}
          </div>
        </label>
        <label className="text-xs font-medium text-slate-600 dark:text-slate-400 flex flex-col gap-1">
          Actor
          <div className="flex flex-col gap-1">
            {/*
              Typeahead box — hides non-matching options as the user types.
              Native <select> alone gives a basic press-letter-to-jump,
              but a real type-to-filter requires this paired input. We keep
              the visual treatment compact so it doesn't overwhelm the row.
            */}
            <input
              type="text"
              value={actorSearch}
              onChange={(e) => setActorSearch(e.target.value)}
              placeholder="Filter actors…"
              aria-label="Filter actor options"
              className="min-h-[40px] md:min-h-[32px] rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <div className="flex items-center gap-1">
              <select
                value={actorFilter.actorId ?? ""}
                onChange={(e) => {
                  const id = e.target.value;
                  if (!id) {
                    setActorFilter(DEFAULT_ACTOR_FILTER);
                  } else {
                    const opt = actorOptions.find((o) => o.id === id);
                    const name =
                      opt?.display_name?.trim() && opt.display_name.length
                        ? opt.display_name
                        : opt?.email ?? null;
                    setActorFilter({ actorId: id, actorName: name });
                  }
                  setPage(0);
                }}
                aria-label="Filter audit events by actor"
                title={
                  activeActor
                    ? `Scoped to ${activeActor.name}`
                    : "Filter by actor"
                }
                className="min-h-[40px] flex-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">All actors</option>
                {/*
                  Keep the active selection visible even when the typeahead
                  has filtered it out — admins shouldn't lose their scope
                  just because they're searching for someone else.
                */}
                {activeActor &&
                  !filteredActorOptions.some(
                    (o) => o.id === activeActor.id,
                  ) && (
                    <option value={activeActor.id}>{activeActor.name}</option>
                  )}
                {filteredActorOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {actorOptionLabel(opt)}
                  </option>
                ))}
              </select>
              {actorFilter.actorId && (
                <button
                  type="button"
                  onClick={() => {
                    setActorFilter(DEFAULT_ACTOR_FILTER);
                    setActorSearch("");
                    setPage(0);
                  }}
                  title="Clear actor filter"
                  aria-label="Clear actor filter"
                  className="min-h-[40px] min-w-[40px] rounded-md border border-slate-300 dark:border-slate-700 px-2 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        </label>
        <div className="sm:col-span-2 text-xs font-medium text-slate-600 dark:text-slate-400 flex flex-col gap-1.5">
          <span>Date range</span>
          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label="Date range preset"
          >
            {PRESET_CHIPS.map((chip) => {
              const active = dateRange.preset === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => {
                    if (chip.id === "custom") {
                      // Switching into custom: seed today/today if blank so
                      // the inputs don't render with the placeholder gap.
                      const today = todayYmd();
                      setDateRange((prev) =>
                        prev.preset === "custom"
                          ? prev
                          : {
                              preset: "custom",
                              from: prev.from ?? today,
                              to: prev.to ?? today,
                            },
                      );
                    } else {
                      setDateRange({ preset: chip.id });
                    }
                    setPage(0);
                  }}
                  aria-pressed={active}
                  className={
                    "min-h-[40px] md:min-h-[32px] rounded-full px-3 py-1 text-xs font-medium border motion-safe:transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 " +
                    (active
                      ? "bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700"
                      : "bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800")
                  }
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
          {dateRange.preset === "custom" && (
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  From
                  <input
                    type="date"
                    value={dateRange.from ?? ""}
                    onBlur={(e) => {
                      const next = e.target.value || todayYmd();
                      setDateRange((prev) => ({ ...prev, from: next }));
                      setPage(0);
                    }}
                    onChange={(e) => {
                      const next = e.target.value;
                      setDateRange((prev) => ({ ...prev, from: next }));
                    }}
                    className="min-h-[40px] rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </label>
                <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  To
                  <input
                    type="date"
                    value={dateRange.to ?? ""}
                    onBlur={(e) => {
                      const next = e.target.value || todayYmd();
                      setDateRange((prev) => ({ ...prev, to: next }));
                      setPage(0);
                    }}
                    onChange={(e) => {
                      const next = e.target.value;
                      setDateRange((prev) => ({ ...prev, to: next }));
                    }}
                    className="min-h-[40px] rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </label>
              </div>
              {resolvedDateRange.invalid && (
                <span
                  role="alert"
                  className="text-[11px] font-medium text-rose-600 dark:text-rose-400"
                >
                  "From" is after "To" — adjust the dates to filter.
                </span>
              )}
            </div>
          )}
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
              setActorFilter(DEFAULT_ACTOR_FILTER);
              setActorSearch("");
              setDateRange(DEFAULT_DATE_RANGE);
              setCourseFilter("");
              setPage(0);
            }}
            title="Clear action, course, actor, and date-range filters"
            className="min-h-[40px] rounded-md border border-slate-300 dark:border-slate-700 text-sm font-medium px-3 py-1.5 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 motion-safe:transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Clear all filters
          </button>
        </div>
        {(activeActionMeta?.description ||
          activeCourse ||
          activeActor ||
          dateRange.preset !== "all") && (
          <div className="sm:col-span-2 lg:col-span-6 -mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            {dateRange.preset !== "all" && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900"
                title="Active date-range filter"
              >
                {dateRange.preset === "custom"
                  ? `${dateRange.from ?? "—"} → ${dateRange.to ?? "—"}`
                  : PRESET_CHIPS.find((c) => c.id === dateRange.preset)?.label}
              </span>
            )}
            {activeCourse && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900"
                title={`Filtering audit events for ${activeCourse.name}`}
              >
                Scoped to {activeCourse.name}
                {activeCourse.short_code ? (
                  <span className="font-mono text-[10px] text-indigo-500 dark:text-indigo-400">
                    ({activeCourse.short_code})
                  </span>
                ) : null}
              </span>
            )}
            {activeActor && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900"
                title={`Filtering audit events by ${activeActor.name}`}
              >
                Actor: {activeActor.name}
              </span>
            )}
            {activeActionMeta?.description && (
              <span>
                <span className="font-medium text-slate-600 dark:text-slate-300">
                  {activeActionMeta.label}:
                </span>{" "}
                {activeActionMeta.description}{" "}
                <span className="font-mono text-[10px] text-slate-400">
                  ({activeActionMeta.id})
                </span>
              </span>
            )}
          </div>
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
                    body={
                      activeActor
                        ? `No audit events by ${activeActor.name} in this scope. Try widening the date range, switching actors, or clearing filters.`
                        : dateRange.preset !== "all"
                          ? "No audit events in this date range. Try widening the range, picking a different preset, or clearing filters."
                          : "No events match the current filters. Try widening the date range or clearing filters."
                    }
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
                      className={
                        // Lifecycle deletes get a rose tint so a teacher / admin
                        // scanning the page can spot destructive events at a glance.
                        getActionMeta(r.action)?.group === "Lifecycle" ||
                        r.action === "profile.delete"
                          ? "inline-flex items-center rounded-md bg-rose-50 dark:bg-rose-950/40 ring-1 ring-rose-200 dark:ring-rose-900 px-1.5 py-0.5 font-medium text-rose-700 dark:text-rose-300"
                          : "inline-flex items-center rounded-md bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 font-medium text-slate-700 dark:text-slate-200"
                      }
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
                    <DetailsCell action={r.action} details={r.details} />
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
