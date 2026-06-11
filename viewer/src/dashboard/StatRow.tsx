/**
 * StatRow
 * =======
 * Ledger-style stat strip that sits directly under the Dashboard greeting
 * (ivy-ledger mockup anatomy: small slate label, large display numeral,
 * small note line). Purely presentational — every value is derived from
 * data DashboardPage already holds in memory; this component issues no
 * queries of its own.
 *
 * Gold budget: the 30-day average is the dashboard's single `.ceremonial`
 * numeral (CohortCard intentionally renders its averages in plain ink so
 * the screen stays under the two-gold cap).
 */
import { Skeleton } from "@/components/Skeleton";

interface StatCardProps {
  label: string;
  note: string;
  /** Pre-formatted value. Null renders an em-dash placeholder. */
  value: string | null;
  /** Show a skeleton in the numeral slot while upstream data loads. */
  loading?: boolean;
  /** Ceremonial gold numeral (ivy theme) — use on at most one card. */
  ceremonial?: boolean;
}

function StatCard({ label, note, value, loading, ceremonial }: StatCardProps) {
  return (
    <div
      className="
        min-w-0 rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800
        bg-white dark:bg-slate-900/40 shadow-card
        px-5 pt-4 pb-3.5
      "
    >
      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className="mt-1.5 min-h-[38px]">
        {loading ? (
          <Skeleton className="h-8 w-14 rounded-lg" />
        ) : value === null ? (
          <span
            aria-label="No data yet"
            className="font-display text-[34px] font-medium leading-[1.1] text-slate-300 dark:text-slate-600"
          >
            &mdash;
          </span>
        ) : (
          <span
            className={`font-display text-[34px] font-medium leading-[1.1] tracking-[-0.01em] tabular-nums ${
              ceremonial
                ? "ceremonial text-slate-900 dark:text-slate-100"
                : "text-slate-900 dark:text-slate-100"
            }`}
          >
            {value}
          </span>
        )}
      </div>
      <div className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
        {note}
      </div>
    </div>
  );
}

export interface StatRowProps {
  /** Sum of member_count across live (non-archived) workspace courses. */
  activeStudents: number;
  /** Count of live (non-archived) workspace courses. */
  coursesLive: number;
  /** Sum of needs-attention counts across cohorts (cohort summary data). */
  needsAttention: number;
  /** Mean 30-day effective score across cohorts; null = no scored activity. */
  avgScore30d: number | null;
  /** True while the cohort summary (needs / avg) is still loading. */
  cohortLoading: boolean;
}

export function StatRow({
  activeStudents,
  coursesLive,
  needsAttention,
  avgScore30d,
  cohortLoading,
}: StatRowProps) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      <StatCard
        label="Active students"
        value={String(activeStudents)}
        note="across all live courses"
      />
      <StatCard
        label="Courses live"
        value={String(coursesLive)}
        note="published in this workspace"
      />
      <StatCard
        label="Needs attention"
        value={String(needsAttention)}
        note="items waiting on you"
        loading={cohortLoading}
      />
      <StatCard
        label="30-day average"
        value={avgScore30d === null ? null : `${Math.round(avgScore30d)}%`}
        note={
          avgScore30d === null
            ? "no scored activity yet"
            : "avg score, all cohorts"
        }
        loading={cohortLoading}
        ceremonial
      />
    </div>
  );
}
