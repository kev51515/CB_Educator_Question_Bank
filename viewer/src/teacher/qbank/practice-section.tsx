/**
 * qbank/practice-section
 * ======================
 * The Practice Tests section of the Question Bank: <PracticeTestCard> and the
 * <PracticeTestsSection> container (filtering, edit/duplicate/archive, add-to-
 * course). Extracted verbatim from QuestionBankPage.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  EmptyState,
  KebabMenu,
  SkeletonRows,
  useOptimistic,
  useToast,
  type KebabMenuOption,
} from "@/components";
import { courseAssignmentPath, courseAssignmentsPath } from "@/lib/routes";
import { supabase } from "@/lib/supabase";
import { AssignmentFormModal } from "@/teacher/AssignmentFormModal";
import { ConfirmDialog } from "@/teacher/ConfirmDialog";
import { type TeacherMockTest } from "@/teacher/useTeacherMockTests";
import {
  CoursePickerDialog,
  DEFAULT_PRACTICE_FILTER,
  formatRelativeDue,
  PRACTICE_SOURCE_LABEL,
  PracticeFilterPill,
  readPracticeFilter,
  writePracticeFilter,
  type PracticeFilterState,
} from "./practice-filters";
import { mockTestToAssignment } from "./question-sets";
export interface PracticeTestCardProps {
  mockTest: TeacherMockTest;
  onOpen: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onArchiveCommit: (next: boolean) => Promise<void>;
  onDelete: () => void;
}

export function PracticeTestCard({
  mockTest,
  onOpen,
  onEdit,
  onDuplicate,
  onArchiveCommit,
  onDelete,
}: PracticeTestCardProps): JSX.Element {
  const [archived, applyArchive, setArchived] = useOptimistic<boolean>(
    mockTest.archived,
  );

  // Keep the local optimistic state in sync if the parent refetches and
  // the row is no longer in this archived state (rare but possible after
  // bulk operations on another tab). Uses the plain setter exposed by
  // useOptimistic's third tuple element — no fake commit needed.
  useEffect(() => {
    setArchived(mockTest.archived);
  }, [mockTest.archived, setArchived]);

  const onToggleArchive = (): void => {
    void applyArchive({
      optimistic: (cur) => !cur,
      commit: async () => {
        await onArchiveCommit(!archived);
      },
      successMessage: archived ? "Unarchived" : "Archived",
    });
  };

  // "Duplicate to course…" is disabled while the source is archived — cloning
  // a stale row into a fresh course would just propagate the archive into a
  // confusing state. Teacher must unarchive first.
  const kebabOptions: KebabMenuOption[] = [
    { label: "Open", onSelect: onOpen },
    { label: "Edit…", onSelect: onEdit },
    {
      label: "Duplicate to course…",
      onSelect: onDuplicate,
      disabled: archived,
    },
    {
      label: archived ? "Unarchive" : "Archive",
      onSelect: onToggleArchive,
    },
    { label: "Delete…", destructive: true, onSelect: onDelete },
  ];

  return (
    <article
      className={`rounded-2xl ring-1 bg-white/85 dark:bg-slate-900/70 p-5 shadow-sm space-y-3 flex flex-col transition ${
        archived
          ? "ring-slate-200 dark:ring-slate-800 opacity-70"
          : "ring-slate-200 dark:ring-slate-800"
      }`}
    >
      <header className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="flex-1 min-w-0 text-left"
        >
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate hover:underline">
            {mockTest.title}
          </h3>
        </button>
        <KebabMenu options={kebabOptions} />
      </header>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-200 dark:ring-indigo-900 px-2 py-0.5 text-[10px] font-medium max-w-[12rem] truncate">
          {mockTest.course.name}
        </span>
        <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-700 px-2 py-0.5 text-[10px] font-medium">
          {PRACTICE_SOURCE_LABEL[mockTest.source_id]}
        </span>
        <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-700 px-2 py-0.5 text-[10px] font-medium">
          {mockTest.question_count} Q
        </span>
        <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-700 px-2 py-0.5 text-[10px] font-medium">
          {mockTest.time_limit_minutes > 0
            ? `${mockTest.time_limit_minutes} min`
            : "Untimed"}
        </span>
        {archived && (
          <span className="inline-flex items-center rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-900 px-2 py-0.5 text-[10px] font-medium">
            Archived
          </span>
        )}
      </div>

      <footer className="mt-auto flex items-center justify-between gap-2 pt-1">
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {formatRelativeDue(mockTest.due_at)}
        </span>
        <button
          type="button"
          onClick={onOpen}
          className="text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:underline"
        >
          Open ↗
        </button>
      </footer>
    </article>
  );
}

export interface PracticeTestsSectionProps {
  teacherId: string;
  mockTests: TeacherMockTest[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  onOpenCreate: () => void;
  /**
   * Active (non-archived) courses owned by the teacher. Used to power the
   * "Duplicate to course…" picker. Sourced from the parent so we don't
   * double-fetch courses on this page.
   */
  activeCourses: { id: string; name: string }[];
  classesLoading: boolean;
}

