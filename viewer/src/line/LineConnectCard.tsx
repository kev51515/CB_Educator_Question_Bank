/**
 * LineConnectCard
 * ===============
 * Account-settings card for binding / managing a LINE account. Surface-coupled
 * to AccountSettings, so it lives in the `line/` domain folder (per CLAUDE.md)
 * rather than the shared component barrel.
 *
 *   - Not connected: friend-add CTA + the 3-step "type link in chat" guide.
 *   - Connected: per-type opt-out toggles (optimistic) + Disconnect.
 *
 * Linking itself happens chat-first (LineLinkPage handles the redirect); this
 * card can't initiate it from the web because we don't have the user's LINE
 * userId until they're in the OA chat — hence the add-friend + "type link" steps.
 */
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components";
import { useLineLink } from "./useLineLink";

// The OA add-friend deep link (https://line.me/R/ti/p/@basicid). Set as a Vite
// env once the Official Account exists; until then the card shows a fallback.
const ADD_FRIEND_URL = import.meta.env.VITE_LINE_OA_URL as string | undefined;

// Friendly labels over notifications.kind values for the per-type toggles.
const PREF_KINDS: Array<{ key: string; label: string; desc: string }> = [
  { key: "announcement", label: "Announcements", desc: "New class announcements" },
  { key: "assignment_grade", label: "Grades & feedback", desc: "When work is graded or commented" },
  { key: "message", label: "Messages", desc: "New direct messages" },
];

export function LineConnectCard() {
  const toast = useToast();
  const { link, loading, refresh, setLink } = useLineLink();
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [busy, setBusy] = useState(false);

  const linked = link?.status === "linked";

  async function togglePref(kind: string, on: boolean) {
    if (!link) return;
    const prev = link;
    const nextPrefs = { ...(link.prefs ?? {}) };
    if (on) delete nextPrefs[kind];
    else nextPrefs[kind] = "off";
    setLink({ ...link, prefs: nextPrefs }); // optimistic
    const { error } = await supabase
      .from("line_links")
      .update({ prefs: nextPrefs })
      .eq("profile_id", link.profile_id);
    if (error) {
      setLink(prev); // rollback
      toast.error("Couldn't update preference", error.message);
    }
  }

  async function disconnect() {
    if (!link) return;
    setBusy(true);
    const { error } = await supabase
      .from("line_links")
      .delete()
      .eq("profile_id", link.profile_id);
    setBusy(false);
    setConfirmingDisconnect(false);
    if (error) {
      toast.error("Couldn't disconnect", error.message);
      return;
    }
    setLink(null);
    toast.success("LINE disconnected", "You'll no longer get notifications on LINE.");
  }

  return (
    <section className="rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          LINE notifications
        </h2>
        {linked && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
            Connected
          </span>
        )}
      </div>

      {loading ? (
        <div
          className="h-16 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse"
          aria-busy="true"
        />
      ) : linked ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Connected
            {link?.display_name ? (
              <>
                {" "}
                as{" "}
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {link.display_name}
                </span>
              </>
            ) : null}
            . Choose what you receive on LINE:
          </p>
          <ul className="space-y-2">
            {PREF_KINDS.map(({ key, label, desc }) => {
              const on = (link?.prefs?.[key] ?? "on") !== "off";
              return (
                <li key={key} className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {label}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{desc}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={`${label} on LINE`}
                    onClick={() => void togglePref(key, !on)}
                    className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
                      on ? "bg-indigo-600" : "bg-slate-300 dark:bg-slate-700"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                        on ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
          {!confirmingDisconnect ? (
            <button
              type="button"
              onClick={() => setConfirmingDisconnect(true)}
              className="text-sm font-medium text-rose-600 dark:text-rose-400 hover:underline"
            >
              Disconnect LINE
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600 dark:text-slate-400">Disconnect LINE?</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void disconnect()}
                className="rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-sm font-medium px-3 py-1.5 min-h-[36px]"
              >
                {busy ? "…" : "Disconnect"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDisconnect(false)}
                className="rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 text-sm px-3 py-1.5 text-slate-700 dark:text-slate-200 min-h-[36px]"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Get reminders, grades, and announcements on LINE.
          </p>
          <ol className="list-decimal list-inside space-y-1 text-sm text-slate-600 dark:text-slate-400">
            <li>Add our LINE Official Account as a friend.</li>
            <li>
              In the LINE chat, type{" "}
              <span className="font-medium text-slate-900 dark:text-slate-100">link</span>.
            </li>
            <li>Tap the link it sends back to finish (you may need to sign in).</li>
          </ol>
          {ADD_FRIEND_URL ? (
            <a
              href={ADD_FRIEND_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-lg bg-[#06C755] hover:brightness-95 text-white text-sm font-medium px-4 py-2 min-h-[40px]"
            >
              Add on LINE
            </a>
          ) : (
            <p className="rounded-md bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
              Ask your teacher for the LINE Official Account to add.
            </p>
          )}
          <button
            type="button"
            onClick={() => void refresh()}
            className="block text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            I've linked — refresh status
          </button>
        </div>
      )}
    </section>
  );
}
