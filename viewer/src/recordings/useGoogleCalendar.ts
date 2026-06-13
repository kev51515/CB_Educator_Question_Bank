/**
 * useGoogleCalendar — opt-in Google Calendar connection for creating Meet links.
 *
 * This is SEPARATE from the main Google login: connect() runs its own OAuth with
 * the calendar.events scope, so an educator's normal sign-in consent screen is
 * unchanged. After the redirect, the provider refresh token is captured and
 * stored server-side (via the connect_google_calendar RPC — the token is never
 * client-readable afterwards). createMeet() calls the create-meet-link edge fn.
 *
 * Dormant until the owner: (a) adds the calendar.events scope in Google Cloud
 * Console, (b) sets GOOGLE_OAUTH_CLIENT_ID/SECRET + deploys create-meet-link.
 * See docs/GOOGLE_CALENDAR_SETUP.md.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const REDIRECT_FLAG = "gcal=connect";

export interface GoogleCalendarState {
  connected: boolean;
  connectedAt: string | null;
  loading: boolean;
}

export interface MeetLink {
  meet_url: string | null;
  event_id: string | null;
  html_link: string | null;
}

export function useGoogleCalendar() {
  const toast = useToast();
  const [state, setState] = useState<GoogleCalendarState>({
    connected: false,
    connectedAt: null,
    loading: true,
  });
  const aliveRef = useRef(true);

  const refreshStatus = useCallback(async () => {
    const { data } = await supabase.rpc("google_calendar_status");
    if (!aliveRef.current) return;
    const row = Array.isArray(data) ? data[0] : data;
    setState({
      connected: !!row?.connected,
      connectedAt: row?.connected_at ?? null,
      loading: false,
    });
  }, []);

  // On mount: if we just came back from the connect OAuth redirect, capture the
  // provider refresh token and store it; otherwise just load status.
  useEffect(() => {
    aliveRef.current = true;
    void (async () => {
      if (typeof window !== "undefined" && window.location.search.includes(REDIRECT_FLAG)) {
        const { data } = await supabase.auth.getSession();
        const refresh = data.session?.provider_refresh_token;
        if (refresh) {
          try {
            await supabase.rpc("connect_google_calendar", {
              p_refresh_token: refresh,
              p_scope: CALENDAR_SCOPE,
            });
            toast.success("Google Calendar connected.");
          } catch (e) {
            toast.error(`Couldn't finish connecting: ${(e as Error).message}`);
          }
        } else {
          toast.error("Google didn't return calendar access — try Connect again.");
        }
        // Strip the flag from the URL.
        const url = new URL(window.location.href);
        url.searchParams.delete("gcal");
        window.history.replaceState({}, "", url.pathname + url.search);
      }
      await refreshStatus();
    })();
    return () => {
      aliveRef.current = false;
    };
  }, [refreshStatus, toast]);

  const connect = useCallback(async () => {
    const origin = window.location.origin;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        scopes: CALENDAR_SCOPE,
        redirectTo: `${origin}/educator/recordings?${REDIRECT_FLAG}`,
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });
    if (error) toast.error(`Couldn't start Google connect: ${error.message}`);
  }, [toast]);

  const disconnect = useCallback(async () => {
    try {
      await supabase.rpc("disconnect_google_calendar");
      await refreshStatus();
      toast.success("Google Calendar disconnected.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [refreshStatus, toast]);

  const createMeet = useCallback(
    async (title: string): Promise<MeetLink | null> => {
      const { data, error } = await supabase.functions.invoke("create-meet-link", {
        body: { title },
      });
      if (error) {
        // Map the gated/error states to friendly messages.
        const msg = (await error.context?.text?.().catch(() => "")) || error.message;
        if (msg.includes("not_configured"))
          toast.error("Google Meet isn't set up yet — ask the admin to finish the Google Cloud setup.");
        else if (msg.includes("not_connected"))
          toast.error("Connect Google Calendar first.");
        else if (msg.includes("reauth_required")) {
          toast.error("Your Google connection expired — please Connect again.");
          await refreshStatus();
        } else toast.error(`Couldn't create Meet link: ${msg}`);
        return null;
      }
      return data as MeetLink;
    },
    [refreshStatus, toast],
  );

  return { state, connect, disconnect, createMeet, refreshStatus };
}
