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
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components";
import {
  NOTIFICATION_KINDS,
  isKindEnabled,
  loadPrefs,
  resetPrefs,
  savePrefs,
  togglePref,
  type NotificationPrefs,
} from "@/notifications/preferences";

/**
 * Recent notification row used by the preview list. A minimal shape — we
 * only need what's rendered, not the full NotificationRow contract.
 */
interface RecentNotificationRow {
  id: number;
  kind: string;
  title: string;
  read_at: string | null;
  created_at: string;
}

/**
 * Lookup map for the kind catalog. The preview shows kind labels (not raw
 * ids) and we tint the badge so it matches the toggle directly above it.
 */
const KIND_LABELS: Record<string, string> = NOTIFICATION_KINDS.reduce(
  (acc, kind) => {
    acc[kind.id] = kind.label;
    return acc;
  },
  {} as Record<string, string>,
);

/**
 * Format an ISO timestamp into a short relative string. Mirrors the format
 * used inside the NotificationBell so the preview reads identically to
 * what the user sees in the bell dropdown.
 */
function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const seconds = Math.max(1, Math.floor((now - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

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
  // Preview list is fetched RAW (no opt-out filtering) so the user can see
  // exactly which kinds they'd be silencing — including ones they've
  // already toggled off. useNotifications() would filter those out.
  const [recent, setRecent] = useState<RecentNotificationRow[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);

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

  // Fetch the 10 most recent notifications for the preview. Direct fetch
  // (instead of useNotifications) so we see opt-out'd kinds too — the
  // hook filters those, defeating the purpose of "see what you'd hide".
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, kind, title, read_at, created_at")
        .eq("recipient_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (cancelled) return;
      if (error) {
        setRecent([]);
      } else {
        setRecent((data ?? []) as RecentNotificationRow[]);
      }
      setLoadingRecent(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Realtime: keep the preview fresh so toggling a kind in another tab
  // (or receiving a new notification) updates immediately without a reload.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notif-prefs-preview:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        async () => {
          const { data, error } = await supabase
            .from("notifications")
            .select("id, kind, title, read_at, created_at")
            .eq("recipient_id", userId)
            .order("created_at", { ascending: false })
            .limit(10);
          if (!error) {
            setRecent((data ?? []) as RecentNotificationRow[]);
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

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

  // Memoize derived view so toggling prefs re-renders the "(hidden)" badge
  // suffixes without re-querying Supabase. The `prefs` dependency closes the
  // loop between the toggles above and the preview rows below.
  const previewRows = useMemo(() => {
    return recent.map((row) => {
      const enabled = isKindEnabled(prefs, row.kind);
      const label = KIND_LABELS[row.kind] ?? row.kind;
      return {
        ...row,
        kindLabel: label,
        hidden: !enabled,
      };
    });
  }, [recent, prefs]);

  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <Link
          // Sibling-relative so it resolves under either role prefix.
          to="../settings"
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

      <section
        aria-label="Recent notifications preview"
        className="space-y-2"
      >
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Recent notifications
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            These are the kinds of messages that just came through. Toggle off
            any you don't want to see.
          </p>
        </div>

        <div className="rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 divide-y divide-slate-200 dark:divide-slate-800">
          {loadingRecent ? (
            // Skeleton rows mirror the incoming layout (3 placeholder lines).
            <div className="px-5 py-4 space-y-3" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 animate-pulse"
                >
                  <div className="h-5 w-20 rounded-full bg-slate-200 dark:bg-slate-800" />
                  <div className="h-4 flex-1 rounded bg-slate-200 dark:bg-slate-800" />
                  <div className="h-4 w-16 rounded bg-slate-200 dark:bg-slate-800" />
                </div>
              ))}
            </div>
          ) : previewRows.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500 dark:text-slate-400 text-center">
              No recent notifications yet.
            </p>
          ) : (
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {previewRows.map((row) => {
                const unread = row.read_at === null;
                return (
                  <li
                    key={row.id}
                    aria-label={`${row.kindLabel}: ${row.title}${
                      row.hidden ? " (currently hidden)" : ""
                    }`}
                    className="flex items-start gap-3 px-5 py-3 min-h-[40px] motion-safe:transition-colors"
                  >
                    {/* Unread indicator — indigo dot in the gutter. */}
                    <span
                      aria-hidden="true"
                      className={[
                        "mt-2 inline-block h-2 w-2 rounded-full flex-shrink-0",
                        unread
                          ? "bg-indigo-500"
                          : "bg-transparent",
                      ].join(" ")}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Kind badge — tinted indigo to match the toggle's "on" color. */}
                        <span
                          className={[
                            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                            row.hidden
                              ? "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                              : "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
                          ].join(" ")}
                        >
                          {row.kindLabel}
                        </span>
                        <span
                          className={[
                            "text-sm truncate",
                            row.hidden
                              ? "text-slate-500 dark:text-slate-400"
                              : "text-slate-900 dark:text-slate-100",
                          ].join(" ")}
                        >
                          {row.title}
                        </span>
                        {row.hidden && (
                          // Slate "(hidden)" suffix — distinct in weight AND
                          // color so it isn't a pure color-only cue.
                          <span className="text-xs font-medium italic text-slate-500 dark:text-slate-400">
                            (hidden)
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-slate-500 dark:text-slate-400 flex-shrink-0 mt-0.5">
                      {formatRelative(row.created_at)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
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
