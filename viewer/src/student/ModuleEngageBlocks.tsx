// Self-contained, read-only render blocks for a student course module list:
// a motivational GoalBlock and a LiveSessionBlock. No interactivity beyond
// the live-session "Join" link. Tailwind + slate palette + dark mode.

function TargetIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" />
    </svg>
  );
}

function VideoCallIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0"
      aria-hidden="true"
    >
      <rect x="2" y="6" width="13" height="12" rx="2" />
      <path d="M15 10l6-3.5v11L15 14z" />
    </svg>
  );
}

function formatStart(iso: string | undefined): string {
  if (!iso) return "Time TBD";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Time TBD";
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function GoalBlock({
  title,
  config,
}: {
  title: string;
  config: { target?: string; metric?: string };
}): JSX.Element {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-indigo-200 bg-indigo-50/60 px-4 py-3 ring-1 ring-indigo-200/50 dark:border-indigo-900 dark:bg-indigo-950/30 dark:ring-indigo-900/50 text-indigo-900 dark:text-indigo-200">
      <span className="mt-0.5 text-indigo-600 dark:text-indigo-300">
        <TargetIcon />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-semibold">{title}</h3>
          {config.metric ? (
            <span className="rounded-md bg-indigo-100 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300">
              {config.metric}
            </span>
          ) : null}
        </div>
        {config.target ? (
          <p className="mt-0.5 text-xs text-indigo-700/80 dark:text-indigo-300/80">
            {config.target}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function LiveSessionBlock({
  title,
  url,
  config,
}: {
  title: string;
  url: string | null;
  config: { starts_at?: string; duration_min?: number };
}): JSX.Element {
  const when = formatStart(config.starts_at);
  return (
    <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-3 ring-1 ring-emerald-200/50 dark:border-emerald-900 dark:bg-emerald-950/30 dark:ring-emerald-900/50 text-emerald-900 dark:text-emerald-200">
      <span className="mt-0.5 text-emerald-600 dark:text-emerald-300">
        <VideoCallIcon />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-semibold">{title}</h3>
        <p className="mt-0.5 text-xs text-emerald-700/80 dark:text-emerald-300/80">
          {when}
          {config.duration_min ? ` · ${config.duration_min} min` : ""}
        </p>
      </div>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600"
        >
          Join
        </a>
      ) : (
        <span className="shrink-0 text-xs font-medium text-emerald-700/60 dark:text-emerald-300/60">
          Link coming soon
        </span>
      )}
    </div>
  );
}
