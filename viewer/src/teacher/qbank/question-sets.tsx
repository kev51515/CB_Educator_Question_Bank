/**
 * qbank/question-sets
 * ===================
 * The Question Sets section of the Question Bank, plus the mockTestToAssignment
 * adapter (TeacherMockTest -> Assignment shape for AssignmentFormModal's edit
 * mode). Extracted verbatim from QuestionBankPage.
 */
import { useEffect, useMemo, useState } from "react";
import { EmptyState, SkeletonRows } from "@/components";
import { type Assignment } from "@/teacher/useAssignments";
import { type TeacherMockTest } from "@/teacher/useTeacherMockTests";
import { type CatalogEntry } from "@/teacher/useQuestionBankCatalog";
import {
  CatalogCard,
  FilterPill,
  matchesSearch,
  type AxisFilter,
  type DifficultyFilter,
  type SectionFilter,
} from "./catalog";
/**
 * The teacher-mocktests query intentionally returns a slimmer shape than
 * the shared Assignment type (no created_by / opens_at — we don't need
 * them on a catalog card). AssignmentFormModal's edit mode reads from
 * the row directly via `initialAssignment` for the policy columns, so we
 * only need to provide the fields the form pre-populates from. The
 * missing fields are filled with safe defaults; they're never persisted
 * unless the teacher explicitly changes them in the form.
 */
export function mockTestToAssignment(m: TeacherMockTest): Assignment {
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

/**
 * Persisted filter selections for the Question Sets tab. The search query is
 * intentionally kept transient (not persisted) — only the axis/section/
 * difficulty pills survive a reload. The Question Bank is a global, role-level
 * surface (no course scope), so a single fixed key is used.
 */
const FILTERS_STORAGE_KEY = "educator.qbank.questionSets.filters";

interface PersistedFilters {
  axis: AxisFilter;
  section: SectionFilter;
  difficulty: DifficultyFilter;
}

const DEFAULT_FILTERS: PersistedFilters = {
  axis: "all",
  section: "all",
  difficulty: "all",
};

function isAxisFilter(v: unknown): v is AxisFilter {
  return v === "all" || v === "skill" || v === "domain" || v === "mixed";
}

function isSectionFilter(v: unknown): v is SectionFilter {
  return v === "all" || v === "math" || v === "reading-and-writing";
}

function isDifficultyFilter(v: unknown): v is DifficultyFilter {
  return v === "all" || v === "easy" || v === "medium" || v === "hard";
}

function loadFilters(): PersistedFilters {
  try {
    const raw = window.localStorage.getItem(FILTERS_STORAGE_KEY);
    if (!raw) return DEFAULT_FILTERS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_FILTERS;
    const obj = parsed as Record<string, unknown>;
    return {
      axis: isAxisFilter(obj.axis) ? obj.axis : DEFAULT_FILTERS.axis,
      section: isSectionFilter(obj.section)
        ? obj.section
        : DEFAULT_FILTERS.section,
      difficulty: isDifficultyFilter(obj.difficulty)
        ? obj.difficulty
        : DEFAULT_FILTERS.difficulty,
    };
  } catch {
    return DEFAULT_FILTERS;
  }
}

export interface QuestionSetsSectionProps {
  catalog: CatalogEntry[];
  loading: boolean;
  error: string | null;
  onAdd: (entry: CatalogEntry) => void;
}

export function QuestionSetsSection({
  catalog,
  loading,
  error,
  onAdd,
}: QuestionSetsSectionProps): JSX.Element {
  const [axisFilter, setAxisFilter] = useState<AxisFilter>(
    () => loadFilters().axis,
  );
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>(
    () => loadFilters().section,
  );
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyFilter>(
    () => loadFilters().difficulty,
  );
  // Search stays transient — only the pills are persisted.
  const [search, setSearch] = useState<string>("");

  // Persist filter selections on change so reloads don't reset them.
  useEffect(() => {
    try {
      window.localStorage.setItem(
        FILTERS_STORAGE_KEY,
        JSON.stringify({
          axis: axisFilter,
          section: sectionFilter,
          difficulty: difficultyFilter,
        }),
      );
    } catch {
      /* localStorage unavailable (private mode / quota) — ignore */
    }
  }, [axisFilter, sectionFilter, difficultyFilter]);

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
