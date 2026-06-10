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
import { supabase } from "@/lib/supabase";
import { DuplicateCourseModal } from "@/teacher/DuplicateCourseModal";
import { ClassFormModal, type EditableClass } from "@/teacher/ClassFormModal";
import { ConfirmDialog } from "@/teacher/ConfirmDialog";
import {
  courseTypeLabel,
  isPickleball,
  normalizeCourseType,
  type CourseType,
} from "@/teacher/useTeacherClasses";
import {
  CourseCard,
  EmptyState,
  KebabMenu,
  useToast,
  useOptimistic,
  type KebabMenuOption,
} from "@/components";
import { SkeletonCard } from "@/components/Skeleton";
import { useProfile } from "@/lib/profile";
import { useDomain } from "@/lib/DomainProvider";
import { DOMAINS, DOMAIN_VOCAB, domainOf, type Domain } from "@/lib/domain";
import { coursePath, courseModulesPath } from "@/lib/routes";
import { COURSE_DND_MIME, useCourseOrganization, type CourseTag } from "./courseOrg";
import { CourseOrgSidebar, type FolderCounts } from "./CourseOrgSidebar";
import { CourseTagFilterBar } from "./CourseTagFilterBar";
import { CourseOrganizeModal } from "./CourseOrganizeModal";
import { TagChip } from "./CourseOrgBits";

