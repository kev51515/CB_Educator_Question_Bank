/**
 * GoogleCalendarCard — opt-in "Connect Google Calendar" + create-a-Meet-link.
 *
 * GATED OFF by default (GOOGLE_CALENDAR_ENABLED=false) so educators don't see a
 * half-working feature. Flip the flag to true ONLY after the owner completes the
 * Google Cloud setup (calendar.events scope on the consent screen + the
 * GOOGLE_OAUTH_CLIENT_ID/SECRET secrets + deploying create-meet-link + applying
 * migration 0223). See docs/GOOGLE_CALENDAR_SETUP.md.
 */
import { useState } from "react";
import { useToast } from "@/components";
import { useGoogleCalendar } from "./useGoogleCalendar";

/** Master switch — keep false until the Google Cloud setup is done. */
export const GOOGLE_CALENDAR_ENABLED = false;

export function GoogleCalendarCard() {
  const toast = useToast();
  const { state, connect, disconnect, createMeet } = useGoogleCalendar();
  const [busy, setBusy] = useState(false);

  if (!GOOGLE_CALENDAR_ENABLED || state.loading) return null;

  async function newMeet() {
    setBusy(true);
    try {
      const link = await createMeet("Recorded session");
      if (link?.meet_url) {
        await navigator.clipboard.writeText(link.meet_url).catch(() => {});
        toast.success("Meet link created", "Copied to your clipboard.");
        window.open(link.meet_url, "_blank", "noopener");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50">
      <div className="text-sm">
        <span className="font-medium text-slate-900 dark:text-slate-100">Google Meet</span>
        <span className="ml-2 text-slate-500 dark:text-slate-400">
          {state.connected
            ? "Connected — create a Meet link to record a session."
            : "Connect Google Calendar to create Meet links."}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {state.connected ? (
          <>
            <button
              type="button"
              onClick={() => void newMeet()}
              disabled={busy}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy ? "Creating…" : "New Meet link"}
            </button>
            <button
              type="button"
              onClick={() => void disconnect()}
              className="text-sm text-slate-500 hover:underline"
            >
              Disconnect
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => void connect()}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-white dark:border-slate-600 dark:hover:bg-slate-700"
          >
            Connect Google Calendar
          </button>
        )}
      </div>
    </div>
  );
}
