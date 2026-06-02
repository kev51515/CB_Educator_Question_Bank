/**
 * AllClassesView
 * ==============
 * Admin "All Classes" tab. Lists every class across every teacher in the
 * system. RLS allows admins to read all rows. Includes:
 *   - Client-side search (filters by class name or teacher name/email)
 *   - Click-through to AdminClassDetail (inline replace, not modal)
 *
 * Embedded counts come straight from PostgREST's `count` modifier on related
 * resources — same pattern useTeacherClasses uses for member_count, but here
 * we add an assignments count too.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { DuplicateCourseModal } from "../teacher/DuplicateCourseModal";
import { ClassFormModal, type EditableClass } from "../teacher/ClassFormModal";
import { ConfirmDialog } from "../teacher/ConfirmDialog";
import {
  CourseCard,
  EmptyState,
  useToast,
  useOptimistic,
  type KebabMenuOption,
} from "../components";
import { SkeletonCard } from "../components/Skeleton";
import { useProfile } from "../lib/profile";
import { coursePath, courseModulesPath } from "../lib/routes";

// Join code generator (same as TeacherConsole's). 8 chars from a confusable-
// excluding alphabet, dash-split for legibility. DB has a unique constraint;
// on collision (23505) we retry with a fresh code.
const JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomFromAlphabet(length: number): string {
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < length; i++) {
    const idx = (buf[i] ?? 0) % JOIN_CODE_ALPHABET.length;
    out += JOIN_CODE_ALPHABET[idx];
  }
  return out;
}
function generateJoinCode(): string {
  return `${randomFromAlphabet(4)}-${randomFromAlphabet(4)}`;
}

export interface AdminClass {
  id: string;
  short_code: string;
  name: string;
  description: string | null;
  join_code: string;
  archived: boolean;
  is_template: boolean;
  created_at: string;
  teacher_id: string;
  teacher_name: string | null;
  teacher_email: string;
  member_count: number;
  assignment_count: number;
}

type AdminClassFilter = "active" | "archived" | "templates";

interface RawClassRow {
  id: string;
  short_code: string;
  name: string;
  description: string | null;
  join_code: string;
  archived: boolean;
  is_template: boolean | null;
  created_at: string;
  teacher_id: string;
  teacher: { display_name: string | null; email: string } | null;
  course_memberships: { count: number }[] | null;
  assignments: { count: number }[] | null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Failed to load classes.";
}

function formatDate(iso: string): string {
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

export function AllClassesView() {
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>("");
  const [filter, setFilter] = useState<AdminClassFilter>("active");
  const [duplicateSource, setDuplicateSource] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [editTarget, setEditTarget] = useState<AdminClass | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminClass | null>(null);
  const [deleteBusy, setDeleteBusy] = useState<boolean>(false);
  // Inline-create state. When non-null an empty card with a focused input
  // appears at the top of the grid; Enter commits, Esc cancels. Same UX as
  // TeacherConsole's InlineCreateCourseRow.
  const [inlineCreating, setInlineCreating] = useState<boolean>(false);
  const [inlineBusy, setInlineBusy] = useState<boolean>(false);
  const [inlineName, setInlineName] = useState<string>("");
  const inlineInputRef = useRef<HTMLInputElement | null>(null);

  const { profile } = useProfile();
  const navigate = useNavigate();
  const toast = useToast();

  // Focus the inline input the moment it appears.
  useEffect(() => {
    if (inlineCreating) inlineInputRef.current?.focus();
  }, [inlineCreating]);

  /**
   * Insert into `public.courses`. DB trigger 0038 fills `short_code`; we
   * supply `join_code` client-side and retry on the unique-constraint
   * collision (errno 23505) up to a small cap. On success, navigate the
   * teacher straight into the new course's Modules tab — same flow as
   * TeacherConsole.
   */
  const onInlineCommit = async (): Promise<void> => {
    if (inlineBusy) return;
    const trimmed = inlineName.trim();
    if (!trimmed) return;
    if (!profile?.id) {
      toast.error("Couldn't create course", "Profile not loaded yet.");
      return;
    }
    setInlineBusy(true);
    try {
      const maxAttempts = 5;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const joinCode = generateJoinCode();
        const { data, error: insertError } = await supabase
          .from("courses")
          .insert({
            teacher_id: profile.id,
            name: trimmed,
            join_code: joinCode,
          })
          .select("id, short_code")
          .single();
        if (!insertError && data) {
          toast.success("Course created");
          setInlineCreating(false);
          setInlineName("");
          void refresh();
          const shortCode = data.short_code as string | null;
          if (shortCode) navigate(courseModulesPath(shortCode));
          return;
        }
        // 23505 = unique violation. Retry with a fresh join code.
        if (insertError && insertError.code === "23505") continue;
        if (insertError) {
          toast.error("Couldn't create course", insertError.message);
          return;
        }
      }
      toast.error(
        "Couldn't create course",
        "Couldn't generate a unique join code. Please try again.",
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create course.";
      toast.error("Couldn't create course", msg);
    } finally {
      setInlineBusy(false);
    }
  };

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from("courses")
        .select(
          "id, short_code, name, description, join_code, archived, is_template, created_at, teacher_id, teacher:profiles!courses_teacher_id_fkey(display_name, email), course_memberships(count), assignments(count)",
        )
        .order("created_at", { ascending: false });

      if (queryError) {
        setError(queryError.message);
        setClasses([]);
        return;
      }

      const rows = (data ?? []) as unknown as RawClassRow[];
      const mapped: AdminClass[] = rows.map((row) => ({
        id: row.id,
        short_code: row.short_code,
        name: row.name,
        description: row.description,
        join_code: row.join_code,
        archived: row.archived,
        is_template: row.is_template ?? false,
        created_at: row.created_at,
        teacher_id: row.teacher_id,
        teacher_name: row.teacher?.display_name ?? null,
        teacher_email: row.teacher?.email ?? "",
        member_count: row.course_memberships?.[0]?.count ?? 0,
        assignment_count: row.assignments?.[0]?.count ?? 0,
      }));
      setClasses(mapped);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
      setClasses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const inFilter = (c: AdminClass): boolean => {
      if (filter === "templates") return c.is_template;
      if (filter === "archived") return c.archived && !c.is_template;
      // active
      return !c.archived && !c.is_template;
    };
    return classes.filter((c) => {
      if (!inFilter(c)) return false;
      if (!q) return true;
      const haystack = `${c.name} ${c.teacher_name ?? ""} ${c.teacher_email}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [classes, search, filter]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            All classes
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Every class across every teacher. Click a row to inspect.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by class or teacher…"
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="button"
            onClick={() => setInlineCreating(true)}
            className="rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-1.5"
          >
            + Course
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Refresh
          </button>
        </div>
      </header>

      <div className="flex items-center gap-2 flex-wrap">
        {(["active", "archived", "templates"] as const).map((key) => {
          const active = filter === key;
          const label =
            key === "active" ? "Active" : key === "archived" ? "Archived" : "Templates";
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={
                "rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors " +
                (active
                  ? "bg-indigo-600 text-white ring-indigo-600"
                  : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 ring-slate-200 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800")
              }
            >
              {label}
            </button>
          );
        })}
      </div>

      {error && (
        <div role="alert" className="rounded-lg bg-rose-50 dark:bg-rose-950/40 ring-1 ring-rose-200 dark:ring-rose-900 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SkeletonCard className="h-44" />
          <SkeletonCard className="h-44" />
          <SkeletonCard className="h-44" />
        </div>
      ) : filtered.length === 0 && !inlineCreating ? (
        <EmptyState
          title={classes.length === 0 ? "No courses yet" : "No courses match this filter"}
          body={
            classes.length === 0
              ? "Click + Course to create the first one."
              : "Try clearing the search or adjusting the filter."
          }
          cta={
            classes.length === 0
              ? {
                  label: "+ Course",
                  onClick: () => setInlineCreating(true),
                }
              : undefined
          }
          framed
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {inlineCreating && (
            <div className="rounded-xl bg-white dark:bg-slate-900 ring-2 ring-indigo-400 shadow-sm p-4 flex flex-col gap-3 min-h-[180px]">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void onInlineCommit();
                }}
                className="flex flex-col gap-3"
              >
                <input
                  ref={inlineInputRef}
                  type="text"
                  value={inlineName}
                  onChange={(e) => setInlineName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setInlineCreating(false);
                      setInlineName("");
                    }
                  }}
                  disabled={inlineBusy}
                  placeholder="Course name — Enter to create, Esc to cancel"
                  className="w-full bg-transparent text-base font-semibold text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none border-b border-slate-200 dark:border-slate-800 pb-1 disabled:opacity-50"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Saved as draft. You'll land on the new course's Modules page.
                </p>
                <div className="flex items-center gap-2 mt-auto">
                  <button
                    type="submit"
                    disabled={inlineBusy || inlineName.trim().length === 0}
                    className="rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-50"
                  >
                    {inlineBusy ? "Creating…" : "Create"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInlineCreating(false);
                      setInlineName("");
                    }}
                    disabled={inlineBusy}
                    className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}
          {filtered.map((c) => (
            <AdminCourseCardRow
              key={c.id}
              course={c}
              onNavigate={() => navigate(coursePath(c.short_code))}
              onEdit={() => setEditTarget(c)}
              onDuplicate={() => setDuplicateSource({ id: c.id, name: c.name })}
              onDelete={() => setDeleteTarget(c)}
              formatDate={formatDate}
            />
          ))}
        </div>
      )}

      <DuplicateCourseModal
        open={!!duplicateSource}
        source={duplicateSource}
        onClose={() => setDuplicateSource(null)}
        onDuplicated={() => void refresh()}
      />

      <ClassFormModal
        open={!!editTarget}
        mode="edit"
        teacherId={profile?.id ?? ""}
        initialClass={
          editTarget
            ? ({
                id: editTarget.id,
                name: editTarget.name,
                description: editTarget.description,
                archived: editTarget.archived,
              } satisfies EditableClass)
            : undefined
        }
        onClose={() => setEditTarget(null)}
        onUpdated={() => {
          setEditTarget(null);
          void refresh();
        }}
      />

      {deleteTarget && (
        <ConfirmDialog
          title="Delete this course?"
          body={
            <p>
              Delete{" "}
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                "{deleteTarget.name}"
              </span>{" "}
              permanently? This removes the course, all modules, assignments,
              attempts, and roster —{" "}
              <span className="font-semibold text-rose-700 dark:text-rose-300">
                irreversibly
              </span>
              .
            </p>
          }
          confirmLabel="Delete course"
          destructive
          busy={deleteBusy}
          onConfirm={async () => {
            if (!deleteTarget) return;
            setDeleteBusy(true);
            try {
              const { error: delError } = await supabase
                .from("courses")
                .delete()
                .eq("id", deleteTarget.id);
              if (delError) {
                toast.error("Couldn't delete", delError.message);
                return;
              }
              toast.success("Course deleted");
              setDeleteTarget(null);
              void refresh();
            } catch (err: unknown) {
              toast.error(
                "Couldn't delete",
                err instanceof Error ? err.message : "Failed to delete course.",
              );
            } finally {
              setDeleteBusy(false);
            }
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

/**
 * AdminCourseCardRow — per-card wrapper so each card can hold its own
 * optimistic archive state without forcing the whole grid to re-render.
 */
interface AdminCourseCardRowProps {
  course: AdminClass;
  onNavigate: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  formatDate: (iso: string) => string;
}

function AdminCourseCardRow({
  course,
  onNavigate,
  onEdit,
  onDuplicate,
  onDelete,
  formatDate,
}: AdminCourseCardRowProps) {
  const [archivedOpt, applyArchive] = useOptimistic<boolean>(course.archived);
  const tone: "emerald" | "slate" | "indigo" = course.is_template
    ? "indigo"
    : archivedOpt
      ? "slate"
      : "emerald";
  const statusLabel = course.is_template
    ? "Template"
    : archivedOpt
      ? "Archived"
      : "Active";

  const toast = useToast();
  const toggleArchive = () => {
    const willArchive = !archivedOpt;
    void applyArchive({
      optimistic: (cur) => !cur,
      commit: async () => {
        const { error: updError } = await supabase
          .from("courses")
          .update({ archived: willArchive })
          .eq("id", course.id);
        if (updError) throw new Error(updError.message);
      },
      successMessage: willArchive ? "Course archived" : "Course reactivated",
      // Only archive → offers Undo. Unarchive is itself an undo.
      successAction: willArchive
        ? {
            label: "Undo",
            onAction: () => {
              void (async () => {
                const { error: undoError } = await supabase
                  .from("courses")
                  .update({ archived: false })
                  .eq("id", course.id);
                if (undoError) {
                  toast.error("Couldn't undo archive", undoError.message);
                  return;
                }
                void applyArchive({
                  optimistic: () => false,
                  commit: async () => {},
                });
              })();
            },
          }
        : undefined,
    });
  };

  const kebab: KebabMenuOption[] = [
    { label: "Open", onSelect: onNavigate },
    { label: "Edit", onSelect: onEdit },
    { label: "Duplicate", onSelect: onDuplicate },
    {
      label: archivedOpt ? "Unarchive" : "Archive",
      onSelect: toggleArchive,
    },
    { label: "Delete…", destructive: true, onSelect: onDelete },
  ];

  return (
    <CourseCard
      paletteSeed={course.id}
      name={course.name}
      description={course.description}
      muted={archivedOpt && !course.is_template}
      onClick={onNavigate}
      ariaLabel={`Open course ${course.name}`}
      status={{ label: statusLabel, tone }}
      kebab={kebab}
      meta={
        <span>
          <span className="font-medium text-slate-700 dark:text-slate-200">
            {course.teacher_name ?? "—"}
          </span>
          {course.teacher_email && (
            <span className="ml-1 text-slate-500 dark:text-slate-400">
              · {course.teacher_email}
            </span>
          )}
        </span>
      }
      metrics={[
        {
          label: course.member_count === 1 ? "student" : "students",
          value: course.member_count,
        },
        {
          label:
            course.assignment_count === 1 ? "assignment" : "assignments",
          value: course.assignment_count,
        },
        { label: "created", value: formatDate(course.created_at) },
      ]}
      footer={
        course.is_template ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
            className="ml-auto rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3 py-1"
          >
            Create from template
          </button>
        ) : undefined
      }
    />
  );
}
