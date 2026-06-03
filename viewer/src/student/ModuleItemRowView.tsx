import { useNavigate } from "react-router-dom";
import { useToast } from "../components/Toast";
import { assignmentTakePath } from "../lib/routes";
import { ItemIcon } from "./ItemIcon";
import type { ModuleItemRow } from "./studentCourseHelpers";

interface ModuleItemRowProps {
  item: ModuleItemRow;
  locked: boolean;
}

export function ModuleItemRowView({ item, locked }: ModuleItemRowProps) {
  const navigate = useNavigate();
  const toast = useToast();

  if (!item.published) return null;

  const indent = Math.min(item.indent, 5);
  const baseClass =
    "w-full min-h-[40px] flex items-center gap-3 px-3 py-2 rounded-md text-sm";
  const interactiveClass = locked
    ? "text-slate-400 dark:text-slate-600 cursor-not-allowed"
    : "text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800";

  // Full-length tests are stored as link items pointing at the Bluebook runner
  // (/test/:slug). Surface them with a "Test" tag rather than the generic link
  // icon, matching the teacher-side Modules page.
  const isFullTestLink =
    item.item_type === "link" && !!item.url?.startsWith("/test/");
  const leadingIcon = isFullTestLink ? (
    <span className="flex-none inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
      Test
    </span>
  ) : (
    <ItemIcon type={item.item_type} />
  );

  if (item.item_type === "header") {
    return (
      <div
        className="px-3 py-2 mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
        style={{ paddingLeft: `${0.75 + indent * 1.5}rem` }}
      >
        {item.title}
      </div>
    );
  }

  if (item.item_type === "assignment" && item.item_ref_id) {
    return (
      <button
        type="button"
        disabled={locked}
        onClick={() => navigate(assignmentTakePath(item.item_ref_id ?? ""))}
        className={`${baseClass} ${interactiveClass} text-left`}
        style={{ paddingLeft: `${0.75 + indent * 1.5}rem` }}
        aria-label={`Open assignment ${item.title}`}
      >
        <ItemIcon type={item.item_type} />
        <span className="flex-1 truncate">{item.title}</span>
      </button>
    );
  }

  if (item.item_type === "link" && item.url) {
    if (locked) {
      return (
        <div
          className={`${baseClass} ${interactiveClass}`}
          style={{ paddingLeft: `${0.75 + indent * 1.5}rem` }}
        >
          {leadingIcon}
          <span className="flex-1 truncate">{item.title}</span>
        </div>
      );
    }
    return (
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`${baseClass} ${interactiveClass}`}
        style={{ paddingLeft: `${0.75 + indent * 1.5}rem` }}
      >
        {leadingIcon}
        <span className="flex-1 truncate">{item.title}</span>
      </a>
    );
  }

  return (
    <button
      type="button"
      disabled={locked}
      onClick={() =>
        locked
          ? undefined
          : toast.info(`${item.title} — viewer coming soon`)
      }
      className={`${baseClass} ${interactiveClass} text-left`}
      style={{ paddingLeft: `${0.75 + indent * 1.5}rem` }}
    >
      <ItemIcon type={item.item_type} />
      <span className="flex-1 truncate">{item.title}</span>
    </button>
  );
}
