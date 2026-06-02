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
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProfile } from "../lib/profile";
import { useTeacherClasses, type TeacherClass } from "../teacher/useTeacherClasses";
import {
  coursePath,
  courseAssignmentsPath,
  coursePeoplePath,
  courseAnnouncementsPath,
  ROUTES,
} from "../lib/routes";
import { supabase } from "../lib/supabase";
import { SkeletonCard } from "../components/Skeleton";
import { EmptyState } from "../components/EmptyState";
import { CourseCard, CardActionIcon } from "../components/CourseCard";
import { useOptimistic, useToast, type KebabMenuOption } from "../components";
import { ClassFormModal, type EditableClass } from "../teacher/ClassFormModal";
import { ConfirmDialog } from "../teacher/ConfirmDialog";
import { DuplicateCourseModal } from "../teacher/DuplicateCourseModal";
import {
  AnnouncementFormModal,
  type AnnouncementTargetCourse,
} from "../teacher/AnnouncementFormModal";
import { NeedsAttentionPanel } from "./NeedsAttentionPanel";
import { CohortSummaryWidget } from "./CohortSummaryWidget";

interface DashboardCardProps {
  course: TeacherClass;
  onEdit: (course: TeacherClass) => void;
  onDuplicate: (course: TeacherClass) => void;
  onDelete: (course: TeacherClass) => void;
}

function DashboardCard({ course, onEdit, onDuplicate, onDelete }: DashboardCardProps) {
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
    { label: "Edit", onSelect: () => onEdit(course) },
    { label: "Duplicate", onSelect: () => onDuplicate(course) },
    {
      label: archivedOpt ? "Unarchive" : "Archive",
      onSelect: toggleArchive,
    },
    { label: "Delete…", destructive: true, onSelect: () => onDelete(course) },
  ];

  return (
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
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { profile } = useProfile();
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

  const { published, unpublished } = useMemo(() => {
    const pub: TeacherClass[] = [];
    const unp: TeacherClass[] = [];
    for (const c of classes) {
      if (c.archived) unp.push(c);
      else pub.push(c);
    }
    return { published: pub, unpublished: unp };
  }, [classes]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-8">
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
                  onEdit={setEditTarget}
                  onDuplicate={(c) =>
                    setDuplicateSource({ id: c.id, name: c.name })
                  }
                  onDelete={setDeleteTarget}
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
                  onEdit={setEditTarget}
                  onDuplicate={(c) =>
                    setDuplicateSource({ id: c.id, name: c.name })
                  }
                  onDelete={setDeleteTarget}
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
