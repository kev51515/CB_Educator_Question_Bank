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
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  EmptyState,
  KebabMenu,
  SkeletonRows,
  useOptimistic,
  useToast,
  type KebabMenuOption,
} from "@/components";
import { useProfile } from "../lib/profile";
import { courseAssignmentPath } from "../lib/routes";
import { supabase } from "../lib/supabase";
import { AddSetToCourseModal } from "./AddSetToCourseModal";
import { AssignmentFormModal } from "./AssignmentFormModal";
import { ConfirmDialog } from "./ConfirmDialog";
import { useTeacherClasses } from "./useTeacherClasses";
import {
  useTeacherMockTests,
  type TeacherMockTest,
} from "./useTeacherMockTests";
import type {
  Assignment,
  AssignmentSourceId,
} from "./useAssignments";
import {
  useQuestionBankCatalog,
  type CatalogAxis,
  type CatalogDifficulty,
  type CatalogEntry,
  type CatalogSection,
} from "./useQuestionBankCatalog";

type ActiveSection = "practice-tests" | "question-sets";
const ACTIVE_SECTION_STORAGE_KEY = "qbank.activeSection";

function readPersistedSection(): ActiveSection {
  if (typeof window === "undefined") return "question-sets";
  try {
    const raw = window.localStorage.getItem(ACTIVE_SECTION_STORAGE_KEY);
    if (raw === "practice-tests" || raw === "question-sets") return raw;
  } catch {
    // localStorage may be unavailable (Safari private mode, etc.) — ignore.
  }
  return "question-sets";
}

type AxisFilter = CatalogAxis | "all";
type SectionFilter = CatalogSection | "all";
type DifficultyFilter = CatalogDifficulty | "all";

const AXIS_LABEL: Record<CatalogAxis, string> = {
  skill: "Skill",
  domain: "Domain",
  mixed: "Mixed",
};

const SECTION_LABEL: Record<CatalogSection, string> = {
  math: "Math",
  "reading-and-writing": "Reading & Writing",
};

const DIFFICULTY_LABEL: Record<CatalogDifficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

const DIFFICULTY_TONE: Record<CatalogDifficulty, string> = {
  easy: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 ring-emerald-200 dark:ring-emerald-900",
  medium:
    "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 ring-amber-200 dark:ring-amber-900",
  hard: "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 ring-rose-200 dark:ring-rose-900",
};

const SECTION_TONE: Record<CatalogSection, string> = {
  math: "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 ring-indigo-200 dark:ring-indigo-900",
  "reading-and-writing":
    "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 ring-sky-200 dark:ring-sky-900",
};

interface FilterPillProps<T extends string> {
  active: boolean;
  label: string;
  value: T;
  onSelect: (value: T) => void;
}

function FilterPill<T extends string>({
  active,
  label,
  value,
  onSelect,
}: FilterPillProps<T>): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      aria-pressed={active}
      className={`rounded-full min-h-[40px] md:min-h-0 inline-flex items-center px-3 py-2 md:py-1 text-xs font-medium ring-1 transition ${
        active
          ? "bg-indigo-600 text-white ring-indigo-600"
          : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 ring-slate-200 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
      }`}
    >
      {label}
    </button>
  );
}

interface CatalogCardProps {
  entry: CatalogEntry;
  onAdd: (entry: CatalogEntry) => void;
}

function previewHref(entry: CatalogEntry): string {
  // catalog.json paths are relative to /exports/. The public path is
  // therefore /exports/<questionsHtml>.
  const path = entry.questionsHtml.replace(/^\/+/, "");
  return `/exports/${path}`;
}

