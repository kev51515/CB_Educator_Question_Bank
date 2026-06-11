/**
 * QuestionBankPage
 * ================
 * Teacher-facing browse surface mounted at `/question-bank`. Restructured
 * into two top-level sections via a sticky tab bar:
 *
 *   1. Practice Tests  — official Bluebook-styled multi-module mock tests.
 *      Lives at `/mock-test` today (no catalog yet), so the section shows
 *      an empty state with a CTA to open the existing mock-test surface.
 *   2. Question Sets   — the existing pre-built CB question-set catalog
 *      (axis / section / difficulty), with filter pills + search.
 *
 * Active tab persists to `localStorage` keyed `qbank.activeSection` so a
 * reload returns the user to where they were.
 *
 * Question Sets functional goals (unchanged):
 *   - Load the static catalog once (`/exports/catalog.json`) via the
 *     module-cached `useQuestionBankCatalog` hook.
 *   - Filter by axis (skill / domain / mixed), section (math / R&W),
 *     difficulty (easy / medium / hard), and free-text search across
 *     label + topic.
 *   - Each catalog card exposes:
 *       · "Preview" — opens the rendered questions HTML in a new tab.
 *       · "Add to course" — opens `AddSetToCourseModal` which inserts
 *         an `assignments` row of kind = `qbank_set` (migration 0042).
 *
 * UX bar follows the ModulesPage / AssignmentsPage standard:
 *   - Sticky tab bar + filter bar.
 *   - Skeleton rows while loading — not "Loading…" text.
 *   - EmptyState with a CTA / helpful message when filters match nothing.
 *   - Toast feedback handled in the modal on success.
 */
import { useEffect, useMemo, useState } from "react";
import { useProfile } from "@/lib/profile";
import { FullTestCatalog } from "@/fulltest";
import { AddSetToCourseModal } from "./AddSetToCourseModal";
import { AssignmentFormModal } from "./AssignmentFormModal";
import { useTeacherClasses } from "./useTeacherClasses";
import { useTeacherMockTests } from "./useTeacherMockTests";
import {
  useQuestionBankCatalog,
  type CatalogEntry,
} from "./useQuestionBankCatalog";
import {
  ACTIVE_SECTION_STORAGE_KEY,
  CoursePickerDialog,
  PracticeTestsSection,
  QuestionSetsSection,
  readPersistedSection,
  SectionTab,
  type ActiveSection,
} from "@/teacher/qbank";

export function QuestionBankPage(): JSX.Element {
  const { profile } = useProfile();
  const { catalog, loading, error } = useQuestionBankCatalog();

  const [activeSection, setActiveSection] = useState<ActiveSection>(() =>
    readPersistedSection(),
  );
  const [addTarget, setAddTarget] = useState<CatalogEntry | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        ACTIVE_SECTION_STORAGE_KEY,
        activeSection,
      );
    } catch {
      // localStorage may be unavailable — non-fatal.
    }
  }, [activeSection]);

  const teacherId = profile?.id ?? "";

  // Practice Tests data — fetched only when we have a teacher id. The
  // hook returns an empty list with `loading=false` when teacherId is
  // empty, so this works during the unauth flash too.
  const {
    mockTests,
    loading: mockTestsLoading,
    error: mockTestsError,
    refresh: refreshMockTests,
  } = useTeacherMockTests(teacherId || null);

  // Course list for the create-flow course picker and for the course
  // filter pills (we use the catalog's embedded course for the pills,
  // but the picker needs *all* active courses, even ones with no tests
  // yet).
  const { classes, loading: classesLoading } = useTeacherClasses(
    teacherId || null,
  );

  const activeCourses = useMemo(
    () =>
      classes
        .filter((c) => !c.archived)
        .map((c) => ({ id: c.id, name: c.name, archived: c.archived })),
    [classes],
  );

  // Two-step create flow: pick a course, then open AssignmentFormModal
  // pre-pointed at it. AssignmentFormModal's DB insert relies on the
  // assignments.kind column defaulting to 'mocktest' (migration 0045),
  // so we don't have to push a `kind` prop into the modal.
  const [pickerOpen, setPickerOpen] = useState<boolean>(false);
  const [createCourseId, setCreateCourseId] = useState<string | null>(null);

  return (
    <>
      <div className="min-h-[calc(100vh-var(--app-chrome-top,0px))] bg-gradient-to-br from-slate-50 via-indigo-50 to-sky-100 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 px-4 sm:px-6 lg:px-8 py-10">
        <div className="max-w-6xl space-y-6">
          <header className="space-y-1">
            <p className="text-sm uppercase tracking-wide text-indigo-600 dark:text-indigo-400 font-medium">
              Question Bank
            </p>
            <h1 className="page-title text-2xl font-bold text-slate-900 dark:text-slate-100">
              Question Bank
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Practice tests and pre-built question sets you can assign to any
              course.
            </p>
          </header>
          <div className="ivy-rule" aria-hidden="true" />

          <div
            role="tablist"
            aria-label="Question bank sections"
            className="sticky top-[var(--app-chrome-top,0px)] z-10 -mx-2 px-2 pt-2 bg-gradient-to-b from-slate-50/95 via-indigo-50/90 to-transparent dark:from-slate-950/95 dark:via-slate-900/90 backdrop-blur-sm"
          >
            <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
              <SectionTab
                active={activeSection === "practice-tests"}
                label="Full-Test"
                count={undefined}
                onSelect={() => setActiveSection("practice-tests")}
              />
              <SectionTab
                active={activeSection === "question-sets"}
                label="Question Sets"
                count={loading ? undefined : catalog.length}
                onSelect={() => setActiveSection("question-sets")}
              />
            </div>
          </div>

          <div
            role="tabpanel"
            aria-label={
              activeSection === "practice-tests"
                ? "Practice tests"
                : "Question sets"
            }
          >
            {activeSection === "practice-tests" ? (
              // Full-Test tab: the canonical full-length tests (`tests` table).
              <FullTestCatalog />
            ) : (
              <QuestionSetsSection
                catalog={catalog}
                loading={loading}
                error={error}
                onAdd={setAddTarget}
              />
            )}
            {/* Legacy mock-test catalog retired — full tests now live in the
                `tests` table (see FullTestCatalog). Kept dormant (never
                rendered) so the code/data isn't deleted; the existing
                mocktests are archived. Phase 2 removes this block. */}
            {false && (
              <PracticeTestsSection
                teacherId={teacherId}
                mockTests={mockTests}
                loading={mockTestsLoading}
                error={mockTestsError}
                refresh={refreshMockTests}
                onOpenCreate={() => setPickerOpen(true)}
                activeCourses={activeCourses}
                classesLoading={classesLoading}
              />
            )}
          </div>
        </div>
      </div>

      <CoursePickerDialog
        open={pickerOpen}
        courses={activeCourses}
        loading={classesLoading}
        onCancel={() => setPickerOpen(false)}
        onPick={(id) => {
          setPickerOpen(false);
          setCreateCourseId(id);
        }}
      />

      {teacherId && createCourseId && (
        <AssignmentFormModal
          open={createCourseId !== null}
          mode="create"
          classId={createCourseId}
          teacherId={teacherId}
          onClose={() => setCreateCourseId(null)}
          onCreated={() => {
            setCreateCourseId(null);
            void refreshMockTests();
          }}
        />
      )}

      {teacherId && (
        <AddSetToCourseModal
          open={addTarget !== null}
          entry={addTarget}
          teacherId={teacherId}
          onClose={() => setAddTarget(null)}
        />
      )}
    </>
  );
}
