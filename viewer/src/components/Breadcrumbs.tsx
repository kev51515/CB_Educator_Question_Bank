/**
 * Breadcrumbs
 * ===========
 * The global breadcrumb bar mounted once at the top of the educator content
 * pane (StaffShell `<main>`). It gives every page + subpage a consistent,
 * aesthetic trail with a dedicated "up one level" back control.
 *
 * Three exports:
 *   - `BreadcrumbProvider` — holds a registry of resolved labels for dynamic
 *     URL segments (course / assignment / test / student / topic names).
 *   - `useBreadcrumbLabel(key, label)` — a page calls this once its entity
 *     loads to swap the generic fallback ("Course") for the real name ("SAT").
 *   - `Breadcrumbs` — the bar. Derives its trail synchronously from the URL
 *     (see `lib/breadcrumbs`), so the static portion never flickers and the
 *     bar's height is constant on every route (no layout shift).
 *
 * Layout contract: the bar is `sticky top-0`, a fixed `h-12` (48px), and the
 * shell publishes that height as the `--app-chrome-top` CSS variable so any
 * page-level sticky header / full-height pane can offset itself beneath it.
 * The hook no-ops when no provider is present, so surfaces shared with the
 * (provider-less) student shell stay safe.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  backTargetOf,
  buildEducatorTrail,
  type BreadcrumbLabelMap,
} from "@/lib/breadcrumbs";

// ─── Label registry context ────────────────────────────────────────────────

interface BreadcrumbLabelContextValue {
  labels: BreadcrumbLabelMap;
  setLabel: (key: string, label: string | null) => void;
}

const BreadcrumbLabelContext =
  createContext<BreadcrumbLabelContextValue | null>(null);

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [labels, setLabels] = useState<Record<string, string>>({});

  const setLabel = useCallback((key: string, label: string | null): void => {
    setLabels((prev) => {
      if (label == null || label === "") {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }
      if (prev[key] === label) return prev;
      return { ...prev, [key]: label };
    });
  }, []);

  const value = useMemo<BreadcrumbLabelContextValue>(
    () => ({ labels, setLabel }),
    [labels, setLabel],
  );

  return (
    <BreadcrumbLabelContext.Provider value={value}>
      {children}
    </BreadcrumbLabelContext.Provider>
  );
}

/**
 * Register a human label for a dynamic breadcrumb segment, keyed by the
 * segment's value in the URL (e.g. the course short_code from `useParams`).
 * Call it unconditionally near the top of a page; it no-ops until both `key`
 * and `label` are truthy and cleans the entry up on unmount.
 */
export function useBreadcrumbLabel(
  key: string | null | undefined,
  label: string | null | undefined,
): void {
  const ctx = useContext(BreadcrumbLabelContext);
  const setLabel = ctx?.setLabel;
  useEffect(() => {
    if (!setLabel || !key) return;
    setLabel(key, label ?? null);
    return () => setLabel(key, null);
  }, [setLabel, key, label]);
}

// ─── Icons ──────────────────────────────────────────────────────────────────

function ChevronLeftIcon() {
  return (
    <svg
      aria-hidden
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronSeparator() {
  return (
    <svg
      aria-hidden
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

// ─── Bar ─────────────────────────────────────────────────────────────────────

export function Breadcrumbs() {
  const ctx = useContext(BreadcrumbLabelContext);
  const labels = ctx?.labels;
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const crumbs = useMemo(
    () => buildEducatorTrail(pathname, labels ?? {}),
    [pathname, labels],
  );
  const backTo = useMemo(() => backTargetOf(crumbs), [crumbs]);

  // Non-educator paths produce no trail; render nothing so we never reserve an
  // empty strip.
  if (crumbs.length === 0) return null;

  return (
    <div className="sticky top-0 z-40 flex h-12 shrink-0 items-center gap-1.5 border-b border-slate-200/70 bg-white/80 px-3 backdrop-blur-md motion-reduce:backdrop-blur-none dark:border-slate-800/70 dark:bg-slate-900/80 sm:px-5 lg:px-7 print:hidden">
      <button
        type="button"
        aria-label="Go back"
        disabled={!backTo}
        onClick={() => {
          if (backTo) navigate(backTo);
        }}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 motion-safe:transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <ChevronLeftIcon />
      </button>

      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="no-scrollbar flex items-center gap-0.5 overflow-x-auto">
          {crumbs.map((crumb, i) => {
            const isLast = i === crumbs.length - 1;
            return (
              <li
                key={`${i}-${crumb.label}`}
                className="flex shrink-0 items-center gap-0.5"
              >
                {i > 0 && (
                  <span
                    aria-hidden
                    className="px-0.5 text-slate-300 dark:text-slate-600"
                  >
                    <ChevronSeparator />
                  </span>
                )}
                {crumb.to && !isLast ? (
                  <Link
                    to={crumb.to}
                    className="max-w-[36vw] truncate rounded-md px-1.5 py-1 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 motion-safe:transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:max-w-[14rem]"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    aria-current={isLast ? "page" : undefined}
                    className={[
                      "max-w-[44vw] truncate px-1.5 py-1 text-sm sm:max-w-[16rem]",
                      isLast
                        ? "font-semibold text-slate-900 dark:text-slate-100"
                        : "font-medium text-slate-400 dark:text-slate-500",
                    ].join(" ")}
                  >
                    {crumb.label}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}
