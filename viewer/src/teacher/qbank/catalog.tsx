/**
 * qbank/catalog
 * =============
 * The catalog-browsing UI bits for the Question Bank surface: section/axis/
 * difficulty filter label + tone maps, the generic <FilterPill>, the
 * <CatalogCard>/<SectionTab> presentational components, and the small pure
 * helpers (matchesSearch, previewHref, readPersistedSection). Extracted
 * verbatim from QuestionBankPage; all top-level decls exported via the barrel.
 */
import {
  type CatalogAxis,
  type CatalogDifficulty,
  type CatalogEntry,
  type CatalogSection,
} from "@/teacher/useQuestionBankCatalog";
export type ActiveSection = "practice-tests" | "question-sets";
export const ACTIVE_SECTION_STORAGE_KEY = "qbank.activeSection";

export function readPersistedSection(): ActiveSection {
  if (typeof window === "undefined") return "question-sets";
  try {
    const raw = window.localStorage.getItem(ACTIVE_SECTION_STORAGE_KEY);
    if (raw === "practice-tests" || raw === "question-sets") return raw;
  } catch {
    // localStorage may be unavailable (Safari private mode, etc.) — ignore.
  }
  return "question-sets";
}

export type AxisFilter = CatalogAxis | "all";
export type SectionFilter = CatalogSection | "all";
export type DifficultyFilter = CatalogDifficulty | "all";

export const AXIS_LABEL: Record<CatalogAxis, string> = {
  skill: "Skill",
  domain: "Domain",
  mixed: "Mixed",
};

export const SECTION_LABEL: Record<CatalogSection, string> = {
  math: "Math",
  "reading-and-writing": "Reading & Writing",
};

export const DIFFICULTY_LABEL: Record<CatalogDifficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

export const DIFFICULTY_TONE: Record<CatalogDifficulty, string> = {
  easy: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 ring-emerald-200 dark:ring-emerald-900",
  medium:
    "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 ring-amber-200 dark:ring-amber-900",
  hard: "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 ring-rose-200 dark:ring-rose-900",
};

export const SECTION_TONE: Record<CatalogSection, string> = {
  math: "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 ring-indigo-200 dark:ring-indigo-900",
  "reading-and-writing":
    "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 ring-sky-200 dark:ring-sky-900",
};

export interface FilterPillProps<T extends string> {
  active: boolean;
  label: string;
  value: T;
  onSelect: (value: T) => void;
}

export function FilterPill<T extends string>({
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

export interface CatalogCardProps {
  entry: CatalogEntry;
  onAdd: (entry: CatalogEntry) => void;
}

export function previewHref(entry: CatalogEntry): string {
  // catalog.json paths are relative to /exports/. The public path is
  // therefore /exports/<questionsHtml>.
  const path = entry.questionsHtml.replace(/^\/+/, "");
  return `/exports/${path}`;
}

export function CatalogCard({ entry, onAdd }: CatalogCardProps): JSX.Element {
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

export function matchesSearch(entry: CatalogEntry, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    entry.label.toLowerCase().includes(needle) ||
    entry.topic.toLowerCase().includes(needle)
  );
}

export interface SectionTabProps {
  active: boolean;
  label: string;
  count?: number;
  onSelect: () => void;
}

export function SectionTab({
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
