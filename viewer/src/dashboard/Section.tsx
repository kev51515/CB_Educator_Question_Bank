import { ChevronIcon } from "./needsAttentionIcons";
import { Skeleton } from "@/components/Skeleton";

function SectionSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-11 rounded-lg" />
      <Skeleton className="h-11 rounded-lg" />
      <Skeleton className="h-11 rounded-lg" />
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────

interface SectionProps {
  icon: React.ReactNode;
  label: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  children: React.ReactNode;
}

export function Section({
  icon,
  label,
  count,
  collapsed,
  onToggle,
  loading,
  error,
  onRetry,
  children,
}: SectionProps) {
  const sectionId = `attention-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <section className="space-y-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-controls={sectionId}
        className="
          w-full flex items-center gap-2 min-h-[40px] px-1 py-1
          rounded-md
          text-left
          focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
        "
      >
        <ChevronIcon collapsed={collapsed} />
        <span aria-hidden className="inline-flex items-center leading-none">
          {icon}
        </span>
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          {label}
        </span>
        <span
          className="
            inline-flex items-center justify-center min-w-[1.5rem] px-1.5
            h-5 rounded-full text-xs font-medium tabular-nums
            bg-indigo-100 text-indigo-700
            dark:bg-indigo-900/60 dark:text-indigo-200
          "
        >
          {count}
        </span>
      </button>
      {!collapsed && (
        <div id={sectionId} className="pl-1">
          {loading ? (
            <SectionSkeleton />
          ) : error ? (
            <div
              role="alert"
              className="
                flex items-center justify-between gap-2
                rounded-lg px-3 py-2 text-xs
                bg-rose-50 dark:bg-rose-950/40
                text-rose-700 dark:text-rose-300
                ring-1 ring-rose-200 dark:ring-rose-900
              "
            >
              <span className="truncate">Couldn't load: {error}</span>
              <button
                type="button"
                onClick={onRetry}
                className="
                  shrink-0 underline underline-offset-2
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded
                "
              >
                Retry
              </button>
            </div>
          ) : (
            children
          )}
        </div>
      )}
    </section>
  );
}
