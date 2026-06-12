/**
 * SubscribeCalendarModal
 * ======================
 * Hands the student a private ICS feed URL (calendar-ics edge function +
 * per-user token from migration 0201) so due dates land in their personal
 * Google/Apple calendar. The token is the only credential on the URL —
 * treat it like a password; the copy explains that.
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ResponsiveModal, useToast } from "@/components";
import { Skeleton } from "@/components/Skeleton";

interface SubscribeCalendarModalProps {
  open: boolean;
  onClose: () => void;
}

export function SubscribeCalendarModal({ open, onClose }: SubscribeCalendarModalProps) {
  const toast = useToast();
  const [feedUrl, setFeedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // Fetch (or mint) the token lazily — only when the modal first opens.
  useEffect(() => {
    if (!open || feedUrl) return;
    let cancelled = false;
    void (async () => {
      const { data, error: rpcError } = await supabase.rpc(
        "get_or_create_calendar_token",
      );
      if (cancelled || !aliveRef.current) return;
      if (rpcError || !data) {
        setError("Could not create your calendar link. Please try again.");
        return;
      }
      const base = import.meta.env.VITE_SUPABASE_URL as string;
      setFeedUrl(`${base}/functions/v1/calendar-ics?token=${data as string}`);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, feedUrl]);

  const copy = async (): Promise<void> => {
    if (!feedUrl) return;
    try {
      await navigator.clipboard.writeText(feedUrl);
      toast.success("Calendar link copied");
    } catch {
      toast.error("Could not copy — select the link and copy it manually.");
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      title="Subscribe in your calendar app"
      subtitle="Due dates appear automatically in Google or Apple Calendar."
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] rounded-lg px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => void copy()}
            disabled={!feedUrl}
            data-autofocus
            className="min-h-[40px] rounded-lg bg-accent-700 hover:bg-accent-800 disabled:opacity-50 px-4 py-2 text-sm font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          >
            Copy link
          </button>
        </div>
      }
    >
      <div className="space-y-4 text-sm text-slate-600 dark:text-slate-300">
        {error ? (
          <p role="alert" className="text-rose-600 dark:text-rose-400">
            {error}
          </p>
        ) : feedUrl ? (
          <div className="rounded-lg bg-slate-50 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 px-3 py-2.5 font-mono text-xs break-all select-all">
            {feedUrl}
          </div>
        ) : (
          <Skeleton className="h-10 w-full rounded-lg" />
        )}

        <ol className="list-decimal space-y-1.5 pl-5">
          <li>
            <span className="font-medium text-slate-900 dark:text-slate-100">
              Google Calendar:
            </span>{" "}
            Settings → Add calendar → From URL → paste the link.
          </li>
          <li>
            <span className="font-medium text-slate-900 dark:text-slate-100">
              Apple Calendar:
            </span>{" "}
            File → New Calendar Subscription → paste the link.
          </li>
        </ol>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          This link is private to you — anyone with it can see your due dates,
          so don't share it. Calendar apps refresh subscribed feeds every few
          hours.
        </p>
      </div>
    </ResponsiveModal>
  );
}
