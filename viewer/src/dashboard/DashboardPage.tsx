/**
 * DashboardPage
 * =============
 * Canvas-style staff landing page. Renders the signed-in staff member's
 * courses as a grid of color-banded cards (Published first, Unpublished
 * below). Clicking a card navigates to that course's detail view; quick
 * action icons at the bottom of each card jump straight to assignments /
 * people / announcements.
 *
 * Visuals come from the shared `<CourseCard />` primitive in `@/components`
 * so the same look is used on `/courses` (AllClassesView) — see that file
 * for the admin variant.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProfile } from "@/lib/profile";
import { canAccessQuestionBank } from "@/lib/access";
import { useTeacherClasses, type TeacherClass } from "@/teacher/useTeacherClasses";
import {
  coursePath,
  courseAssignmentsPath,
  coursePeoplePath,
  courseAnnouncementsPath,
  ROUTES,
} from "@/lib/routes";
import { supabase } from "@/lib/supabase";
import { SkeletonCard } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { CourseCard, CardActionIcon } from "@/components/CourseCard";
import { useOptimistic, useToast, type KebabMenuOption } from "@/components";
import { ClassFormModal, type EditableClass } from "@/teacher/ClassFormModal";
import { ConfirmDialog } from "@/teacher/ConfirmDialog";
import { DuplicateCourseModal } from "@/teacher/DuplicateCourseModal";
import {
  AnnouncementFormModal,
  type AnnouncementTargetCourse,
} from "@/teacher/AnnouncementFormModal";
import { NeedsAttentionPanel } from "./NeedsAttentionPanel";
import { TestReleaseNudge } from "./TestReleaseNudge";
import { CohortSummaryWidget } from "./CohortSummaryWidget";

// ---------------------------------------------------------------------------
// Pinned-courses storage
// ---------------------------------------------------------------------------
// Per-user localStorage so each teacher's favorites stick on their machine.
// The stored shape is an ordered array of course IDs (most-recently-pinned
// first); we keep it as an array — not a Set — because order is meaningful
// for sort priority and JSON has no Set primitive. A 50-entry LRU cap is
// generous (teachers won't ever pin that many courses) and protects against
// runaway growth from stale IDs that point at deleted courses.
const PIN_STORAGE_PREFIX = "teacher.dashboard.pinnedCourses:";
const PIN_LRU_CAP = 50;

const pinStorageKey = (userId: string): string =>
  `${PIN_STORAGE_PREFIX}${userId}`;

function loadPinnedCourseIds(userId: string): string[] {
  if (!userId || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(pinStorageKey(userId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Shape-validate: only keep non-empty strings, dedupe, and clamp.
    const seen = new Set<string>();
    const out: string[] = [];
    for (const entry of parsed) {
      if (typeof entry !== "string" || entry.length === 0) continue;
      if (seen.has(entry)) continue;
      seen.add(entry);
      out.push(entry);
      if (out.length >= PIN_LRU_CAP) break;
    }
    return out;
  } catch {
    // Quota / JSON parse errors → graceful empty state. Pins are an
    // enhancement; never let a corrupt cache crash the dashboard.
    return [];
  }
}

function savePinnedCourseIds(userId: string, ids: readonly string[]): void {
  if (!userId || typeof window === "undefined") return;
  try {
    const clamped = ids.slice(0, PIN_LRU_CAP);
    window.localStorage.setItem(
      pinStorageKey(userId),
      JSON.stringify(clamped),
    );
  } catch {
    // QuotaExceededError or storage disabled — silently degrade.
  }
}

// Tiny indigo pin glyph used both inline (in the kebab) and as the overlay
// badge on a pinned card. Sized 14×14 by default; callers can override via
// the `size` prop. `<title>` makes it screen-reader-readable when
// decorative; the overlay variant also wears an `aria-label` on its wrapper.
function PinIcon({
  size = 14,
  className,
  titled,
}: {
  size?: number;
  className?: string;
  titled?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden={titled ? undefined : true}
      role={titled ? "img" : undefined}
    >
      {titled && <title>Pinned</title>}
      {/* Stylised pin: head + diagonal pin body, mirrors Lucide's `pin`. */}
      <path d="M16 3l5 5-4.5 1.5-3 3 2.5 5.5-2 2-5-5L4 20l-1-1 4.5-5L2.5 9 4.5 7l5.5 2.5 3-3L14.5 2 16 3z" />
    </svg>
  );
}

interface DashboardCardProps {
  course: TeacherClass;
  pinned: boolean;
  onEdit: (course: TeacherClass) => void;
  onDuplicate: (course: TeacherClass) => void;
  onDelete: (course: TeacherClass) => void;
  onTogglePin: (course: TeacherClass) => void;
}