function CatalogCard({ entry, onAdd }: CatalogCardProps): JSX.Element {
  return (
    <article className="rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white/85 dark:bg-slate-900/70 p-5 shadow-sm space-y-3 flex flex-col">
      <header className="space-y-1">
        <p className="text-[10px] uppercase tracking-wide font-semibold text-slate-500 dark:text-slate-400">
          {AXIS_LABEL[entry.axis]}
        </p>
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 line-clamp-2">
          {entry.label}
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
          {entry.topic}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${SECTION_TONE[entry.section]}`}
        >
          {SECTION_LABEL[entry.section]}
        </span>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${DIFFICULTY_TONE[entry.difficulty]}`}
        >
          {DIFFICULTY_LABEL[entry.difficulty]}
        </span>
        <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-700 px-2 py-0.5 text-[10px] font-medium">
          {entry.questionCount} Q
        </span>
      </div>

      <footer className="mt-auto flex items-center justify-between gap-2 pt-1">
        <a
          href={previewHref(entry)}
          target="_blank"
          rel="noreferrer noopener"
          className="text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:underline"
        >
          Preview ↗
        </a>
        <button
          type="button"
          onClick={() => onAdd(entry)}
          className="rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          Add to course
        </button>
      </footer>
    </article>
  );
}

function matchesSearch(entry: CatalogEntry, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    entry.label.toLowerCase().includes(needle) ||
    entry.topic.toLowerCase().includes(needle)
  );
}

interface SectionTabProps {
  active: boolean;
  label: string;
  count?: number;
  onSelect: () => void;
}

function SectionTab({
  active,
  label,
  count,
  onSelect,
}: SectionTabProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onSelect}
      role="tab"
      aria-selected={active}
      className={`relative inline-flex items-center gap-2 min-h-[44px] px-4 py-2 text-sm font-medium transition border-b-2 -mb-px ${
        active
          ? "border-indigo-600 text-indigo-700 dark:text-indigo-300"
          : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
      }`}
    >
      <span>{label}</span>
      {typeof count === "number" && (
        <span
          className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${
            active
              ? "bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 ring-indigo-200 dark:ring-indigo-900"
              : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-slate-200 dark:ring-slate-700"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ─── Practice Tests catalog ────────────────────────────────────────────────

type PracticeSourceFilter = AssignmentSourceId | "all";
type PracticeStatusFilter = "active" | "archived";

interface PracticeFilterState {
  courseId: string | "all";
  source: PracticeSourceFilter;
  status: PracticeStatusFilter;
}

const PRACTICE_FILTER_STORAGE_KEY = "qbank.practiceTests.filter";

const DEFAULT_PRACTICE_FILTER: PracticeFilterState = {
  courseId: "all",
  source: "all",
  status: "active",
};

const PRACTICE_SOURCE_LABEL: Record<AssignmentSourceId, string> = {
  cb: "CB",
  sat: "SAT",
  mixed: "Mixed",
};

function readPracticeFilter(): PracticeFilterState {
  if (typeof window === "undefined") return DEFAULT_PRACTICE_FILTER;
  try {
    const raw = window.localStorage.getItem(PRACTICE_FILTER_STORAGE_KEY);
    if (!raw) return DEFAULT_PRACTICE_FILTER;
    const parsed = JSON.parse(raw) as Partial<PracticeFilterState>;
    const status: PracticeStatusFilter =
      parsed.status === "archived" ? "archived" : "active";
    const source: PracticeSourceFilter =
      parsed.source === "cb" ||
      parsed.source === "sat" ||
      parsed.source === "mixed"
        ? parsed.source
        : "all";
    const courseId =
      typeof parsed.courseId === "string" && parsed.courseId.length > 0
        ? parsed.courseId
        : "all";
    return { courseId, source, status };
  } catch {
    return DEFAULT_PRACTICE_FILTER;
  }
}

function writePracticeFilter(value: PracticeFilterState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      PRACTICE_FILTER_STORAGE_KEY,
      JSON.stringify(value),
    );
  } catch {
    /* localStorage unavailable — non-fatal */
  }
}

function formatRelativeDue(iso: string | null): string {
  if (!iso) return "No due date";
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return "No due date";
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const dayMs = 1000 * 60 * 60 * 24;
  const diffDays = Math.round(diffMs / dayMs);
  if (diffDays === 0) {
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) return "Due now";
    if (diffHours > 0) return `Due in ${diffHours}h`;
    return `Due ${Math.abs(diffHours)}h ago`;
  }
  if (diffDays === 1) return "Due tomorrow";
  if (diffDays === -1) return "Due yesterday";
  if (diffDays > 1) return `Due in ${diffDays} days`;
  return `Due ${Math.abs(diffDays)} days ago`;
}

