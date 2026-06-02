/**
 * CourseMaterialsList
 * ===================
 * Compact read-only materials list for a single course. Reusable from any
 * student-side surface that knows the course id — pass it as a prop (no URL
 * params required) so the same component can render inside a course
 * dashboard, a sidebar, or a future bottom-of-page section.
 *
 * Each row is a single anchor:
 *   - kind='file' → href = signed download URL (mints via useStudentMaterials)
 *   - kind='link' → href = the canonical URL the teacher saved
 *
 * Files open with `download` + new tab; links open in a new tab with
 * `rel=noopener noreferrer` so the student's session isn't accessible from
 * the destination.
 *
 * Search + filter + sort (Wave 22)
 * --------------------------------
 *   - Search: case-insensitive substring over title + description (transient,
 *     not persisted)
 *   - Filter pills: All / Links / Files with live counts (kinds in this
 *     surface are only 'file' | 'link' — `StudentMaterialKind` in
 *     useStudentMaterials.ts)
 *   - Sort: most-recent (default) / oldest / title (locale-aware)
 *   - Persisted: filter + sort under
 *     localStorage["student.materialsList.view:<userId>:<courseId>"]
 *   - Empty filtered state: "No materials match" + Show all CTA
 */
import { useEffect, useMemo, useState } from "react";
import { useStudentMaterials, type StudentMaterial, type StudentMaterialKind } from "./useStudentMaterials";
import { SkeletonRows } from "../components/Skeleton";
import { supabase } from "../lib/supabase";

interface CourseMaterialsListProps {
  courseId: string;
}

type FilterValue = "all" | StudentMaterialKind;
type SortValue = "recent" | "oldest" | "title";

interface PersistedView {
  filter: FilterValue;
  sort: SortValue;
}

const DEFAULT_VIEW: PersistedView = { filter: "all", sort: "recent" };

const FILTER_PILLS: ReadonlyArray<{ value: FilterValue; label: string }> = [
  { value: "all", label: "All" },
  { value: "link", label: "Links" },
  { value: "file", label: "Files" },
];

function isFilterValue(v: unknown): v is FilterValue {
  return v === "all" || v === "link" || v === "file";
}

function isSortValue(v: unknown): v is SortValue {
  return v === "recent" || v === "oldest" || v === "title";
}

function loadView(key: string | null): PersistedView {
  if (!key) return DEFAULT_VIEW;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return DEFAULT_VIEW;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_VIEW;
    const obj = parsed as Record<string, unknown>;
    return {
      filter: isFilterValue(obj.filter) ? obj.filter : DEFAULT_VIEW.filter,
      sort: isSortValue(obj.sort) ? obj.sort : DEFAULT_VIEW.sort,
    };
  } catch {
    return DEFAULT_VIEW;
  }
}

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  const rounded = n >= 10 || i === 0 ? Math.round(n) : Math.round(n * 10) / 10;
  return `${rounded} ${units[i]}`;
}

interface RowProps {
  material: StudentMaterial;
}

function MaterialRow({ material }: RowProps) {
  const isFile = material.kind === "file";
  const href = isFile ? material.download_url : material.url;
  const disabled = !href;

  const hostname = (raw: string | null): string => {
    if (!raw) return "";
    try {
      return new URL(raw).hostname;
    } catch {
      return "";
    }
  };
  const meta = isFile ? formatBytes(material.file_size) : hostname(material.url);

  const body = (
    <>
      <span
        aria-hidden
        className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-100 dark:ring-indigo-900"
      >
        {isFile ? "📄" : "🔗"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
          {material.title}
        </span>
        {material.description && (
          <span className="mt-0.5 block text-xs text-slate-600 dark:text-slate-400 line-clamp-2 whitespace-pre-wrap">
            {material.description}
          </span>
        )}
        {meta && (
          <span className="mt-0.5 block text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {meta}
          </span>
        )}
      </span>
    </>
  );

  if (disabled || !href) {
    return (
      <li
        aria-disabled="true"
        className="flex items-start gap-3 rounded-xl bg-white/60 dark:bg-slate-900/40 ring-1 ring-slate-200 dark:ring-slate-800 px-3 py-2.5 opacity-60"
        title="Link unavailable"
      >
        {body}
      </li>
    );
  }

  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        download={isFile ? material.title : undefined}
        className="flex items-start gap-3 rounded-xl bg-white/85 dark:bg-slate-900/70 ring-1 ring-slate-200 dark:ring-slate-800 px-3 py-2.5 shadow-sm hover:ring-indigo-300 dark:hover:ring-indigo-700 hover:bg-white dark:hover:bg-slate-900 transition-colors motion-safe:transition-colors"
      >
        {body}
      </a>
    </li>
  );
}

