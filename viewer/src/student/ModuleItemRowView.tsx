import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { assignmentTakePath, studentTestRunPath } from "@/lib/routes";
import { FullTestIcon, ItemIcon } from "./ItemIcon";
import { PageBlock, VideoBlock, FileBlock } from "./ModuleContentBlocks";
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
  /** Unopened + unsubmitted → show a red "new" dot guiding the student here
   *  (0224). Clears once they open the item. */
  pending?: boolean;
}

const DUE_TONE: Record<string, string> = {
  past: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900",
  soon: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900",
  normal:
    "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
};

/** Uppercase micro kind label under each title — educator modules canon. */
const KIND_LABEL_CLASS =
  "block mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500";

function Pill({ children, tone }: { children: ReactNode; tone: string }) {
  return (
    <span
      className={`flex-none inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${tone}`}
    >
      {children}
    </span>
  );
}

/** Small line-SVG check used inside the done/score pills (no glyph chars). */
function CheckGlyph(): JSX.Element {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="h-[11px] w-[11px] flex-none"
    >
      <path d="M4 12.5 9.5 18 20 6.5" />
    </svg>
  );
}

/** Warm amber padlock marking a row inside a locked module. */
function RowLock(): JSX.Element {
  return (
    <span
      aria-hidden
      className="flex-none text-amber-500 dark:text-amber-400/80"
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-[13px] w-[13px]"
      >
        <rect x="4" y="10.5" width="16" height="10" rx="2" />
        <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
      </svg>
    </span>
  );
}

/** Small red "new — open me" dot. Sits left of the title so it reads as a
 *  marker on the row, matching the Courses badge that pointed the student here. */
function NewDot(): JSX.Element {
  return (
    <span
      className="flex-none h-2 w-2 rounded-full bg-rose-500"
      aria-label="New — not opened yet"
      title="New — not opened yet"
    />
  );
}

export function ModuleItemRowView({ item, locked, meta, pending = false }: ModuleItemRowProps): JSX.Element | null {
  const navigate = useNavigate();

  if (!item.published) return null;

  const indent = Math.min(item.indent, 5);
  const padLeft = `${1 + indent * 1.5}rem`;
  const rowBase =
    "group w-full min-h-[44px] flex items-center gap-3 px-4 py-2 text-sm motion-safe:transition-colors";
  const interactive = locked
    ? "text-slate-400 dark:text-slate-600 cursor-not-allowed"
    : "text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50";

  // ---- Header --------------------------------------------------------------
  if (item.item_type === "header") {
    return (
      <div
        className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500"
        style={{ paddingLeft: padLeft }}
      >
        {item.title}
      </div>
    );
  }

  // ---- Divider (0225) — visual separator only ------------------------------
  if (item.item_type === "divider") {
    return (
      <div className="px-4 py-2" style={{ paddingLeft: padLeft }}>
        <hr className="border-t border-slate-200 dark:border-slate-700" />
      </div>
    );
  }

  // ---- Note / Callout (0225) — inline message, no click-through ------------
  if (item.item_type === "note") {
    const cfg = (item.config ?? {}) as { body?: string; tone?: string };
    const tone = cfg.tone === "warning" ? "warning" : cfg.tone === "tip" ? "tip" : "info";
    const toneClass =
      tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
        : tone === "tip"
          ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
          : "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200";
    return (
      <div className="px-4 py-1.5" style={{ paddingLeft: padLeft }}>
        <div className={`rounded-lg border px-3 py-2 ${toneClass}`}>
          {item.title ? <p className="text-sm font-semibold">{item.title}</p> : null}
          {cfg.body ? (
            <p className="whitespace-pre-wrap text-sm leading-snug">{cfg.body}</p>
          ) : null}
        </div>
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
        aria-label={`${pending ? "New, not opened. " : ""}${done ? "Review" : "Open"} ${label.toLowerCase()} ${item.title}`}
      >
        <ItemIcon type={item.item_type} />
        {pending && !locked && <NewDot />}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{item.title}</span>
          <span className={KIND_LABEL_CLASS}>
            {label}
            {meta?.questionCount ? (
              <span className="normal-case font-medium tracking-normal text-slate-400 dark:text-slate-500">
                {" "}· {meta.questionCount} Q
              </span>
            ) : null}
            {meta?.timeLimitMinutes ? (
              <span className="normal-case font-medium tracking-normal text-slate-400 dark:text-slate-500">
                {" "}· {meta.timeLimitMinutes} min
              </span>
            ) : null}
          </span>
        </span>
        {locked ? (
          <RowLock />
        ) : done && typeof score === "number" ? (
          <Pill tone="bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900">
            <CheckGlyph />
            {Math.round(score)}%
          </Pill>
        ) : done ? (
          <Pill tone="bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900">
            <CheckGlyph />
            Done
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
        {isFullTestLink ? <FullTestIcon /> : <ItemIcon type={item.item_type} />}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{item.title}</span>
          <span className={KIND_LABEL_CLASS}>
            {isFullTestLink ? "Practice Test" : "Link"}
          </span>
        </span>
        {locked ? (
          <RowLock />
        ) : !isFullTestLink ? (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className="h-3.5 w-3.5 flex-none text-slate-400 opacity-0 group-hover:opacity-100 motion-safe:transition-opacity"
          >
            <path d="M7 17 17 7M9 7h8v8" />
          </svg>
        ) : null}
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

  // ---- Learn content: Page / Video / File (0227) ---------------------------
  if (item.item_type === "page" || item.item_type === "video" || item.item_type === "file") {
    // Locked modules show a muted placeholder row, not the content.
    if (locked) {
      return (
        <div className={`${rowBase} ${interactive}`} style={{ paddingLeft: padLeft }}>
          <ItemIcon type={item.item_type} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{item.title}</span>
            <span className={KIND_LABEL_CLASS}>
              {item.item_type === "page" ? "Page" : item.item_type === "video" ? "Video" : "File"}
            </span>
          </span>
          <RowLock />
        </div>
      );
    }
    const cfg = (item.config ?? {}) as { body?: string };
    return (
      <div className="px-4 py-2" style={{ paddingLeft: padLeft }}>
        {item.title ? (
          <p className="mb-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
            {item.title}
          </p>
        ) : null}
        {item.item_type === "page" ? (
          <PageBlock body={cfg.body ?? ""} />
        ) : item.item_type === "video" ? (
          <VideoBlock url={item.url ?? ""} title={item.title} />
        ) : (
          <FileBlock url={item.url ?? ""} title={item.title} />
        )}
      </div>
    );
  }

  // ---- Unknown type — minimal safe row -------------------------------------
  return (
    <div className={`${rowBase} ${interactive}`} style={{ paddingLeft: padLeft }}>
      <ItemIcon type={item.item_type} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{item.title}</span>
      </span>
      {locked && <RowLock />}
    </div>
  );
}
