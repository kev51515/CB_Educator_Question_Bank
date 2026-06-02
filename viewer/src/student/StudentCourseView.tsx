/**
 * StudentCourseView
 * =================
 * Read-only student view of a single course's modules. Reached via
 * `/courses/:short` (where `:short` is the course `short_code`). Intentionally
 * minimal — students aren't editing anything here, they're orienting to what
 * the course contains.
 *
 * MVP scope:
 *   • Fetch course by short_code (RLS limits to courses the student is
 *     enrolled in).
 *   • List published `course_modules` ordered by position.
 *   • For each module, list its published `module_items` (assignments,
 *     headers, links, pages, files) with a type icon + clickable title
 *     where applicable.
 *   • Assignment items link to `/assignment/:id/take`. Link items open in a
 *     new tab. Header items render as a small subheading. Page/file rows
 *     render their title statically (the v1 student-facing renderer for
 *     pages/files is deferred — clicking shows a toast).
 *   • Locked modules (opens_at in the future) render a lock icon + "Unlocks
 *     <date>" callout and items are inert.
 *
 * Deliberately does NOT reuse the teacher ModulesPage — that surface owns
 * drag-and-drop, inline edit, lock-until, bulk select, etc. We only need
 * the read shape.
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Skeleton, SkeletonRows } from "../components/Skeleton";
import { useToast } from "../components/Toast";
import { ROUTES, assignmentTakePath } from "../lib/routes";

interface CourseRow {
  id: string;
  short_code: string;
  name: string;
  description: string | null;
}

interface ModuleItemRow {
  id: string;
  position: number;
  item_type: "assignment" | "header" | "link" | "page" | "file";
  item_ref_id: string | null;
  title: string;
  url: string | null;
  indent: number;
  published: boolean;
}

interface ModuleRow {
  id: string;
  name: string;
  position: number;
  published: boolean;
  opens_at: string | null;
  module_items: ModuleItemRow[];
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Failed to load course.";
}

function isLocked(opens_at: string | null): boolean {
  if (!opens_at) return false;
  return new Date(opens_at).getTime() > Date.now();
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function ItemIcon({ type }: { type: ModuleItemRow["item_type"] }): JSX.Element {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (type) {
    case "assignment":
      return (
        <svg {...common}>
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      );
    case "link":
      return (
        <svg {...common}>
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      );
    case "page":
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      );
    case "file":
      return (
        <svg {...common}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="18" x2="20" y2="18" />
        </svg>
      );
  }
}

interface ModuleItemRowProps {
  item: ModuleItemRow;
  locked: boolean;
}

function ModuleItemRowView({ item, locked }: ModuleItemRowProps) {
  const navigate = useNavigate();
  const toast = useToast();

  if (!item.published) return null;

  const indent = Math.min(item.indent, 5);
  const baseClass =
    "w-full min-h-[40px] flex items-center gap-3 px-3 py-2 rounded-md text-sm";
  const interactiveClass = locked
    ? "text-slate-400 dark:text-slate-600 cursor-not-allowed"
    : "text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800";

  if (item.item_type === "header") {
    return (
      <div
        className="px-3 py-2 mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
        style={{ paddingLeft: `${0.75 + indent * 1.5}rem` }}
      >
        {item.title}
      </div>
    );
  }

  if (item.item_type === "assignment" && item.item_ref_id) {
    return (
      <button
        type="button"
        disabled={locked}
        onClick={() => navigate(assignmentTakePath(item.item_ref_id ?? ""))}
        className={`${baseClass} ${interactiveClass} text-left`}
        style={{ paddingLeft: `${0.75 + indent * 1.5}rem` }}
        aria-label={`Open assignment ${item.title}`}
      >
        <ItemIcon type={item.item_type} />
        <span className="flex-1 truncate">{item.title}</span>
      </button>
    );
  }

  if (item.item_type === "link" && item.url) {
    if (locked) {
      return (
        <div
          className={`${baseClass} ${interactiveClass}`}
          style={{ paddingLeft: `${0.75 + indent * 1.5}rem` }}
        >
          <ItemIcon type={item.item_type} />
          <span className="flex-1 truncate">{item.title}</span>
        </div>
      );
    }
    return (
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`${baseClass} ${interactiveClass}`}
        style={{ paddingLeft: `${0.75 + indent * 1.5}rem` }}
      >
        <ItemIcon type={item.item_type} />
        <span className="flex-1 truncate">{item.title}</span>
      </a>
    );
  }

  return (
    <button
      type="button"
      disabled={locked}
      onClick={() =>
        locked
          ? undefined
          : toast.info(`${item.title} — viewer coming soon`)
      }
      className={`${baseClass} ${interactiveClass} text-left`}
      style={{ paddingLeft: `${0.75 + indent * 1.5}rem` }}
    >
      <ItemIcon type={item.item_type} />
      <span className="flex-1 truncate">{item.title}</span>
    </button>
  );
}

export function StudentCourseView(): JSX.Element {
  const params = useParams<{ short: string }>();
  const navigate = useNavigate();
  const short = (params.short ?? "").toUpperCase();

  const [course, setCourse] = useState<CourseRow | null>(null);
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const { data: courseData, error: courseError } = await supabase
          .from("courses")
          .select("id, short_code, name, description")
          .eq("short_code", short)
          .maybeSingle();
        if (cancelled) return;
        if (courseError) {
          setError(courseError.message);
          setLoading(false);
          return;
        }
        if (!courseData) {
          setError("Course not found or you don't have access.");
          setLoading(false);
          return;
        }
        const courseRow = courseData as CourseRow;
        setCourse(courseRow);

        const { data: moduleData, error: moduleError } = await supabase
          .from("course_modules")
          .select(
            "id, name, position, published, opens_at, module_items(id, position, item_type, item_ref_id, title, url, indent, published)",
          )
          .eq("class_id", courseRow.id)
          .eq("published", true)
          .order("position", { ascending: true });
        if (cancelled) return;
        if (moduleError) {
          setError(moduleError.message);
          setLoading(false);
          return;
        }

        const rows = ((moduleData ?? []) as unknown as ModuleRow[]).map(
          (m) => ({
            ...m,
            module_items: [...(m.module_items ?? [])].sort(
              (a, b) => a.position - b.position,
            ),
          }),
        );
        setModules(rows);
        setLoading(false);
      } catch (err: unknown) {
        if (cancelled) return;
        setError(getErrorMessage(err));
        setLoading(false);
      }
    };
    if (short) void load();
    else {
      setError("Missing course code.");
      setLoading(false);
    }
    return () => {
      cancelled = true;
    };
  }, [short]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50 to-sky-100 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <button
          type="button"
          onClick={() => navigate(ROUTES.HOME)}
          className="min-h-[40px] inline-flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
        >
          <span aria-hidden>←</span> Back
        </button>

        {loading && (
          <div className="space-y-3">
            <Skeleton className="h-8 w-1/2 rounded" />
            <SkeletonRows count={4} />
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-rose-200 dark:ring-rose-900 p-6 text-center space-y-2">
            <h2 className="text-base font-semibold text-rose-700 dark:text-rose-300">
              Couldn't open this course
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">{error}</p>
          </div>
        )}

        {!loading && !error && course && (
          <>
            <header className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-indigo-600 dark:text-indigo-400 font-medium">
                Course · {course.short_code}
              </p>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                {course.name}
              </h1>
              {course.description && (
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {course.description}
                </p>
              )}
            </header>

            {modules.length === 0 ? (
              <div className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 p-8 text-center space-y-2">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  No modules yet
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Your teacher hasn't published any modules in this course.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {modules.map((m) => {
                  const locked = isLocked(m.opens_at);
                  return (
                    <section
                      key={m.id}
                      className="rounded-2xl bg-white/85 dark:bg-slate-900/70 ring-1 ring-slate-200 dark:ring-slate-800 p-4"
                    >
                      <header className="flex items-center justify-between gap-3 mb-2 px-2">
                        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                          {m.name}
                        </h2>
                        {locked && m.opens_at && (
                          <span
                            className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 rounded-full px-2 py-0.5"
                            aria-label={`Locked until ${formatDate(m.opens_at)}`}
                          >
                            <svg
                              width={12}
                              height={12}
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={2}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden
                            >
                              <rect x="3" y="11" width="18" height="11" rx="2" />
                              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                            Unlocks {formatDate(m.opens_at)}
                          </span>
                        )}
                      </header>
                      {m.module_items.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                          No items in this module.
                        </p>
                      ) : (
                        <ul className="space-y-0.5">
                          {m.module_items.map((it) => (
                            <li key={it.id}>
                              <ModuleItemRowView item={it} locked={locked} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
