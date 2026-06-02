import type { ReactNode } from "react";

type IconName = "sparkles" | "inbox" | "check" | "pencil";

interface EmptyStateCta {
  label: string;
  onClick: () => void;
}

interface EmptyStateProps {
  icon?: IconName | ReactNode;
  title: string;
  body?: string;
  cta?: EmptyStateCta;
  secondaryCta?: EmptyStateCta;
  framed?: boolean;
}

function BuiltInIcon({ name }: { name: IconName }) {
  const common = "h-6 w-6";
  switch (name) {
    case "inbox":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={common}
          aria-hidden="true"
        >
          <path d="M22 12h-6l-2 3h-4l-2-3H2" />
          <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
        </svg>
      );
    case "check":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={common}
          aria-hidden="true"
        >
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <path d="m9 11 3 3L22 4" />
        </svg>
      );
    case "pencil":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={common}
          aria-hidden="true"
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
        </svg>
      );
    case "sparkles":
    default:
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={common}
          aria-hidden="true"
        >
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
  }
}

function isIconName(value: unknown): value is IconName {
  return (
    value === "sparkles" ||
    value === "inbox" ||
    value === "check" ||
    value === "pencil"
  );
}

export function EmptyState({
  icon,
  title,
  body,
  cta,
  secondaryCta,
  framed = false,
}: EmptyStateProps) {
  const iconNode: ReactNode = isIconName(icon) ? (
    <BuiltInIcon name={icon} />
  ) : icon !== undefined ? (
    icon
  ) : (
    <BuiltInIcon name="sparkles" />
  );

  const inner = (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4 max-w-md mx-auto">
      <div className="h-12 w-12 rounded-2xl bg-slate-100 dark:bg-slate-800/60 flex items-center justify-center text-slate-300 dark:text-slate-700 mb-4">
        {iconNode}
      </div>
      <h3 className="text-base font-medium text-slate-700 dark:text-slate-200">
        {title}
      </h3>
      {body && (
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {body}
        </p>
      )}
      {(cta || secondaryCta) && (
        <div className="mt-4 flex items-center justify-center gap-2">
          {cta && (
            <button
              type="button"
              onClick={cta.onClick}
              className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2"
            >
              {cta.label}
            </button>
          )}
          {secondaryCta && (
            <button
              type="button"
              onClick={secondaryCta.onClick}
              className="rounded-lg bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium px-4 py-2 ring-1 ring-slate-200 dark:ring-slate-700"
            >
              {secondaryCta.label}
            </button>
          )}
        </div>
      )}
    </div>
  );

  if (framed) {
    return (
      <div className="rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900">
        {inner}
      </div>
    );
  }
  return inner;
}
