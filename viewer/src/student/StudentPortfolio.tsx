/**
 * StudentPortfolio
 * ================
 * Student-side checklist for the course's portfolio. Wave 11A turns the flat
 * list into a read-only tree so structure mirrors the staff view. Header
 * items can be parents of other items — they just don't accept submissions,
 * so only leaf items render an "Open" button.
 *
 * Rendered inside the per-course Portfolio tab when the signed-in user is a
 * student. Staff sees a different surface (CoursePortfolio's StaffPortfolio).
 *
 * Wave 21D: adds status-filter pills (All / Submitted / Draft / Past due /
 * Not started) plus a Position/Due-date sort toggle. Filter + sort persist
 * to localStorage per (course). Empty branches collapse when a filter hides
 * all their leaf descendants. A polite live region announces filter changes.
 */
import { useEffect, useMemo, useState } from "react";
import { useClassContext } from "@/teacher/classLayoutContext";
import { useProfile } from "@/lib/profile";
import {
  buildStudentPortfolioTree,
  useStudentPortfolio,
  type StudentPortfolioItem,
  type StudentPortfolioItemNode,
  type StudentPortfolioItemType,
  type StudentPortfolioSubmission,
} from "./useStudentPortfolio";
import { PortfolioSubmissionForm } from "./PortfolioSubmissionForm";
import { SkeletonRows } from "@/components/Skeleton";

const TYPE_ICON: Record<StudentPortfolioItemType, string> = {
  short_text: "✏️",
  long_text: "📝",
  file: "📎",
  link: "🔗",
  number: "🔢",
  date: "📅",
  choice: "◉",
  multi_choice: "☑️",
};

function formatRelative(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const ms = d.getTime() - Date.now();
  const abs = Math.abs(ms);
  const days = Math.round(ms / 86_400_000);
  try {
    const fmt = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    if (abs < 86_400_000) {
      const hours = Math.round(ms / 3_600_000);
      return fmt.format(hours, "hour");
    }
    if (abs < 30 * 86_400_000) return fmt.format(days, "day");
    return d.toLocaleDateString();
  } catch {
    return d.toLocaleString();
  }
}

interface StatusInfo {
  label: string;
  className: string;
}

/**
 * Leaf-status enum used by the filter pills + by `leafStatus()`.
 * "submitted" wins, then "draft", then "past_due" (overdue + no submission),
 * else "not_started".
 */
type LeafStatus = "submitted" | "draft" | "past_due" | "not_started";

type FilterValue = "all" | LeafStatus;

type SortMode = "position" | "due_date";

function leafStatus(
  submission: StudentPortfolioSubmission | undefined,
  dueAt: string | null,
): LeafStatus {
  if (submission?.status === "submitted") return "submitted";
  if (submission?.status === "draft") return "draft";
  const overdue = dueAt !== null && new Date(dueAt).getTime() < Date.now();
  if (overdue) return "past_due";
  return "not_started";
}

function statusInfo(
  submission: StudentPortfolioSubmission | undefined,
  dueAt: string | null,
): StatusInfo {
  // Submitted wins over everything — emerald with relative timestamp.
  if (submission?.status === "submitted" && submission.submitted_at) {
    return {
      label: `Submitted ${formatRelative(submission.submitted_at)}`,
      className:
        "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 ring-emerald-200 dark:ring-emerald-900",
    };
  }
  if (submission?.status === "submitted") {
    return {
      label: "Submitted",
      className:
        "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 ring-emerald-200 dark:ring-emerald-900",
    };
  }
  // Past due + not submitted → amber "Overdue" per spec.
  const overdue =
    dueAt !== null && new Date(dueAt).getTime() < Date.now();
  if (overdue) {
    return {
      label: "Overdue",
      className:
        "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 ring-amber-200 dark:ring-amber-900",
    };
  }
  // Future due_at → slate "Due {relative}".
  if (dueAt !== null) {
    return {
      label: `Due ${formatRelative(dueAt)}`,
      className:
        "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-slate-200 dark:ring-slate-700",
    };
  }
  if (submission?.status === "draft") {
    return {
      label: "Draft",
      className:
        "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 ring-amber-200 dark:ring-amber-900",
    };
  }
  return {
    label: "Not started",
    className:
      "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-slate-200 dark:ring-slate-700",
  };
}

interface StudentNodeRowProps {
  node: StudentPortfolioItemNode;
  submissionsByItemId: Record<string, StudentPortfolioSubmission>;
  onOpen: (item: StudentPortfolioItem) => void;
  sortMode: SortMode;
}