interface PracticeFilterPillProps {
  active: boolean;
  label: string;
  onClick: () => void;
  count?: number;
}

function PracticeFilterPill({
  active,
  label,
  onClick,
  count,
}: PracticeFilterPillProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full min-h-[40px] md:min-h-0 px-3 py-2 md:py-1 text-xs font-medium ring-1 transition ${
        active
          ? "bg-indigo-600 text-white ring-indigo-600"
          : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 ring-slate-200 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
      }`}
    >
      <span>{label}</span>
      {typeof count === "number" && (
        <span
          className={`inline-flex items-center justify-center rounded-full px-1.5 text-[10px] font-semibold ${
            active
              ? "bg-white/20 text-white"
              : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

interface CoursePickerDialogProps {
  open: boolean;
  courses: { id: string; name: string }[];
  loading: boolean;
  onCancel: () => void;
  onPick: (courseId: string) => void;
}

/**
 * Lightweight course picker shown when a teacher hits "+ Practice Test"
 * from the global catalog. The existing AssignmentFormModal requires a
 * `classId`, so we pre-flight by asking which course this practice test
 * lives in, then hand off to the standard create flow.
 *
 * Kept inline (not a full modal) — the form has a single field, so a
 * dedicated component file would be overkill.
 */
function CoursePickerDialog({
  open,
  courses,
  loading,
  onCancel,
  onPick,
}: CoursePickerDialogProps): JSX.Element | null {
  const [selected, setSelected] = useState<string>("");

  useEffect(() => {
    if (open) setSelected("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pick a course"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-slate-200 dark:ring-slate-700 p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="space-y-1">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Pick a course
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Practice tests are assigned to a single course. Pick which one this
            test lives in.
          </p>
        </header>

        {loading ? (
          <SkeletonRows count={2} rowClassName="h-10 rounded-md" />
        ) : courses.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            You don't have any active courses yet. Create a course first.
          </p>
        ) : (
          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Course
            </span>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Choose a course…</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selected}
            onClick={() => onPick(selected)}
            className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

interface PracticeTestCardProps {
  mockTest: TeacherMockTest;
  onOpen: () => void;
  onEdit: () => void;
  onArchiveCommit: (next: boolean) => Promise<void>;
  onDelete: () => void;
}

function PracticeTestCard({
  mockTest,
  onOpen,
  onEdit,
  onArchiveCommit,
  onDelete,
}: PracticeTestCardProps): JSX.Element {
  const [archived, applyArchive] = useOptimistic<boolean>(mockTest.archived);

  // Keep the local optimistic state in sync if the parent refetches and
  // the row is no longer in this archived state (rare but possible after
  // bulk operations on another tab).
  useEffect(() => {
    if (mockTest.archived !== archived) {
      // useOptimistic exposes a setter via its third tuple — but we
      // accessed only two values above. Easiest path: trigger a no-op
      // optimistic with the new value to sync.
      void applyArchive({
        optimistic: () => mockTest.archived,
        commit: async () => {
          /* no-op — we're just syncing local state */
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mockTest.archived]);

  const onToggleArchive = (): void => {
    void applyArchive({
      optimistic: (cur) => !cur,
      commit: async () => {
        await onArchiveCommit(!archived);
      },
      successMessage: archived ? "Unarchived" : "Archived",
    });
  };

  const kebabOptions: KebabMenuOption[] = [
    { label: "Open", onSelect: onOpen },
    { label: "Edit…", onSelect: onEdit },
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

interface PracticeTestsSectionProps {
  teacherId: string;
  mockTests: TeacherMockTest[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  onOpenCreate: () => void;
}

function PracticeTestsSection({
  teacherId: _teacherId,
  mockTests,
  loading,
  error,
  refresh,
  onOpenCreate,
}: PracticeTestsSectionProps): JSX.Element {
  const toast = useToast();
  const [filter, setFilter] = useState<PracticeFilterState>(() =>
    readPracticeFilter(),
  );
  const [editTarget, setEditTarget] = useState<TeacherMockTest | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TeacherMockTest | null>(
    null,
  );
  const [deleteBusy, setDeleteBusy] = useState<boolean>(false);

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

  const handleOpen = useCallback((m: TeacherMockTest): void => {
    if (typeof window === "undefined") return;
    window.location.assign(
      courseAssignmentPath(m.course.short_code, m.short_code),
    );
  }, []);

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
          teacherId={_teacherId}
          initialAssignment={mockTestToAssignment(editTarget)}
          onClose={() => setEditTarget(null)}
          onUpdated={() => {
            setEditTarget(null);
            void refresh();
          }}
        />
      )}

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

/**
 * The teacher-mocktests query intentionally returns a slimmer shape than
 * the shared Assignment type (no created_by / opens_at — we don't need
 * them on a catalog card). AssignmentFormModal's edit mode reads from
 * the row directly via `initialAssignment` for the policy columns, so we
 * only need to provide the fields the form pre-populates from. The
 * missing fields are filled with safe defaults; they're never persisted
 * unless the teacher explicitly changes them in the form.
 */
function mockTestToAssignment(m: TeacherMockTest): Assignment {
  return {
    id: m.id,
    short_code: m.short_code,
    course_id: m.course.id,
    created_by: "",
    title: m.title,
    description: m.description,
    source_id: m.source_id,
    question_count: m.question_count,
    time_limit_minutes: m.time_limit_minutes,
    difficulty_mix: m.difficulty_mix,
    due_at: m.due_at,
    opens_at: m.created_at,
    archived: m.archived,
    created_at: m.created_at,
    updated_at: m.created_at,
  };
}

interface QuestionSetsSectionProps {
  catalog: CatalogEntry[];
  loading: boolean;
  error: string | null;
  onAdd: (entry: CatalogEntry) => void;
}

function QuestionSetsSection({
  catalog,
  loading,
  error,
  onAdd,
}: QuestionSetsSectionProps): JSX.Element {
  const [axisFilter, setAxisFilter] = useState<AxisFilter>("all");
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>("all");
  const [difficultyFilter, setDifficultyFilter] =
    useState<DifficultyFilter>("all");
  const [search, setSearch] = useState<string>("");

  const filtered = useMemo(() => {
    return catalog.filter((entry) => {
      if (axisFilter !== "all" && entry.axis !== axisFilter) return false;
      if (sectionFilter !== "all" && entry.section !== sectionFilter)
        return false;
      if (difficultyFilter !== "all" && entry.difficulty !== difficultyFilter)
        return false;
      if (!matchesSearch(entry, search.trim())) return false;
      return true;
    });
  }, [catalog, axisFilter, sectionFilter, difficultyFilter, search]);

  return (
    <section aria-label="Question sets" className="space-y-4">
      <div className="space-y-3">
        <div
          role="group"
          aria-label="Filter by axis"
          className="flex flex-wrap items-center gap-2"
        >
          <span className="text-[11px] uppercase font-semibold tracking-wide text-slate-500 dark:text-slate-400 mr-1">
            Axis
          </span>
          <FilterPill<AxisFilter>
            active={axisFilter === "all"}
            label="All"
            value="all"
            onSelect={setAxisFilter}
          />
          <FilterPill<AxisFilter>
            active={axisFilter === "skill"}
            label="Skill"
            value="skill"
            onSelect={setAxisFilter}
          />
          <FilterPill<AxisFilter>
            active={axisFilter === "domain"}
            label="Domain"
            value="domain"
            onSelect={setAxisFilter}
          />
          <FilterPill<AxisFilter>
            active={axisFilter === "mixed"}
            label="Mixed"
            value="mixed"
            onSelect={setAxisFilter}
          />
        </div>

        <div
          role="group"
          aria-label="Filter by section"
          className="flex flex-wrap items-center gap-2"
        >
          <span className="text-[11px] uppercase font-semibold tracking-wide text-slate-500 dark:text-slate-400 mr-1">
            Section
          </span>
          <FilterPill<SectionFilter>
            active={sectionFilter === "all"}
            label="All"
            value="all"
            onSelect={setSectionFilter}
          />
          <FilterPill<SectionFilter>
            active={sectionFilter === "math"}
            label="Math"
            value="math"
            onSelect={setSectionFilter}
          />
          <FilterPill<SectionFilter>
            active={sectionFilter === "reading-and-writing"}
            label="Reading & Writing"
            value="reading-and-writing"
            onSelect={setSectionFilter}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div
            role="group"
            aria-label="Filter by difficulty"
            className="flex flex-wrap items-center gap-2"
          >
            <span className="text-[11px] uppercase font-semibold tracking-wide text-slate-500 dark:text-slate-400 mr-1">
              Difficulty
            </span>
            <FilterPill<DifficultyFilter>
              active={difficultyFilter === "all"}
              label="All"
              value="all"
              onSelect={setDifficultyFilter}
            />
            <FilterPill<DifficultyFilter>
              active={difficultyFilter === "easy"}
              label="Easy"
              value="easy"
              onSelect={setDifficultyFilter}
            />
            <FilterPill<DifficultyFilter>
              active={difficultyFilter === "medium"}
              label="Medium"
              value="medium"
              onSelect={setDifficultyFilter}
            />
            <FilterPill<DifficultyFilter>
              active={difficultyFilter === "hard"}
              label="Hard"
              value="hard"
              onSelect={setDifficultyFilter}
            />
          </div>

          <div className="ml-auto flex-1 min-w-[200px] max-w-sm">
            <label className="sr-only" htmlFor="qbank-search">
              Search sets
            </label>
            <input
              id="qbank-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search sets by topic or label…"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
          {loading
            ? "Loading sets…"
            : `${filtered.length} set${filtered.length === 1 ? "" : "s"}`}
        </h2>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SkeletonRows count={6} rowClassName="h-44 rounded-2xl" />
        </div>
      ) : error ? (
        <div
          role="alert"
          className="rounded-xl bg-rose-50 dark:bg-rose-950/40 ring-1 ring-rose-200 dark:ring-rose-900 px-4 py-3 text-sm text-rose-700 dark:text-rose-300"
        >
          {error}
        </div>
      ) : catalog.length === 0 ? (
        <EmptyState
          icon="inbox"
          title="No question sets yet"
          body="The question-bank catalog hasn't been generated yet. Run the catalog build to populate this list."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No sets match your filters"
          body="Try clearing a filter or searching by topic."
          cta={{
            label: "Reset filters",
            onClick: () => {
              setAxisFilter("all");
              setSectionFilter("all");
              setDifficultyFilter("all");
              setSearch("");
            },
          }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((entry) => (
            <CatalogCard
              key={`${entry.axis}-${entry.section}-${entry.difficulty}-${entry.topic}-${entry.setId}`}
              entry={entry}
              onAdd={onAdd}
            />
          ))}
        </div>
      )}
    </section>
  );
}

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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50 to-sky-100 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 px-4 py-10">
        <div className="mx-auto max-w-6xl space-y-6">
          <header className="space-y-1">
            <p className="text-sm uppercase tracking-wide text-indigo-600 dark:text-indigo-400 font-medium">
              Question Bank
            </p>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              Question Bank
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Practice tests and pre-built question sets you can assign to any
              course.
            </p>
          </header>

          <div
            role="tablist"
            aria-label="Question bank sections"
            className="sticky top-0 z-10 -mx-2 px-2 pt-2 bg-gradient-to-b from-slate-50/95 via-indigo-50/90 to-transparent dark:from-slate-950/95 dark:via-slate-900/90 backdrop-blur-sm"
          >
            <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
              <SectionTab
                active={activeSection === "practice-tests"}
                label="Practice Tests"
                count={mockTestsLoading ? undefined : mockTests.length}
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
              <PracticeTestsSection
                teacherId={teacherId}
                mockTests={mockTests}
                loading={mockTestsLoading}
                error={mockTestsError}
                refresh={refreshMockTests}
                onOpenCreate={() => setPickerOpen(true)}
              />
            ) : (
              <QuestionSetsSection
                catalog={catalog}
                loading={loading}
                error={error}
                onAdd={setAddTarget}
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