export function CourseMaterialsList({ courseId }: CourseMaterialsListProps) {
  const { materials, loading, error } = useStudentMaterials(courseId);

  // Resolve persistence key once user id is known. Stored format:
  // `student.materialsList.view:<userId>:<courseId>`.
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!cancelled) setUserId(data.user?.id ?? null);
      } catch {
        if (!cancelled) setUserId(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const storageKey = userId ? `student.materialsList.view:${userId}:${courseId}` : null;

  const [view, setView] = useState<PersistedView>(DEFAULT_VIEW);
  const [viewHydrated, setViewHydrated] = useState(false);

  // Hydrate from localStorage once we know the key.
  useEffect(() => {
    setView(loadView(storageKey));
    setViewHydrated(true);
  }, [storageKey]);

  // Persist when view changes (after hydration, only when key is available).
  useEffect(() => {
    if (!viewHydrated || !storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(view));
    } catch {
      // Quota or privacy-mode failure — silently ignore; view stays in memory.
    }
  }, [view, viewHydrated, storageKey]);

  const [query, setQuery] = useState("");
  const trimmedQuery = query.trim();
  const queryActive = trimmedQuery.length > 0;
  const filterActive = view.filter !== "all";

  // Per-kind counts for pill labels — computed from the full list so the
  // numbers don't change as the user filters.
  const counts = useMemo(() => {
    let link = 0;
    let file = 0;
    for (const m of materials) {
      if (m.kind === "link") link += 1;
      else if (m.kind === "file") file += 1;
    }
    return { all: materials.length, link, file };
  }, [materials]);

  const visible = useMemo(() => {
    const needle = trimmedQuery.toLowerCase();
    const filtered = materials.filter((m) => {
      if (view.filter !== "all" && m.kind !== view.filter) return false;
      if (!needle) return true;
      const hay = `${m.title}\n${m.description ?? ""}`.toLowerCase();
      return hay.includes(needle);
    });
    const sorted = [...filtered];
    if (view.sort === "title") {
      sorted.sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true }),
      );
    } else if (view.sort === "oldest") {
      sorted.sort((a, b) => a.created_at.localeCompare(b.created_at));
    } else {
      // recent (default)
      sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
    return sorted;
  }, [materials, view.filter, view.sort, trimmedQuery]);

  // Live-region announcement for the active filter + result count.
  const announce = (() => {
    if (loading || error || materials.length === 0) return "";
    const activeLabel =
      FILTER_PILLS.find((p) => p.value === view.filter)?.label ?? "All";
    const count = visible.length;
    const itemWord = count === 1 ? "material" : "materials";
    if (queryActive) {
      return `${count} ${itemWord} matching "${trimmedQuery}" in ${activeLabel}`;
    }
    return `Showing ${count} ${itemWord} (${activeLabel})`;
  })();

  const showAll = () => {
    setView((v) => ({ ...v, filter: "all" }));
    setQuery("");
  };

  return (
    <section aria-labelledby="course-materials-title" className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2
          id="course-materials-title"
          className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
        >
          Materials
        </h2>
        {materials.length > 0 && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {materials.length} {materials.length === 1 ? "item" : "items"}
          </span>
        )}
      </div>

      {/* Controls row — only render once we have materials to filter. */}
      {!loading && !error && materials.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search materials…"
                aria-label="Search materials"
                className="w-full h-10 rounded-xl bg-white/85 dark:bg-slate-900/70 ring-1 ring-slate-200 dark:ring-slate-800 px-3 pr-9 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:focus:ring-indigo-600 motion-safe:transition-colors"
              />
              {queryActive && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute inset-y-0 right-0 inline-flex items-center justify-center w-9 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 motion-safe:transition-colors"
                >
                  <span aria-hidden>×</span>
                </button>
              )}
            </div>
            <label className="inline-flex items-center gap-2 shrink-0">
              <span className="sr-only">Sort materials</span>
              <select
                value={view.sort}
                onChange={(e) => {
                  const next = e.target.value;
                  if (isSortValue(next)) setView((v) => ({ ...v, sort: next }));
                }}
                aria-label="Sort materials"
                className="h-10 rounded-xl bg-white/85 dark:bg-slate-900/70 ring-1 ring-slate-200 dark:ring-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:focus:ring-indigo-600 motion-safe:transition-colors"
              >
                <option value="recent">Most recent</option>
                <option value="oldest">Oldest first</option>
                <option value="title">Title (A–Z)</option>
              </select>
            </label>
          </div>

          <div
            role="tablist"
            aria-label="Filter materials by type"
            className="flex flex-wrap gap-1.5"
          >
            {FILTER_PILLS.map((pill) => {
              const active = view.filter === pill.value;
              const count = counts[pill.value];
              return (
                <button
                  key={pill.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() =>
                    setView((v) => ({ ...v, filter: pill.value }))
                  }
                  className={[
                    "inline-flex items-center gap-1.5 min-h-10 px-3 rounded-full text-sm ring-1 motion-safe:transition-colors",
                    active
                      ? "bg-indigo-600 text-white ring-indigo-600 hover:bg-indigo-700"
                      : "bg-white/70 dark:bg-slate-900/50 text-slate-700 dark:text-slate-300 ring-slate-200 dark:ring-slate-800 hover:bg-white dark:hover:bg-slate-900",
                  ].join(" ")}
                >
                  <span>{pill.label}</span>
                  <span
                    className={[
                      "inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[11px] font-medium",
                      active
                        ? "bg-white/20 text-white"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300",
                    ].join(" ")}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      {loading ? (
        <div className="py-2">
          <SkeletonRows count={4} />
        </div>
      ) : error ? (
        <div
          role="alert"
          className="rounded-xl bg-rose-50 dark:bg-rose-950/40 ring-1 ring-rose-200 dark:ring-rose-900 px-4 py-3 text-sm text-rose-700 dark:text-rose-300"
        >
          {error}
        </div>
      ) : materials.length === 0 ? (
        <div className="rounded-2xl bg-white/70 dark:bg-slate-900/50 ring-1 ring-dashed ring-slate-300 dark:ring-slate-700 px-6 py-6 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No materials posted yet.
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl bg-white/70 dark:bg-slate-900/50 ring-1 ring-dashed ring-slate-300 dark:ring-slate-700 px-6 py-6 text-center space-y-2">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            No materials match
            {queryActive ? <> “{trimmedQuery}”</> : null}
            {filterActive && queryActive ? " in " : filterActive ? " " : ""}
            {filterActive ? (
              <span className="lowercase">
                {FILTER_PILLS.find((p) => p.value === view.filter)?.label}
              </span>
            ) : null}
            .
          </p>
          <button
            type="button"
            onClick={showAll}
            className="inline-flex items-center justify-center min-h-10 px-3 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 motion-safe:transition-colors"
          >
            Show all
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((m) => (
            <MaterialRow key={m.id} material={m} />
          ))}
        </ul>
      )}
    </section>
  );
}