/**
 * Sort children for display. Position is the existing default; Due date sorts
 * leaves ascending with nulls last, but children that are themselves parents
 * are kept in position order so the tree skeleton doesn't shuffle.
 */
function sortedChildren(
  children: readonly StudentPortfolioItemNode[],
  sortMode: SortMode,
): StudentPortfolioItemNode[] {
  if (sortMode === "position") return [...children];
  // Due-date sort: parents stay in position order, leaves sort by due_at asc
  // (nulls last). We don't sort across parent/leaf boundary — parents always
  // come before leaves to preserve the hierarchy reading order.
  const parents: StudentPortfolioItemNode[] = [];
  const leaves: StudentPortfolioItemNode[] = [];
  for (const c of children) {
    if (c.children.length > 0) parents.push(c);
    else leaves.push(c);
  }
  parents.sort((a, b) => a.position - b.position);
  leaves.sort((a, b) => {
    const aDue = a.due_at;
    const bDue = b.due_at;
    if (aDue === null && bDue === null) return a.position - b.position;
    if (aDue === null) return 1;
    if (bDue === null) return -1;
    return new Date(aDue).getTime() - new Date(bDue).getTime();
  });
  return [...parents, ...leaves];
}

function StudentNodeRow({
  node,
  submissionsByItemId,
  onOpen,
  sortMode,
}: StudentNodeRowProps): JSX.Element {
  const hasChildren = node.children.length > 0;
  const isLeaf = !hasChildren;
  const sub = isLeaf ? submissionsByItemId[node.id] : undefined;
  const info = isLeaf ? statusInfo(sub, node.due_at) : null;
  const ordered = hasChildren ? sortedChildren(node.children, sortMode) : [];

  return (
    <li className="list-none">
      <article
        className={`rounded-2xl ring-1 p-4 shadow-sm flex items-start gap-3 ${
          isLeaf
            ? "bg-white/85 dark:bg-slate-900/70 ring-slate-200 dark:ring-slate-800"
            : "bg-slate-50/60 dark:bg-slate-900/40 ring-slate-200 dark:ring-slate-800"
        }`}
      >
        <span
          aria-hidden
          className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-100 dark:ring-indigo-900 text-lg"
        >
          {TYPE_ICON[node.item_type]}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3
              className={`text-base truncate ${
                isLeaf
                  ? "font-semibold text-slate-900 dark:text-slate-100"
                  : "font-semibold text-slate-700 dark:text-slate-200"
              }`}
            >
              {node.title}
            </h3>
            {node.required && (
              <span className="rounded-full bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-100 dark:ring-indigo-900">
                Required
              </span>
            )}
            {info && (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${info.className}`}
              >
                {info.label}
              </span>
            )}
            {hasChildren && (
              <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400 ring-1 ring-slate-200 dark:ring-slate-700">
                {node.children.length} item
                {node.children.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          {node.prompt && (
            <p className="mt-1 text-sm text-slate-700 dark:text-slate-300 line-clamp-2">
              {node.prompt}
            </p>
          )}
        </div>
        {isLeaf && (
          <button
            type="button"
            onClick={() => onOpen(node)}
            className="shrink-0 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 min-h-[40px]"
          >
            Open
          </button>
        )}
      </article>

      {hasChildren && (
        <ul className="ml-6 mt-2 space-y-2 border-l-2 border-slate-200 dark:border-slate-800 pl-3">
          {ordered.map((child) => (
            <StudentNodeRow
              key={child.id}
              node={child}
              submissionsByItemId={submissionsByItemId}
              onOpen={onOpen}
              sortMode={sortMode}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * Walk a leaf node and count it under its status. Headers (with children) are
 * not counted as leaves — only items the student can actually submit to.
 */
function countLeafStatuses(
  nodes: readonly StudentPortfolioItemNode[],
  submissionsByItemId: Record<string, StudentPortfolioSubmission>,
  counts: Record<LeafStatus, number>,
): void {
  for (const n of nodes) {
    if (n.children.length > 0) {
      countLeafStatuses(n.children, submissionsByItemId, counts);
    } else {
      const s = leafStatus(submissionsByItemId[n.id], n.due_at);
      counts[s] += 1;
    }
  }
}

/**
 * Prune the tree so only branches with ≥1 matching leaf survive. Parents whose
 * descendants are all hidden are also hidden. Leaves are kept iff their status
 * matches the filter. Filter "all" returns the tree unchanged.
 */
function pruneTree(
  nodes: readonly StudentPortfolioItemNode[],
  submissionsByItemId: Record<string, StudentPortfolioSubmission>,
  filter: FilterValue,
): StudentPortfolioItemNode[] {
  if (filter === "all") return [...nodes];
  const out: StudentPortfolioItemNode[] = [];
  for (const n of nodes) {
    if (n.children.length === 0) {
      // Leaf — include iff status matches.
      const s = leafStatus(submissionsByItemId[n.id], n.due_at);
      if (s === filter) out.push(n);
      continue;
    }
    // Parent — recurse and only include if any descendant survives.
    const prunedChildren = pruneTree(n.children, submissionsByItemId, filter);
    if (prunedChildren.length > 0) {
      out.push({ ...n, children: prunedChildren });
    }
  }
  return out;
}

const FILTER_LABEL: Record<FilterValue, string> = {
  all: "All",
  submitted: "Submitted",
  draft: "Draft",
  past_due: "Past due",
  not_started: "Not started",
};

const FILTER_ACTIVE_CLASS: Record<FilterValue, string> = {
  all: "bg-indigo-600 text-white ring-indigo-600",
  submitted: "bg-emerald-600 text-white ring-emerald-600",
  draft: "bg-amber-600 text-white ring-amber-600",
  past_due: "bg-rose-600 text-white ring-rose-600",
  not_started: "bg-slate-600 text-white ring-slate-600",
};

const FILTER_INACTIVE_CLASS =
  "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 ring-slate-200 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800";

interface PersistedState {
  filter: FilterValue;
  sort: SortMode;
}

function isFilterValue(v: unknown): v is FilterValue {
  return (
    v === "all" ||
    v === "submitted" ||
    v === "draft" ||
    v === "past_due" ||
    v === "not_started"
  );
}

function isSortMode(v: unknown): v is SortMode {
  return v === "position" || v === "due_date";
}

function loadPersisted(courseId: string): PersistedState {
  try {
    const raw = localStorage.getItem(`student.portfolio.filter:${courseId}`);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        const obj = parsed as { filter?: unknown; sort?: unknown };
        return {
          filter: isFilterValue(obj.filter) ? obj.filter : "all",
          sort: isSortMode(obj.sort) ? obj.sort : "position",
        };
      }
    }
  } catch {
    // ignore — localStorage may be unavailable or contain malformed data.
  }
  return { filter: "all", sort: "position" };
}

function savePersisted(courseId: string, state: PersistedState): void {
  try {
    localStorage.setItem(
      `student.portfolio.filter:${courseId}`,
      JSON.stringify(state),
    );
  } catch {
    // ignore — quota or unavailable.
  }
}

export function StudentPortfolio() {
  const { cls } = useClassContext();
  const { profile } = useProfile();
  const { items, submissionsByItemId, loading, error, refresh } =
    useStudentPortfolio(cls.id, profile?.id ?? null);

  const [openItem, setOpenItem] = useState<StudentPortfolioItem | null>(null);
  const [filter, setFilter] = useState<FilterValue>("all");
  const [sortMode, setSortMode] = useState<SortMode>("position");

  // Hydrate per-course filter+sort from localStorage on mount and on
  // course-id change so navigating between courses keeps each course's state.
  useEffect(() => {
    const persisted = loadPersisted(cls.id);
    setFilter(persisted.filter);
    setSortMode(persisted.sort);
  }, [cls.id]);

  // Persist whenever the user changes the filter or sort.
  useEffect(() => {
    savePersisted(cls.id, { filter, sort: sortMode });
  }, [cls.id, filter, sortMode]);

  const tree = useMemo(() => buildStudentPortfolioTree(items), [items]);

  // Counts are computed over the full tree, not the pruned tree, so each pill
  // shows the total population of leaves matching that status.
  const counts = useMemo(() => {
    const c: Record<LeafStatus, number> = {
      submitted: 0,
      draft: 0,
      past_due: 0,
      not_started: 0,
    };
    countLeafStatuses(tree, submissionsByItemId, c);
    return c;
  }, [tree, submissionsByItemId]);

  const totalLeaves =
    counts.submitted + counts.draft + counts.past_due + counts.not_started;

  const visibleTree = useMemo(
    () => pruneTree(tree, submissionsByItemId, filter),
    [tree, submissionsByItemId, filter],
  );

  if (loading) {
    return (
      <div className="py-6">
        <SkeletonRows count={4} />
      </div>
    );
  }
  if (error) {
    return (
      <div
        role="alert"
        className="rounded-xl bg-rose-50 dark:bg-rose-950/40 ring-1 ring-rose-200 dark:ring-rose-900 px-4 py-3 text-sm text-rose-700 dark:text-rose-300"
      >
        {error}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="rounded-2xl bg-white/70 dark:bg-slate-900/50 ring-1 ring-dashed ring-slate-300 dark:ring-slate-700 px-6 py-10 text-center">
        <p className="text-slate-600 dark:text-slate-300 font-medium">
          No portfolio items yet
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Your teacher hasn't added any requirements to the portfolio.
        </p>
      </div>
    );
  }

  const pillValues: FilterValue[] = [
    "all",
    "submitted",
    "draft",
    "past_due",
    "not_started",
  ];

  const countForPill = (v: FilterValue): number =>
    v === "all" ? totalLeaves : counts[v];

  const liveMessage =
    filter === "all"
      ? `Showing all ${totalLeaves} portfolio items.`
      : `Filter set to ${FILTER_LABEL[filter]}. ${counts[filter]} item${
          counts[filter] === 1 ? "" : "s"
        } shown.`;

  return (
    <>
      <div className="space-y-3">
        <header>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Portfolio
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Complete each requirement as you progress through the course.
          </p>
        </header>

        {/* Filter pills + sort toggle.
            Pills are a tablist; the visible tree below is conceptually the
            tabpanel content. We don't tag it with role="tabpanel" because the
            tree contains interactive content (Open buttons) and a panel role
            would confuse the AT reading order — the polite live region below
            handles announcement instead. */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            role="tablist"
            aria-label="Filter portfolio items by status"
            className="flex flex-wrap gap-2"
          >
            {pillValues.map((v) => {
              const isActive = filter === v;
              const count = countForPill(v);
              return (
                <button
                  key={v}
                  role="tab"
                  type="button"
                  aria-selected={isActive}
                  onClick={() => setFilter(v)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium ring-1 min-h-[40px] transition-colors ${
                    isActive
                      ? FILTER_ACTIVE_CLASS[v]
                      : FILTER_INACTIVE_CLASS
                  }`}
                >
                  <span>{FILTER_LABEL[v]}</span>
                  <span
                    className={`inline-flex min-w-[1.25rem] justify-center rounded-full px-1.5 text-[10px] font-semibold ${
                      isActive
                        ? "bg-white/20 text-white"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <label
              htmlFor="portfolio-sort"
              className="text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Sort
            </label>
            <select
              id="portfolio-sort"
              aria-label="Sort portfolio"
              value={sortMode}
              onChange={(e) => {
                const v = e.target.value;
                if (isSortMode(v)) setSortMode(v);
              }}
              className="rounded-lg bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 px-2 py-2 min-h-[40px]"
            >
              <option value="position">Position</option>
              <option value="due_date">Due date</option>
            </select>
          </div>
        </div>

        <div className="sr-only" aria-live="polite" role="status">
          {liveMessage}
        </div>

        {visibleTree.length === 0 ? (
          <div className="rounded-2xl bg-white/70 dark:bg-slate-900/50 ring-1 ring-dashed ring-slate-300 dark:ring-slate-700 px-6 py-10 text-center">
            <p className="text-slate-600 dark:text-slate-300 font-medium">
              No items match this filter
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Try a different status or clear the filter.
            </p>
            <button
              type="button"
              onClick={() => setFilter("all")}
              className="mt-4 inline-flex items-center rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 min-h-[40px]"
            >
              Show all
            </button>
          </div>
        ) : (
          <ul className="space-y-2">
            {sortedChildren(visibleTree, sortMode).map((node) => (
              <StudentNodeRow
                key={node.id}
                node={node}
                submissionsByItemId={submissionsByItemId}
                onOpen={setOpenItem}
                sortMode={sortMode}
              />
            ))}
          </ul>
        )}
      </div>

      {openItem && profile && (
        <PortfolioSubmissionForm
          open={true}
          courseId={cls.id}
          studentId={profile.id}
          item={openItem}
          existing={submissionsByItemId[openItem.id] ?? null}
          onClose={() => setOpenItem(null)}
          onSaved={() => {
            void refresh();
          }}
        />
      )}
    </>
  );
}
