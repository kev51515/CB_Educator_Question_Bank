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
 */
import { useState } from "react";
import { useClassContext } from "../teacher/classLayoutContext";
import { useProfile } from "../lib/profile";
import {
  buildStudentPortfolioTree,
  useStudentPortfolio,
  type StudentPortfolioItem,
  type StudentPortfolioItemNode,
  type StudentPortfolioItemType,
  type StudentPortfolioSubmission,
} from "./useStudentPortfolio";
import { PortfolioSubmissionForm } from "./PortfolioSubmissionForm";
import { SkeletonRows } from "../components/Skeleton";

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
}

function StudentNodeRow({
  node,
  submissionsByItemId,
  onOpen,
}: StudentNodeRowProps): JSX.Element {
  const hasChildren = node.children.length > 0;
  const isLeaf = !hasChildren;
  const sub = isLeaf ? submissionsByItemId[node.id] : undefined;
  const info = isLeaf ? statusInfo(sub, node.due_at) : null;

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
            className="shrink-0 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2"
          >
            Open
          </button>
        )}
      </article>

      {hasChildren && (
        <ul className="ml-6 mt-2 space-y-2 border-l-2 border-slate-200 dark:border-slate-800 pl-3">
          {node.children.map((child) => (
            <StudentNodeRow
              key={child.id}
              node={child}
              submissionsByItemId={submissionsByItemId}
              onOpen={onOpen}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function StudentPortfolio() {
  const { cls } = useClassContext();
  const { profile } = useProfile();
  const { items, submissionsByItemId, loading, error, refresh } =
    useStudentPortfolio(cls.id, profile?.id ?? null);

  const [openItem, setOpenItem] = useState<StudentPortfolioItem | null>(null);

  const tree = buildStudentPortfolioTree(items);

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

        <ul className="space-y-2">
          {tree.map((node) => (
            <StudentNodeRow
              key={node.id}
              node={node}
              submissionsByItemId={submissionsByItemId}
              onOpen={setOpenItem}
            />
          ))}
        </ul>
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
