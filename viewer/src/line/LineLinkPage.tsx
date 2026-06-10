/**
 * LineLinkPage  (/line/link)
 * ==========================
 * Landing for the chat-initiated LINE Account Link flow. The bot DMs the user
 * `${LINE_LINK_BASE_URL}/line/link?linkToken=…`; this page (which only renders
 * for a signed-in user, since it lives inside the authenticated route tree)
 * mints a single-use nonce bound to their profile and forwards them to LINE's
 * accountLink dialog. LINE then fires the `accountLink` webhook → the binding
 * is finalized server-side. This page never sees a callback — it just redirects.
 */
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/lib/profile";
import { ROUTES } from "@/lib/routes";
import { peekPendingLinkToken, clearPendingLinkToken } from "./linkResume";

const ACCOUNT_LINK_DIALOG = "https://access.line.me/dialog/bot/accountLink";

type Status = "working" | "error";

export function LineLinkPage() {
  const [params] = useSearchParams();
  // From the URL, or the value stashed at boot before the sign-in redirect.
  const linkToken = params.get("linkToken") ?? peekPendingLinkToken() ?? "";
  const { profile } = useProfile();
  const [status, setStatus] = useState<Status>("working");
  const [message, setMessage] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    if (!profile) return; // wait for the profile/session to resolve
    started.current = true;

    if (!linkToken) {
      setStatus("error");
      setMessage(
        'This link is missing its token. Open the chat with our LINE Official Account and type "link" to start again.',
      );
      return;
    }

    void (async () => {
      try {
        const { data: nonce, error } = await supabase.rpc("create_line_link_nonce");
        if (error || !nonce) {
          setStatus("error");
          setMessage(error?.message ?? "Could not start linking. Please try again.");
          return;
        }
        clearPendingLinkToken(); // consumed — don't resume again
        const url =
          `${ACCOUNT_LINK_DIALOG}?linkToken=${encodeURIComponent(linkToken)}` +
          `&nonce=${encodeURIComponent(String(nonce))}`;
        window.location.href = url;
      } catch (e) {
        setStatus("error");
        setMessage(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      }
    })();
  }, [profile, linkToken]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-6 text-center space-y-4">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Connect LINE</h1>
        {status === "working" ? (
          <>
            <div
              className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600"
              aria-hidden="true"
            />
            <p className="text-sm text-slate-600 dark:text-slate-400" role="status">
              Connecting your LINE account… you'll return to LINE in a moment.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-rose-600 dark:text-rose-400" role="alert">
              {message}
            </p>
            <Link
              to={ROUTES.HOME}
              className="inline-block rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 min-h-[40px]"
            >
              Back to app
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