function DashboardCard({
  course,
  pinned,
  onEdit,
  onDuplicate,
  onDelete,
  onTogglePin,
}: DashboardCardProps) {
  const navigate = useNavigate();
  const [archivedOpt, applyArchive] = useOptimistic<boolean>(course.archived);
  const goToCourse = () => navigate(coursePath(course.short_code));
  const quickNav = (path: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(path);
  };

  const toast = useToast();
  const toggleArchive = () => {
    const willArchive = !archivedOpt;
    void applyArchive({
      optimistic: (cur) => !cur,
      commit: async () => {
        const { error } = await supabase
          .from("courses")
          .update({ archived: willArchive })
          .eq("id", course.id);
        if (error) throw new Error(error.message);
      },
      successMessage: willArchive ? "Course archived" : "Course reactivated",
      // Only the archive direction gets Undo — unarchiving is already an undo
      // of the previous archive, and stacking would just confuse the user.
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
                // Flip the optimistic state back so the card un-mutes.
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
    { label: "Open", onSelect: goToCourse },
    {
      label: pinned ? "Unpin from top" : "Pin to top",
      onSelect: () => onTogglePin(course),
    },
    { label: "Edit", onSelect: () => onEdit(course) },
    { label: "Duplicate", onSelect: () => onDuplicate(course) },
    {
      label: archivedOpt ? "Unarchive" : "Archive",
      onSelect: toggleArchive,
    },
    { label: "Delete…", destructive: true, onSelect: () => onDelete(course) },
  ];

  return (
    <div className="relative min-w-0">
      {pinned && (
        // Overlay badge — sits over the top-left of the colour band so the
        // pinned status is visible at a glance without changing CourseCard's
        // public API. `pointer-events-none` so the underlying card's click
        // target isn't shadowed; the action lives in the kebab.
        <span
          className="pointer-events-none absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded-full bg-indigo-600/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm ring-1 ring-white/40 dark:ring-slate-900/40"
          aria-label={`${course.name} is pinned to the top`}
        >
          <PinIcon size={10} className="text-white" titled />
          Pinned
        </span>
      )}
      <CourseCard
      paletteSeed={course.id}
      name={course.name}
      description={course.description}
      metrics={[
        {
          label: course.member_count === 1 ? "student" : "students",
          value: course.member_count,
        },
      ]}
      muted={archivedOpt}
      onClick={goToCourse}
      kebab={kebab}
      footer={
        <>
          <CardActionIcon
            label="Assignments"
            onClick={quickNav(courseAssignmentsPath(course.short_code))}
            icon={
              <svg
                width={16}
                height={16}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
            }
          />
          <CardActionIcon
            label="People"
            onClick={quickNav(coursePeoplePath(course.short_code))}
            icon={
              <svg
                width={16}
                height={16}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx={9} cy={7} r={4} />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            }
          />
          <CardActionIcon
            label="Announcements"
            onClick={quickNav(courseAnnouncementsPath(course.short_code))}
            icon={
              <svg
                width={16}
                height={16}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M3 11l18-8v18l-18-8z" />
                <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
              </svg>
            }
          />
        </>
      }
      />
    </div>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { profile } = useProfile();
  // The "release test results" nudge is a test-content surface — gated.
  const canQbank = canAccessQuestionBank(profile?.email);
  const { classes, loading, error, refresh } = useTeacherClasses(
    profile?.id ?? null,
  );
  const [editTarget, setEditTarget] = useState<TeacherClass | null>(null);
  const [duplicateSource, setDuplicateSource] =
    useState<{ id: string; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TeacherClass | null>(null);
  const [deleteBusy, setDeleteBusy] = useState<boolean>(false);
  // M2 broadcast entry point. AnnouncementFormModal supports the multi-
  // course path; this button is the only UI surface today that opens the
  // modal with `allowMultiCourse=true`.
  const [broadcastOpen, setBroadcastOpen] = useState<boolean>(false);

  // -------------------------------------------------------------------------
  // Pinned-courses state
  // -------------------------------------------------------------------------
  // Hydrate from localStorage as soon as we know who the user is. We keep the
  // value as a stable array (sort-order matters) and derive a Set for O(1)
  // membership checks. `null` means "not yet hydrated for this user" so the
  // first render doesn't show stale pins from a previous user on the same
  // browser.
  const userId = profile?.id ?? "";
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!userId) {
      setPinnedIds([]);
      return;
    }
    setPinnedIds(loadPinnedCourseIds(userId));
  }, [userId]);

  // Cross-tab sync: when another tab pins/unpins, mirror the change here
  // instead of waiting for a refresh. Same-tab writes don't fire `storage`
  // (per spec) so this only catches the multi-tab case — exactly what we want.
  useEffect(() => {
    if (!userId || typeof window === "undefined") return;
    const key = pinStorageKey(userId);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== key) return;
      setPinnedIds(loadPinnedCourseIds(userId));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [userId]);

  const pinnedSet = useMemo(() => new Set(pinnedIds), [pinnedIds]);

  const togglePin = useCallback(
    (course: TeacherClass) => {
      if (!userId) return;
      setPinnedIds((current) => {
        const isPinned = current.includes(course.id);
        // Most-recently-pinned bubbles to the front so the visible order
        // matches the user's mental model ("I just pinned this, it should
        // be first").
        const next = isPinned
          ? current.filter((id) => id !== course.id)
          : [course.id, ...current.filter((id) => id !== course.id)].slice(
              0,
              PIN_LRU_CAP,
            );
        savePinnedCourseIds(userId, next);
        return next;
      });
    },
    [userId],
  );

  // Sort: pinned-first within each section, preserving the existing order
  // for unpinned items and pin-insertion order for pinned items. The
  // pin-order index is built once per `pinnedIds` change for an O(n)
  // partition rather than an O(n log n) comparator that hits the array on
  // every comparison.
  const sortPinnedFirst = useCallback(
    (list: readonly TeacherClass[]): TeacherClass[] => {
      if (pinnedSet.size === 0) return [...list];
      const pinOrder = new Map<string, number>();
      pinnedIds.forEach((id, idx) => pinOrder.set(id, idx));
      const pinned: TeacherClass[] = [];
      const rest: TeacherClass[] = [];
      for (const c of list) {
        if (pinnedSet.has(c.id)) pinned.push(c);
        else rest.push(c);
      }
      pinned.sort(
        (a, b) =>
          (pinOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (pinOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER),
      );
      return [...pinned, ...rest];
    },
    [pinnedSet, pinnedIds],
  );

  const { published, unpublished } = useMemo(() => {
    const pub: TeacherClass[] = [];
    const unp: TeacherClass[] = [];
    for (const c of classes) {
      if (c.archived) unp.push(c);
      else pub.push(c);
    }
    return {
      published: sortPinnedFirst(pub),
      unpublished: sortPinnedFirst(unp),
    };
  }, [classes, sortPinnedFirst]);

  return (
    <div className="min-h-[calc(100vh-var(--app-chrome-top,0px))] bg-slate-50 dark:bg-slate-950">
      <div className="max-w-6xl px-4 sm:px-6 lg:px-8 py-6 space-y-8">
        <header className="flex items-end justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Dashboard
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Jump back into any course.
            </p>
          </div>
          {classes.length > 1 && (
            <button
              type="button"
              onClick={() => setBroadcastOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-2 min-h-[40px] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
              title="Compose once, send to multiple cohorts"
            >
              <svg
                width={16}
                height={16}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M3 11l18-8v18l-18-8z" />
                <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
              </svg>
              Broadcast
            </button>
          )}
        </header>

        {profile?.id && <NeedsAttentionPanel teacherId={profile.id} />}

        {profile?.id && canQbank && <TestReleaseNudge />}

        {profile?.id && <CohortSummaryWidget teacherId={profile.id} />}

        {loading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SkeletonCard className="h-32" />
            <SkeletonCard className="h-32" />
            <SkeletonCard className="h-32" />
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-lg ring-1 ring-rose-200 dark:ring-rose-900 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-sm text-rose-700 dark:text-rose-300"
          >
            {error}
          </div>
        )}

        {!loading && !error && classes.length === 0 && (
          <EmptyState
            title="No courses yet"
            body="Create a course or join one to get started."
            cta={{
              label: "Browse courses",
              onClick: () => navigate(ROUTES.COURSES),
            }}
            icon="sparkles"
            framed
          />
        )}

        {!loading && !error && published.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Published courses ({published.length})
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {published.map((course) => (
                <DashboardCard
                  key={course.id}
                  course={course}
                  pinned={pinnedSet.has(course.id)}
                  onEdit={setEditTarget}
                  onDuplicate={(c) =>
                    setDuplicateSource({ id: c.id, name: c.name })
                  }
                  onDelete={setDeleteTarget}
                  onTogglePin={togglePin}
                />
              ))}
            </div>
          </section>
        )}

        {!loading && !error && unpublished.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Unpublished ({unpublished.length})
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {unpublished.map((course) => (
                <DashboardCard
                  key={course.id}
                  course={course}
                  pinned={pinnedSet.has(course.id)}
                  onEdit={setEditTarget}
                  onDuplicate={(c) =>
                    setDuplicateSource({ id: c.id, name: c.name })
                  }
                  onDelete={setDeleteTarget}
                  onTogglePin={togglePin}
                />
              ))}
            </div>
          </section>
        )}
      </div>

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

      <DuplicateCourseModal
        open={!!duplicateSource}
        source={duplicateSource}
        onClose={() => setDuplicateSource(null)}
        onDuplicated={() => void refresh()}
      />

      <AnnouncementFormModal
        open={broadcastOpen}
        mode="create"
        authorId={profile?.id ?? ""}
        targetCourseIds={[]}
        allowMultiCourse
        availableCourses={classes
          .filter((c) => !c.archived)
          .map<AnnouncementTargetCourse>((c) => ({ id: c.id, name: c.name }))}
        onClose={() => setBroadcastOpen(false)}
        onCreated={() => {
          setBroadcastOpen(false);
          toast.success("Broadcast queued");
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
