/**
 * AdminStatsPage
 * ==============
 * Thin route wrapper mounted at `/account/admin/stats`. Adds a page-level
 * header and delegates the data view to `SystemStats`, which is unchanged
 * — this exists only so the admin power-tools each have their own URL
 * and consistent chrome under the Account section.
 */
import { SystemStats } from "./SystemStats";

export function AdminStatsPage() {
  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          System stats
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Activity and roster counts across every course in the system.
        </p>
      </header>
      <SystemStats />
    </div>
  );
}
