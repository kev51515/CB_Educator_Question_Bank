/**
 * FollowUpsPage — the cross-recording "Follow-ups" surface (/educator/follow-ups).
 * Every tracked follow-up the educator owns, grouped by due urgency (Overdue →
 * Today → This week → Later → No date), with completed ones collapsed at the
 * bottom. Each row links back to its source recording. The follow-through view
 * for counseling / coaching / teaching sessions.
 */
import { useEffect, useMemo, useState } from "react";
import { EmptyState, SkeletonRows, useToast } from "@/components";
import { supabase } from "@/lib/supabase";
import {
  deleteFollowUp,
  setFollowUpDone,
  setFollowUpDue,
  useFollowUps,
} from "./useFollowUps";
import { FollowUpItem, dueMeta } from "./FollowUpItem";
import type { RecordingFollowUp } from "./types";

type Bucket = "overdue" | "today" | "soon" | "later" | "none";
const BUCKET_ORDER: Bucket[] = ["overdue", "today", "soon", "later", "none"];
const BUCKET_LABEL: Record<Bucket, string> = {
  overdue: "Overdue",
  today: "Today",
  soon: "This week",
  later: "Later",
  none: "No due date",
};

/** Recording-id → title, for the "source" link under each row. */
function useRecordingTitles(ids: string[]) {
  const key = ids.slice().sort().join(",");
  const [titles, setTitles] = useState<Record<string, string>>({});
  useEffect(() => {
    if (ids.length === 0) {
      setTitles({});
      return;
    }
    let alive = true;
    void supabase
      .from("recordings")
      .select("id, title")
      .in("id", ids)
      .then(({ data }) => {
        if (!alive || !data) return;
        const map: Record<string, string> = {};
        for (const r of data as { id: string; title: string }[]) map[r.id] = r.title;
        setTitles(map);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return titles;
}

export function FollowUpsPage() {
  const { followUps, loading, error, refresh } = useFollowUps();
  const toast = useToast();

  const recIds = useMemo(
    () => Array.from(new Set(followUps.map((f) => f.recording_id).filter((x): x is string => !!x))),
    [followUps],
  );
  const titles = useRecordingTitles(recIds);

  const open = followUps.filter((f) => !f.done);
  const done = followUps.filter((f) => f.done);

  const grouped = useMemo(() => {
    const g: Record<Bucket, RecordingFollowUp[]> = { overdue: [], today: [], soon: [], later: [], none: [] };
    for (const f of open) g[dueMeta(f.due_at, false).bucket].push(f);
    return g;
  }, [open]);

  async function toggle(id: string, d: boolean) {
    try {
      await setFollowUpDone(id, d);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function setDue(id: string, iso: string | null) {
    try {
      await setFollowUpDue(id, iso);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function remove(id: string) {
    try {
      await deleteFollowUp(id);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function renderRow(fu: RecordingFollowUp) {
    return (
      <FollowUpItem
        key={fu.id}
        fu={fu}
        onToggle={(d) => void toggle(fu.id, d)}
        onSetDue={(iso) => void setDue(fu.id, iso)}
        onDelete={() => void remove(fu.id)}
        sourceTitle={fu.recording_id ? (titles[fu.recording_id] ?? "Recording") : null}
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Follow-ups</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Action items you’re tracking from your recordings.
        </p>
      </div>

      {loading ? (
        <SkeletonRows count={5} />
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : followUps.length === 0 ? (
        <EmptyState
          icon="check"
          title="No follow-ups yet"
          body="Open a recording with AI notes and click “Track” on an action item — it’ll show up here so you can close the loop after a session."
        />
      ) : (
        <div className="space-y-6">
          {BUCKET_ORDER.filter((b) => grouped[b].length > 0).map((b) => (
            <section key={b}>
              <h2
                className={`mb-1.5 text-xs font-semibold uppercase tracking-wide ${
                  b === "overdue" ? "text-red-600 dark:text-red-400" : "text-slate-500"
                }`}
              >
                {BUCKET_LABEL[b]} · {grouped[b].length}
              </h2>
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
                {grouped[b].map(renderRow)}
              </ul>
            </section>
          ))}

          {open.length === 0 && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-6 text-center text-sm text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300">
              All caught up — nothing open.
            </p>
          )}

          {done.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-600">
                Completed · {done.length}
              </summary>
              <ul className="mt-1.5 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
                {done.map(renderRow)}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