export function PracticeTestsSection({
  teacherId,
  mockTests,
  loading,
  error,
  refresh,
  onOpenCreate,
  activeCourses,
  classesLoading,
}: PracticeTestsSectionProps): JSX.Element {
  const toast = useToast();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<PracticeFilterState>(() =>
    readPracticeFilter(),
  );
  const [editTarget, setEditTarget] = useState<TeacherMockTest | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TeacherMockTest | null>(
    null,
  );
  const [deleteBusy, setDeleteBusy] = useState<boolean>(false);
  // Duplicate flow: the source row whose course-picker is currently open.
  // Null when no picker is active. `duplicateBusy` blocks repeated clicks
  // while the INSERT is in flight.
  const [duplicateTarget, setDuplicateTarget] =
    useState<TeacherMockTest | null>(null);
  const [duplicateBusy, setDuplicateBusy] = useState<boolean>(false);

  useEffect(() => {
    writePracticeFilter(filter);
  }, [filter]);

  // Courses the teacher actually has practice tests in — used to scope
  // the course filter pills so we don't show every empty option.
  const courseOptions = useMemo(() => {
    const seen = new Map<string, { id: string; name: string }>();
    for (const m of mockTests) {
      if (!seen.has(m.course.id)) {
        seen.set(m.course.id, { id: m.course.id, name: m.course.name });
      }
    }
    return Array.from(seen.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [mockTests]);

  const visible = useMemo(() => {
    return mockTests.filter((m) => {
      if (filter.status === "active" && m.archived) return false;
      if (filter.status === "archived" && !m.archived) return false;
      if (filter.courseId !== "all" && m.course.id !== filter.courseId)
        return false;
      if (filter.source !== "all" && m.source_id !== filter.source)
        return false;
      return true;
    });
  }, [mockTests, filter]);

  const activeCount = mockTests.filter((m) => !m.archived).length;
  const archivedCount = mockTests.filter((m) => m.archived).length;

  const handleOpen = useCallback(
    (m: TeacherMockTest): void => {
      navigate(courseAssignmentPath(m.course.short_code, m.short_code));
    },
    [navigate],
  );

  const handleArchive = useCallback(
    async (m: TeacherMockTest, next: boolean): Promise<void> => {
      const { error: updError } = await supabase
        .from("assignments")
        .update({ archived: next })
        .eq("id", m.id);
      if (updError) throw new Error(updError.message);
      void refresh();
    },
    [refresh],
  );

  /**
   * Clone a Practice Test definition into another course.
   *
   * Carries the source row's defining columns (title, description, source,
   * question count, time limit, difficulty mix, kind) into a fresh row on
   * the target course. Intentionally resets:
   *   - due_at → null (teacher sets this when placing on a module)
   *   - opens_at → now() (handled by DB default; we don't set explicitly)
   *   - archived → false (DB default)
   *   - created_by → current teacher
   *
   * Guards: same-course duplicates and archived sources are blocked
   * upstream (the kebab option is disabled while archived; same-course is
   * caught here so a stale picker can't slip a duplicate through).
   */
  const handleDuplicate = useCallback(
    async (targetCourseId: string): Promise<void> => {
      if (!duplicateTarget) return;
      if (targetCourseId === duplicateTarget.course.id) {
        toast.warning(
          "Pick a different course",
          "This practice test already lives in that course.",
        );
        return;
      }
      setDuplicateBusy(true);
      const targetCourse = activeCourses.find((c) => c.id === targetCourseId);
      const { error: insertError } = await supabase
        .from("assignments")
        .insert({
          course_id: targetCourseId,
          created_by: teacherId,
          title: duplicateTarget.title,
          description: duplicateTarget.description,
          source_id: duplicateTarget.source_id,
          question_count: duplicateTarget.question_count,
          time_limit_minutes: duplicateTarget.time_limit_minutes,
          difficulty_mix: duplicateTarget.difficulty_mix,
          kind: "mocktest",
          due_at: null,
        });
      setDuplicateBusy(false);
      if (insertError) {
        toast.error("Couldn't duplicate", insertError.message);
        return;
      }
      // Look up the target course's short_code for the "Go to course" link.
      // activeCourses only carries id+name, so fall back to the assignments
      // page resolved by id if needed (the route helper accepts either —
      // course short_codes are unique alphanumerics, UUIDs are still valid
      // and resolved server-side via the catch-all route).
      const goToHref = targetCourse
        ? courseAssignmentsPath(targetCourse.id)
        : courseAssignmentsPath(targetCourseId);
      toast.success(
        `Duplicated to ${targetCourse?.name ?? "course"}`,
        duplicateTarget.title,
        {
          action: {
            label: "Go to course",
            onAction: () => {
              navigate(goToHref);
            },
          },
        },
      );
      setDuplicateTarget(null);
      void refresh();
    },
    [activeCourses, duplicateTarget, navigate, refresh, teacherId, toast],
  );

  const handleDelete = useCallback(async (): Promise<void> => {
    if (!confirmDelete) return;
    setDeleteBusy(true);
    const { error: delError } = await supabase
      .from("assignments")
      .delete()
      .eq("id", confirmDelete.id);
    setDeleteBusy(false);
    if (delError) {
      toast.error("Couldn't delete practice test", delError.message);
      return;
    }
    toast.success("Practice test deleted", confirmDelete.title);
    setConfirmDelete(null);
    void refresh();
  }, [confirmDelete, refresh, toast]);

  const resetFilters = useCallback((): void => {
    setFilter(DEFAULT_PRACTICE_FILTER);
  }, []);

  return (
    <>
      <section aria-label="Practice tests" className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
              Practice Tests
            </h2>
            <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-700 px-2 py-0.5 text-[10px] font-semibold">
              {loading ? "…" : mockTests.length}
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenCreate}
            className="inline-flex items-center gap-1.5 min-h-[40px] rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            <span aria-hidden="true">+</span>
            <span>Practice Test</span>
          </button>
        </div>

        <div className="space-y-3">
          {courseOptions.length > 0 && (
            <div
              role="group"
              aria-label="Filter by course"
              className="flex flex-wrap items-center gap-2"
            >
              <span className="text-[11px] uppercase font-semibold tracking-wide text-slate-500 dark:text-slate-400 mr-1">
                Course
              </span>
              <PracticeFilterPill
                active={filter.courseId === "all"}
                label="All"
                onClick={() => setFilter((f) => ({ ...f, courseId: "all" }))}
              />
              {courseOptions.map((c) => (
                <PracticeFilterPill
                  key={c.id}
                  active={filter.courseId === c.id}
                  label={c.name}
                  onClick={() =>
                    setFilter((f) => ({ ...f, courseId: c.id }))
                  }
                />
              ))}
            </div>
          )}

          <div
            role="group"
            aria-label="Filter by source"
            className="flex flex-wrap items-center gap-2"
          >
            <span className="text-[11px] uppercase font-semibold tracking-wide text-slate-500 dark:text-slate-400 mr-1">
              Source
            </span>
            <PracticeFilterPill
              active={filter.source === "all"}
              label="All"
              onClick={() => setFilter((f) => ({ ...f, source: "all" }))}
            />
            <PracticeFilterPill
              active={filter.source === "cb"}
              label="CB"
              onClick={() => setFilter((f) => ({ ...f, source: "cb" }))}
            />
            <PracticeFilterPill
              active={filter.source === "sat"}
              label="SAT"
              onClick={() => setFilter((f) => ({ ...f, source: "sat" }))}
            />
            <PracticeFilterPill
              active={filter.source === "mixed"}
              label="Mixed"
              onClick={() => setFilter((f) => ({ ...f, source: "mixed" }))}
            />
          </div>

          <div
            role="group"
            aria-label="Filter by status"
            className="flex flex-wrap items-center gap-2"
          >
            <span className="text-[11px] uppercase font-semibold tracking-wide text-slate-500 dark:text-slate-400 mr-1">
              Status
            </span>
            <PracticeFilterPill
              active={filter.status === "active"}
              count={activeCount}
              label="Active"
              onClick={() => setFilter((f) => ({ ...f, status: "active" }))}
            />
            <PracticeFilterPill
              active={filter.status === "archived"}
              count={archivedCount}
              label="Archived"
              onClick={() =>
                setFilter((f) => ({ ...f, status: "archived" }))
              }
            />
          </div>
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SkeletonRows count={6} rowClassName="h-40 rounded-2xl" />
          </div>
        ) : error ? (
          <div
            role="alert"
            className="rounded-xl bg-rose-50 dark:bg-rose-950/40 ring-1 ring-rose-200 dark:ring-rose-900 px-4 py-3 text-sm text-rose-700 dark:text-rose-300"
          >
            {error}
          </div>
        ) : mockTests.length === 0 ? (
          <EmptyState
            icon="inbox"
            title="No practice tests yet"
            body="Create your first practice test to give students a full-length, timed mock to work through."
            cta={{
              label: "+ Practice Test",
              onClick: onOpenCreate,
            }}
          />
        ) : visible.length === 0 ? (
          <EmptyState
            title="No practice tests match these filters"
            body="Try clearing a filter or switching the status to Archived."
            cta={{
              label: "Reset filters",
              onClick: resetFilters,
            }}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((m) => (
              <PracticeTestCard
                key={m.id}
                mockTest={m}
                onOpen={() => handleOpen(m)}
                onEdit={() => setEditTarget(m)}
                onDuplicate={() => setDuplicateTarget(m)}
                onArchiveCommit={(next) => handleArchive(m, next)}
                onDelete={() => setConfirmDelete(m)}
              />
            ))}
          </div>
        )}
      </section>

      {editTarget && (
        <AssignmentFormModal
          open={editTarget !== null}
          mode="edit"
          classId={editTarget.course.id}
          teacherId={teacherId}
          initialAssignment={mockTestToAssignment(editTarget)}
          onClose={() => setEditTarget(null)}
          onUpdated={() => {
            setEditTarget(null);
            void refresh();
          }}
        />
      )}

      {/*
        Duplicate-to-course picker. Reuses CoursePickerDialog as-is — it
        already takes a generic onPick(courseId) callback. We don't block
        the picker from closing while busy because the handler clears the
        target on success; the duplicateBusy state prevents racing INSERTs
        if the picker were ever extended to allow re-submit.
      */}
      <CoursePickerDialog
        open={duplicateTarget !== null && !duplicateBusy}
        courses={activeCourses}
        loading={classesLoading}
        onCancel={() => setDuplicateTarget(null)}
        onPick={(courseId) => {
          void handleDuplicate(courseId);
        }}
      />

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this practice test?"
          body={
            <>
              <strong>{confirmDelete.title}</strong> will be removed from{" "}
              <em>{confirmDelete.course.name}</em>. Student attempts on this
              practice test will also be deleted. This can't be undone.
            </>
          }
          confirmLabel="Delete"
          destructive
          busy={deleteBusy}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </>
  );
}