type CourseView = "grid" | "list";
const VIEW_KEY = "staff.courses.view";
function readView(): CourseView {
  try {
    return window.localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

// Domain focus filter — defaults to the user's active domain, persisted per
// user. Composes ON TOP of the scope (active/archived/templates), folder, and
// tag filters. "all" is the escape hatch.
type DomainFilter = "all" | Domain;
const DOMAIN_FILTER_PREFIX = "dashboard.domainFilter:";

function asDomainFilter(raw: unknown): DomainFilter | null {
  if (raw === "all") return "all";
  if (raw === "academic" || raw === "counseling" || raw === "coaching") {
    return raw;
  }
  return null;
}
function loadDomainFilter(userId: string): DomainFilter | null {
  if (!userId || typeof window === "undefined") return null;
  try {
    return asDomainFilter(
      window.localStorage.getItem(`${DOMAIN_FILTER_PREFIX}${userId}`),
    );
  } catch {
    return null;
  }
}
function saveDomainFilter(userId: string, value: DomainFilter): void {
  if (!userId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${DOMAIN_FILTER_PREFIX}${userId}`, value);
  } catch {
    /* quota / disabled storage */
  }
}

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
  course_type: string;
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
  course_type: string | null;
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
  const [inlineType, setInlineType] = useState<CourseType>("class");
  const inlineInputRef = useRef<HTMLInputElement | null>(null);

  const { profile } = useProfile();
  const { domain: activeDomain } = useDomain();
  const navigate = useNavigate();
  const toast = useToast();

  // Per-teacher organization layer (folders + tags, migration 0188).
  const orgApi = useCourseOrganization(profile?.id);
  const { org } = orgApi;
  const [folderFilter, setFolderFilter] = useState<string>("all"); // "all" | "unfiled" | folderId
  const [tagFilter, setTagFilter] = useState<Set<string>>(() => new Set());
  const [view, setViewState] = useState<CourseView>(readView);
  const setView = useCallback((v: CourseView) => {
    setViewState(v);
    try {
      window.localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  }, []);
  const [organizeTarget, setOrganizeTarget] = useState<AdminClass | null>(null);

  // Domain focus filter. `null` = not yet hydrated; resolved by the effect
  // below to the persisted choice, else the active domain (focus mode).
  const userId = profile?.id ?? "";
  const [domainFilter, setDomainFilterState] = useState<DomainFilter | null>(
    null,
  );

  // Which domains actually have at least one course (across all scopes) —
  // drives the chip row so we never show a chip that yields nothing.
  const domainsWithCourses = useMemo(() => {
    const present = new Set<Domain>();
    for (const c of classes) present.add(domainOf(c.course_type));
    return DOMAINS.filter((d) => present.has(d));
  }, [classes]);

  useEffect(() => {
    if (!userId) {
      setDomainFilterState(null);
      return;
    }
    if (classes.length === 0) return; // wait for courses before resolving
    const present = new Set(domainsWithCourses);
    const stored = loadDomainFilter(userId);
    if (stored && (stored === "all" || present.has(stored))) {
      setDomainFilterState(stored);
      return;
    }
    setDomainFilterState(present.has(activeDomain) ? activeDomain : "all");
  }, [userId, classes.length, domainsWithCourses, activeDomain]);

  const selectDomainFilter = useCallback(
    (value: DomainFilter) => {
      setDomainFilterState(value);
      if (userId) saveDomainFilter(userId, value);
    },
    [userId],
  );
  const effectiveDomainFilter: DomainFilter = domainFilter ?? "all";

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
            course_type: inlineType,
          })
          .select("id, short_code")
          .single();
        if (!insertError && data) {
          toast.success("Course created");
          setInlineCreating(false);
          setInlineName("");
          setInlineType("class");
          void refresh();
          const shortCode = data.short_code as string | null;
          // Counseling courses land on their default tab (Caseload) via the
          // bare course URL; classes go straight to Modules.
          if (shortCode) {
            navigate(
              inlineType === "counseling" || isPickleball(inlineType)
                ? coursePath(shortCode)
                : courseModulesPath(shortCode),
            );
          }
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
          "id, short_code, name, description, join_code, archived, is_template, course_type, created_at, teacher_id, teacher:profiles!courses_teacher_id_fkey(display_name, email), course_memberships(count), assignments(count)",
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
        course_type: normalizeCourseType(row.course_type),
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
      if (
        effectiveDomainFilter !== "all" &&
        domainOf(c.course_type) !== effectiveDomainFilter
      ) {
        return false;
      }
      if (!q) return true;
      const haystack = `${c.name} ${c.teacher_name ?? ""} ${c.teacher_email}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [classes, search, filter, effectiveDomainFilter]);

  // Folder counts reflect the current scope+search (independent of which folder
  // or tags are selected) so the rail shows a stable distribution.
  const folderCounts = useMemo<FolderCounts>(() => {
    const byFolder: Record<string, number> = {};
    let unfiled = 0;
    for (const c of filtered) {
      const fid = org.folderOf.get(c.id);
      if (fid) byFolder[fid] = (byFolder[fid] ?? 0) + 1;
      else unfiled += 1;
    }
    return { all: filtered.length, unfiled, byFolder };
  }, [filtered, org.folderOf]);

  // The grid: scope+search, then the selected folder, then any-of the tag filter.
  const visible = useMemo(() => {
    return filtered.filter((c) => {
      if (folderFilter === "unfiled" && org.folderOf.has(c.id)) return false;
      if (folderFilter !== "all" && folderFilter !== "unfiled" && org.folderOf.get(c.id) !== folderFilter)
        return false;
      if (tagFilter.size > 0) {
        const ts = org.tagsOf.get(c.id) ?? [];
        if (!ts.some((t) => tagFilter.has(t))) return false;
      }
      return true;
    });
  }, [filtered, folderFilter, tagFilter, org.folderOf, org.tagsOf]);

  const tagById = useMemo(() => new Map(org.tags.map((t) => [t.id, t])), [org.tags]);
  const tagsForCourse = useCallback(
    (id: string): CourseTag[] =>
      (org.tagsOf.get(id) ?? [])
        .map((tid) => tagById.get(tid))
        .filter((t): t is CourseTag => !!t),
    [org.tagsOf, tagById],
  );

  const toggleTagFilter = useCallback((id: string) => {
    setTagFilter((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ---- drag a course into a folder (native HTML5 DnD) -----------------------
  // `draggingId` powers the source card's "dragging" visual; it's also a proxy
  // for "a course drag is in flight" so the folder rail only lights up while a
  // course is actually moving.
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const onCourseDragStart = useCallback(
    (course: AdminClass, e: React.DragEvent) => {
      e.dataTransfer.setData(COURSE_DND_MIME, course.id);
      e.dataTransfer.effectAllowed = "move";
      setDraggingId(course.id);
    },
    [],
  );
  const onCourseDragEnd = useCallback(() => setDraggingId(null), []);

  const onDropCourse = useCallback(
    (courseId: string, folderId: string | null) => {
      setDraggingId(null);
      // No-op if it's already where it landed (avoids a pointless toast).
      const current = org.folderOf.get(courseId) ?? null;
      if (current === folderId) return;
      void orgApi.setCourseFolder(courseId, folderId);
      const folderName = folderId
        ? (org.folders.find((f) => f.id === folderId)?.name ?? "folder")
        : null;
      if (folderName) toast.success(`Moved to ${folderName}`);
      else toast.success("Removed from folder");
    },
    [org.folderOf, org.folders, orgApi, toast],
  );

  // The inline "create a course" card — shared by the grid and list layouts.
  const inlineCreateCard = (
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
        <div className="grid grid-cols-2 gap-2">
          {([
            { value: "class", title: "Class", blurb: "SAT prep" },
            { value: "counseling", title: "Counseling", blurb: "College advising" },
            { value: "pickleball_player", title: "Pickleball: Players", blurb: "Coach players" },
            { value: "pickleball_coach", title: "Pickleball: Coaches", blurb: "Develop coaches" },
          ] as const).map((opt) => {
            const active = inlineType === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={active}
                disabled={inlineBusy}
                onClick={() => setInlineType(opt.value)}
                className={`text-left rounded-lg border px-2.5 py-1.5 transition-colors disabled:opacity-50 ${
                  active
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 ring-1 ring-indigo-500"
                    : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700"
                }`}
              >
                <span className="block text-xs font-semibold text-slate-900 dark:text-slate-100">
                  {opt.title}
                </span>
                <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                  {opt.blurb}
                </span>
              </button>
            );
          })}
        </div>
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
  );

  return (
    <div className="max-w-[1800px] px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            All classes
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Every class across every teacher. Click a row to inspect.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by class or teacher…"
            className="min-w-0 w-full sm:w-auto rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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

      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="lg:w-60 lg:flex-none">
          <CourseOrgSidebar
            folders={org.folders}
            counts={folderCounts}
            selected={folderFilter}
            onSelect={setFolderFilter}
            onCreate={orgApi.createFolder}
            onRename={orgApi.renameFolder}
            onRecolor={orgApi.recolorFolder}
            onDelete={orgApi.deleteFolder}
            onDropCourse={onDropCourse}
            courseDragActive={draggingId !== null}
          />
        </aside>

        <div className="min-w-0 flex-1 space-y-4">
          {domainsWithCourses.length > 1 && (
            <div
              className="flex flex-wrap items-center gap-2"
              role="group"
              aria-label="Filter courses by domain"
            >
              {(["all", ...domainsWithCourses] as const).map((key) => {
                const active = effectiveDomainFilter === key;
                const label =
                  key === "all" ? "All" : DOMAIN_VOCAB[key].homeNoun;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => selectDomainFilter(key)}
                    className={
                      "rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors min-h-[40px] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 " +
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
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
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
            <ViewToggle view={view} onChange={setView} />
          </div>

          <CourseTagFilterBar
            tags={org.tags}
            selected={tagFilter}
            onToggle={toggleTagFilter}
            onClear={() => setTagFilter(new Set())}
            onDelete={(id) => {
              // Drop it from the active filter too, or the (now-gone) id would
              // silently hide every course.
              setTagFilter((cur) => {
                if (!cur.has(id)) return cur;
                const next = new Set(cur);
                next.delete(id);
                return next;
              });
              void orgApi.deleteTag(id);
            }}
          />

          {error && (
            <div role="alert" className="rounded-lg bg-rose-50 dark:bg-rose-950/40 ring-1 ring-rose-200 dark:ring-rose-900 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}

          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <SkeletonCard className="h-44" />
              <SkeletonCard className="h-44" />
              <SkeletonCard className="h-44" />
            </div>
          ) : visible.length === 0 && !inlineCreating ? (
            <EmptyState
              title={
                classes.length === 0
                  ? "No courses yet"
                  : effectiveDomainFilter !== "all" && visible.length === 0
                    ? `No ${DOMAIN_VOCAB[effectiveDomainFilter].homeNoun.toLowerCase()} courses match this view`
                    : "No courses match this view"
              }
              body={
                classes.length === 0
                  ? "Click + Course to create the first one."
                  : effectiveDomainFilter !== "all"
                    ? "Switch to All to see your other courses, or adjust the folder, tags, or scope."
                    : "Try a different folder, clearing the tags, or adjusting the filter."
              }
              cta={
                classes.length === 0
                  ? {
                      label: "+ Course",
                      onClick: () => setInlineCreating(true),
                    }
                  : effectiveDomainFilter !== "all"
                    ? {
                        label: "Show all courses",
                        onClick: () => selectDomainFilter("all"),
                      }
                    : undefined
              }
              framed
            />
          ) : view === "list" ? (
            <div className="space-y-2">
              {inlineCreating && inlineCreateCard}
              {visible.map((c) => (
                <AdminCourseCardRow
                  key={c.id}
                  course={c}
                  view="list"
                  tags={tagsForCourse(c.id)}
                  dragging={draggingId === c.id}
                  onDragStart={(e) => onCourseDragStart(c, e)}
                  onDragEnd={onCourseDragEnd}
                  onNavigate={() => navigate(coursePath(c.short_code))}
                  onEdit={() => setEditTarget(c)}
                  onDuplicate={() => setDuplicateSource({ id: c.id, name: c.name })}
                  onDelete={() => setDeleteTarget(c)}
                  onOrganize={() => setOrganizeTarget(c)}
                  formatDate={formatDate}
                />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {inlineCreating && inlineCreateCard}
              {visible.map((c) => (
                <AdminCourseCardRow
                  key={c.id}
                  course={c}
                  view="grid"
                  tags={tagsForCourse(c.id)}
                  dragging={draggingId === c.id}
                  onDragStart={(e) => onCourseDragStart(c, e)}
                  onDragEnd={onCourseDragEnd}
                  onNavigate={() => navigate(coursePath(c.short_code))}
                  onEdit={() => setEditTarget(c)}
                  onDuplicate={() => setDuplicateSource({ id: c.id, name: c.name })}
                  onDelete={() => setDeleteTarget(c)}
                  onOrganize={() => setOrganizeTarget(c)}
                  formatDate={formatDate}
                />
              ))}
            </div>
          )}
        </div>
      </div>

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

      {organizeTarget && (
        <CourseOrganizeModal
          course={{ id: organizeTarget.id, name: organizeTarget.name }}
          org={org}
          onSetFolder={orgApi.setCourseFolder}
          onCreateFolder={orgApi.createFolder}
          onToggleTag={orgApi.toggleCourseTag}
          onCreateTag={orgApi.createTag}
          onClose={() => setOrganizeTarget(null)}
        />
      )}
    </div>
  );
}

/** Grid / list view switch, persisted to localStorage by the caller. */
function ViewToggle({
  view,
  onChange,
}: {
  view: CourseView;
  onChange: (v: CourseView) => void;
}): JSX.Element {
  return (
    <div className="flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800" role="group" aria-label="Layout">
      {(
        [
          { key: "grid", label: "Grid", icon: <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" /> },
          { key: "list", label: "List", icon: <path d="M8 6h12M8 12h12M8 18h12M3.5 6h.01M3.5 12h.01M3.5 18h.01" /> },
        ] as const
      ).map((opt) => {
        const active = view === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            aria-pressed={active}
            title={`${opt.label} view`}
            onClick={() => onChange(opt.key)}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
              active
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {opt.icon}
            </svg>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * AdminCourseCardRow — per-card wrapper so each card can hold its own
 * optimistic archive state without forcing the whole grid to re-render.
 */
interface AdminCourseCardRowProps {
  course: AdminClass;
  view: CourseView;
  tags: CourseTag[];
  /** True while THIS card is the one being dragged — dims it. */
  dragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onNavigate: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onOrganize: () => void;
  formatDate: (iso: string) => string;
}

function AdminCourseCardRow({
  course,
  view,
  tags,
  dragging,
  onDragStart,
  onDragEnd,
  onNavigate,
  onEdit,
  onDuplicate,
  onDelete,
  onOrganize,
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

  // The card/row element, captured so the grip can use the WHOLE card as the
  // native drag preview (calling setDragImage(cardEl, …)) instead of the tiny
  // grip glyph that would otherwise be the drag source.
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Grip is the ONLY drag source — touching the card body still scrolls the
  // list (the drag-drop-touch polyfill only preventDefault()s touchstart on
  // `draggable` elements, so keeping the card non-draggable preserves scroll).
  const handleGripDragStart = (e: React.DragEvent) => {
    if (cardRef.current) {
      e.dataTransfer.setDragImage(cardRef.current, 24, 24);
    }
    onDragStart(e);
  };

  const grip = (extraClass: string) => (
    <span
      draggable
      role="button"
      tabIndex={0}
      aria-label={`Drag to move ${course.name} into a folder`}
      onDragStart={handleGripDragStart}
      onDragEnd={onDragEnd}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      className={
        "flex-none cursor-grab active:cursor-grabbing touch-none select-none rounded-md p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:text-slate-500 dark:hover:text-slate-300 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 " +
        extraClass
      }
    >
      <svg width="14" height="16" viewBox="0 0 14 16" fill="currentColor" aria-hidden>
        <circle cx="4" cy="3" r="1.5" />
        <circle cx="10" cy="3" r="1.5" />
        <circle cx="4" cy="8" r="1.5" />
        <circle cx="10" cy="8" r="1.5" />
        <circle cx="4" cy="13" r="1.5" />
        <circle cx="10" cy="13" r="1.5" />
      </svg>
    </span>
  );

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
    { label: "Tags & folder…", onSelect: onOrganize },
    { label: "Edit", onSelect: onEdit },
    { label: "Duplicate", onSelect: onDuplicate },
    {
      label: archivedOpt ? "Unarchive" : "Archive",
      onSelect: toggleArchive,
    },
    { label: "Delete…", destructive: true, onSelect: onDelete },
  ];

  const tagChips =
    tags.length > 0 ? (
      <span className="mt-1.5 flex flex-wrap gap-1">
        {tags.map((t) => (
          <TagChip key={t.id} name={t.name} color={t.color} small />
        ))}
      </span>
    ) : null;

  if (view === "list") {
    return (
      <div
        ref={cardRef}
        className={`group flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 ${
          archivedOpt && !course.is_template ? "opacity-70" : ""
        } ${dragging ? "opacity-50 ring-2 ring-indigo-400" : ""}`}
      >
        {grip("self-center")}
        <button
          type="button"
          onClick={onNavigate}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-label={`Open course ${course.name}`}
        >
          <span
            className={`grid h-9 w-9 flex-none place-items-center rounded-lg text-sm font-bold ${
              tone === "indigo"
                ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                : tone === "slate"
                  ? "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                  : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
            }`}
            aria-hidden
          >
            {course.name.trim().charAt(0).toUpperCase() || "?"}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate font-semibold text-slate-900 dark:text-slate-100">
                {course.name}
              </span>
              {course.course_type !== "class" && (
                <span className="flex-none rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {courseTypeLabel(normalizeCourseType(course.course_type))}
                </span>
              )}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span>{course.teacher_name ?? "—"}</span>
              <span aria-hidden>·</span>
              <span>
                {course.member_count} {course.member_count === 1 ? "student" : "students"}
              </span>
              <span aria-hidden>·</span>
              <span>
                {course.assignment_count}{" "}
                {course.assignment_count === 1 ? "assignment" : "assignments"}
              </span>
              {tags.map((t) => (
                <TagChip key={t.id} name={t.name} color={t.color} small />
              ))}
            </span>
          </span>
        </button>
        <span
          className={`flex-none rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            tone === "indigo"
              ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
              : tone === "slate"
                ? "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
          }`}
        >
          {statusLabel}
        </span>
        <div className="flex-none">
          <KebabMenu options={kebab} />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={cardRef}
      className={`relative transition-opacity ${dragging ? "opacity-50" : ""}`}
    >
      {grip(
        "absolute left-2 top-2 z-10 bg-white/90 dark:bg-slate-900/90 ring-1 ring-slate-200 dark:ring-slate-700 shadow-sm",
      )}
    <CourseCard
      paletteSeed={course.id}
      name={course.name}
      description={course.description}
      muted={archivedOpt && !course.is_template}
      onClick={onNavigate}
      ariaLabel={`Open course ${course.name}`}
      tag={
        course.course_type === "class"
          ? undefined
          : courseTypeLabel(normalizeCourseType(course.course_type))
      }
      status={{ label: statusLabel, tone }}
      kebab={kebab}
      meta={
        <span className="block">
          <span className="block">
            <span className="font-medium text-slate-700 dark:text-slate-200">
              {course.teacher_name ?? "—"}
            </span>
            {course.teacher_email && (
              <span className="ml-1 text-slate-500 dark:text-slate-400">
                · {course.teacher_email}
              </span>
            )}
          </span>
          {tagChips}
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
    </div>
  );
}
