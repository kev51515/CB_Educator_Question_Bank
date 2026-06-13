/**
 * FollowUpsPanel — on the recording detail page, below the AI notes. Lists the
 * follow-ups already promoted from this recording (check off / set due / delete)
 * and offers a one-click "Track" on any AI action item not yet promoted. Owner
 * only (the panel is only rendered for the recording's owner).
 */
import { useMemo } from "react";
import { useToast } from "@/components";
import type { RecordingActionItem } from "./types";
import {
  createFollowUp,
  deleteFollowUp,
  setFollowUpDone,
  setFollowUpDue,
  useFollowUps,
} from "./useFollowUps";
import { FollowUpItem } from "./FollowUpItem";
import { NoteSectionHeading } from "./notesUi";

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function FollowUpsPanel({
  recordingId,
  actionItems,
}: {
  recordingId: string;
  actionItems: RecordingActionItem[];
}) {
  const toast = useToast();
  const { followUps, loading, refresh } = useFollowUps(recordingId);

  // AI action items not yet promoted to a tracked follow-up.
  const untracked = useMemo(() => {
    const tracked = new Set(followUps.map((f) => norm(f.body)));
    return actionItems.filter((a) => a.text.trim() && !tracked.has(norm(a.text)));
  }, [actionItems, followUps]);

  async function track(item: RecordingActionItem) {
    try {
      await createFollowUp({
        recording_id: recordingId,
        body: item.text,
        assignee: item.owner ?? null,
      });
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function trackAll() {
    try {
      for (const item of untracked) {
        await createFollowUp({
          recording_id: recordingId,
          body: item.text,
          assignee: item.owner ?? null,
        });
      }
      toast.success(`Tracking ${untracked.length} follow-up${untracked.length === 1 ? "" : "s"}.`);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function toggle(id: string, done: boolean) {
    try {
      await setFollowUpDone(id, done);
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

  // Nothing to show: no tracked follow-ups AND no action items to promote.
  if (!loading && followUps.length === 0 && untracked.length === 0) return null;

  const openCount = followUps.filter((f) => !f.done).length;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-2 flex items-center justify-between">
        <NoteSectionHeading kind="actions">
          {openCount > 0 ? `Follow-ups · ${openCount} open` : "Follow-ups"}
        </NoteSectionHeading>
        {untracked.length > 1 && (
          <button
            type="button"
            onClick={() => void trackAll()}
            className="text-xs font-medium text-indigo-600 hover:underline"
          >
            Track all ({untracked.length})
          </button>
        )}
      </div>

      {followUps.length > 0 && (
        <ul className="-mx-5 divide-y divide-slate-100 border-y border-slate-100 dark:divide-slate-800 dark:border-slate-800">
          {followUps.map((fu) => (
            <FollowUpItem
              key={fu.id}
              fu={fu}
              onToggle={(done) => void toggle(fu.id, done)}
              onSetDue={(iso) => void setDue(fu.id, iso)}
              onDelete={() => void remove(fu.id)}
            />
          ))}
        </ul>
      )}

      {untracked.length > 0 && (
        <div className={followUps.length > 0 ? "mt-3" : ""}>
          {followUps.length > 0 && (
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
              From AI action items
            </p>
          )}
          <ul className="space-y-1">
            {untracked.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                <button
                  type="button"
                  onClick={() => void track(item)}
                  className="mt-0.5 shrink-0 rounded-md border border-slate-200 px-1.5 py-0.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:border-slate-700 dark:hover:bg-indigo-900/20"
                >
                  + Track
                </button>
                <span className="min-w-0 flex-1">
                  {item.text}
                  {item.owner && <span className="ml-1 text-xs text-slate-400">— {item.owner}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
