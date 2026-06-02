/**
 * NotificationPreferencesPage
 * ===========================
 * Per-kind on/off toggles for the notification bell. Backed by
 * localStorage (no migration needed) — see `notifications/preferences.ts`.
 *
 * Saves immediately on toggle (no Save button). A "Reset to defaults"
 * button at the bottom clears all opt-outs so every kind is re-enabled.
 *
 * The hook `useNotifications` listens to the `storage` event and re-reads
 * prefs, so a change here propagates to the bell across tabs.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { ROUTES } from "../lib/routes";
import { useToast } from "@/components";
import {
  NOTIFICATION_KINDS,
  isKindEnabled,
  loadPrefs,
  resetPrefs,
  savePrefs,
  togglePref,
  type NotificationPrefs,
} from "../notifications/preferences";

interface ToggleSwitchProps {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}

/**
 * Small accessible switch — checkbox under the hood, styled as a pill.
 * 44px tap target satisfies CLAUDE.md's "≥40px" rule.
 */
function ToggleSwitch({ id, checked, onChange, ariaLabel }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={[
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full",
        "transition-colors focus:outline-none focus-visible:ring-2",
        "focus-visible:ring-indigo-500 focus-visible:ring-offset-2",
        "focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900",
        // 44px tap target — bigger than the visual via padding.
        "p-2 -m-2 box-content",
        checked
          ? "bg-indigo-600 dark:bg-indigo-500"
          : "bg-slate-300 dark:bg-slate-700",
      ].join(" ")}
    >
      <span
        aria-hidden="true"
        className={[
          "inline-block h-5 w-5 rounded-full bg-white shadow",
          "transform transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5",
        ].join(" ")}
      />
    </button>
  );
}

export function NotificationPreferencesPage() {
  const toast = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<NotificationPrefs>(() => loadPrefs(null));
  const [loadingUser, setLoadingUser] = useState(true);

  // Resolve the current user; per-user storage scoping prevents prefs
  // from bleeding across accounts on a shared device.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      if (cancelled) return;
      setUserId(uid);
      setPrefs(loadPrefs(uid));
      setLoadingUser(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onToggle = useCallback(
    (kindId: string, enabled: boolean) => {
      // The switch animation IS the affordance — a toast per toggle is noisy
      // when the user flips several prefs in quick succession. Save silently.
      const next = togglePref(prefs, kindId, enabled);
      setPrefs(next);
      if (userId) {
        savePrefs(userId, next);
      }
    },
    [prefs, userId],
  );

  const onReset = useCallback(() => {
    const next = resetPrefs();
    setPrefs(next);
    if (userId) {
      savePrefs(userId, next);
    }
    toast.success("Preferences reset", "All notification kinds re-enabled.");
  }, [userId, toast]);

  const hasAnyOptOuts = prefs.optedOut.size > 0;

  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <Link
          to={ROUTES.ACCOUNT_SETTINGS}
          className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
        >
          <span aria-hidden="true">←</span> Back to Settings
        </Link>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Notification preferences
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Choose which kinds of notifications you want to see in the bell.
          Changes save automatically and apply across tabs.
        </p>
      </header>

      <section
        className="rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 divide-y divide-slate-200 dark:divide-slate-800"
        aria-labelledby="notif-prefs-list"
      >
        <h3 id="notif-prefs-list" className="sr-only">
          Notification kinds
        </h3>
        {NOTIFICATION_KINDS.map((kind) => {
          const enabled = isKindEnabled(prefs, kind.id);
          const switchId = `notif-pref-${kind.id}`;
          return (
            <div
              key={kind.id}
              className="flex items-center gap-4 px-5 py-4"
            >
              <div className="min-w-0 flex-1">
                <label
                  htmlFor={switchId}
                  className="block text-sm font-medium text-slate-900 dark:text-slate-100 cursor-pointer"
                >
                  {kind.label}
                </label>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                  {kind.description}
                </p>
              </div>
              <ToggleSwitch
                id={switchId}
                checked={enabled}
                onChange={(next) => onToggle(kind.id, next)}
                ariaLabel={`${enabled ? "Disable" : "Enable"} ${kind.label.toLowerCase()}`}
              />
            </div>
          );
        })}
      </section>

      <div className="flex items-center justify-between gap-3 pt-2">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {loadingUser
            ? "Loading…"
            : hasAnyOptOuts
              ? `${prefs.optedOut.size} kind${prefs.optedOut.size === 1 ? "" : "s"} hidden.`
              : "All notification kinds enabled."}
        </p>
        <button
          type="button"
          onClick={onReset}
          disabled={!hasAnyOptOuts}
          className={[
            "rounded-lg text-sm font-medium px-4 py-2 min-h-[40px]",
            "ring-1 ring-slate-300 dark:ring-slate-700",
            "text-slate-700 dark:text-slate-200",
            "hover:bg-slate-50 dark:hover:bg-slate-800",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          ].join(" ")}
        >
          Reset to defaults
        </button>
      </div>
    </div>
  );
}
