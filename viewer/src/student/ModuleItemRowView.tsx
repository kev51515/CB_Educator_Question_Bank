import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/components/Toast";
import { assignmentTakePath, studentTestRunPath } from "@/lib/routes";
import { ItemIcon } from "./ItemIcon";
import {
  type AssignmentMeta,
  type ModuleItemRow,
  kindLabel,
  formatDue,
} from "./studentCourseHelpers";

interface ModuleItemRowProps {
  item: ModuleItemRow;
  locked: boolean;
  /** Assignment metadata, present for published assignment items. */
  meta?: AssignmentMeta;
}

const DUE_TONE: Record<string, string> = {
  past: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900",
  soon: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900",
  normal:
    "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
};

function Pill({ children, tone }: { children: ReactNode; tone: string }) {
  return (
    <span
      className={`flex-none inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${tone}`}
    >
      {children}
    </span>
  );
}

export function ModuleItemRowView({ item, locked, meta }: ModuleItemRowProps): JSX.Element | null {
  const navigate = useNavigate();
  const toast = useToast();

  if (!item.published) return null;

  const indent = Math.min(item.indent, 5);
  const padLeft = `${0.75 + indent * 1.5}rem`;
  const rowBase =
    "group w-full min-h-[44px] flex items-center gap-3 px-3 py-2 rounded-lg text-sm motion-safe:transition-colors";
  const interactive = locked
    ? "text-slate-400 dark:text-slate-600 cursor-not-allowed"
    : "text-slate-800 dark:text-slate-200 hover:bg-slate-100/80 dark:hover:bg-slate-800/70";

  // ---- Header --------------------------------------------------------------
  if (item.item_type === "header") {
    return (
      <div
        className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500"
        style={{ paddingLeft: padLeft }}
      >
        {item.title}
      </div>
    );
  }

  // ---- Assignment (Practice Test / Question Set) ---------------------------
  if (item.item_type === "assignment" && item.item_ref_id) {
    const label = kindLabel(meta?.kind);
    const due = formatDue(meta?.due_at ?? null);
    const done = meta?.submitted === true;
    const score = meta?.bestScore;
    return (
      <button
        type="button"
        disabled={locked}
        onClick={() => navigate(assignmentTakePath(item.item_ref_id ?? ""))}
        className={`${rowBase} ${interactive} text-left`}
        style={{ paddingLeft: padLeft }}
        aria-label={`${done ? "Review" : "Open"} ${label.toLowerCase()} ${item.title}`}
      >
        <ItemIcon type={item.item_type} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-medium">{item.title}</span>
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="font-medium uppercase tracking-wide text-indigo-600 dark:text-indigo-300">
              {label}
            </span>
            {meta?.questionCount ? <span>· {meta.questionCount} Q</span> : null}
            {meta?.timeLimitMinutes ? <span>· {meta.timeLimitMinutes} min</span> : null}
          </span>
        </span>
        {done && typeof score === "number" ? (
          <Pill tone="bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900">
            ✓ {Math.round(score)}%
          </Pill>
        ) : done ? (
          <Pill tone="bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900">
            ✓ Done
          </Pill>
        ) : due ? (
          <Pill tone={DUE_TONE[due.tone]}>{due.text}</Pill>
        ) : null}
      </button>
    );
  }

  // ---- Full-length test (stored as a /test/:slug link item) ----------------
  const isFullTestLink =
    item.item_type === "link" && !!item.url?.startsWith("/test/");

  if (item.item_type === "link" && item.url) {
    const content = (
      <>
        {isFullTestLink ? (
          <Pill tone="bg-indigo-100 text-indigo-700 ring-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-300 dark:ring-indigo-800">
            Test
          </Pill>
        ) : (
          <ItemIcon type={item.item_type} />
        )}
        <span className="min-w-0 flex-1 truncate font-medium">{item.title}</span>
        {!locked && !isFullTestLink && (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className="h-3.5 w-3.5 flex-none text-slate-400 opacity-0 group-hover:opacity-100 motion-safe:transition-opacity"
          >
            <path d="M7 17 17 7M9 7h8v8" />
          </svg>
        )}
      </>
    );
    if (locked) {
      return (
        <div className={`${rowBase} ${interactive}`} style={{ paddingLeft: padLeft }}>
          {content}
        </div>
      );
    }
    // Full tests open in-place (the runner owns the tab); external links open new.
    if (isFullTestLink) {
      // Stored as the role-agnostic `/test/<slug>` (optionally with a
      // `?m=<first>-<last>` module-subset query). Split the slug from the query
      // — passing the whole thing to studentTestRunPath would URL-encode the `?`
      // into the slug (`…asia%3Fm%3D2-2`) and the runner couldn't find the test.
      // Navigate to the role-prefixed student runner, PRESERVING the ?m= query.
      const afterPrefix = (item.url ?? "").replace(/^\/test\//, "");
      const testSlug = afterPrefix.split("/")[0].split("?")[0];
      const qIndex = afterPrefix.indexOf("?");
      const testQuery = qIndex >= 0 ? afterPrefix.slice(qIndex) : "";
      return (
        <button
          type="button"
          onClick={() =>
            navigate(
              testSlug ? `${studentTestRunPath(testSlug)}${testQuery}` : item.url ?? "",
            )
          }
          className={`${rowBase} ${interactive} text-left`}
          style={{ paddingLeft: padLeft }}
          aria-label={`Open test ${item.title}`}
        >
          {content}
        </button>
      );
    }
    return (
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`${rowBase} ${interactive}`}
        style={{ paddingLeft: padLeft }}
      >
        {content}
      </a>
    );
  }

  // ---- Page / file (viewer deferred) ---------------------------------------
  return (
    <button
      type="button"
      disabled={locked}
      onClick={() => (locked ? undefined : toast.info(`${item.title} — viewer coming soon`))}
      className={`${rowBase} ${interactive} text-left`}
      style={{ paddingLeft: padLeft }}
    >
      <ItemIcon type={item.item_type} />
      <span className="min-w-0 flex-1 truncate font-medium">{item.title}</span>
    </button>
  );
}
