/**
 * CourseAnnouncements
 * ===================
 * Announcements tab inside ClassLayout. Lists course-wide messages the
 * teacher has posted, ordered pinned-first then newest. Teachers can
 * create, edit, pin/unpin, and delete; students see the same rows on
 * their AreaSelector landing.
 *
 * Wave 8C UX upgrade — matches the ModulesPage bar:
 *   - Inline rename on the title (click → input → Enter/blur saves, Esc
 *     cancels). Mirror of `InlineRename` in ModulesPage.
 *   - One-click Pinned badge: clicking the chip toggles pinned via the
 *     existing `useOptimistic` flow. The Pin/Unpin kebab item stays as a
 *     discoverability backstop.
 *   - Delete success + failure now surface as toasts (was inline rose
 *     banner — see `useToast`).
 *
 * The list refreshes via realtime (see useAnnouncements) — a post created
 * in one tab appears in another with no manual reload.
 */
import { useCallback, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useClassContext } from "./classLayoutContext";
import { useProfile } from "@/lib/profile";
import { AnnouncementFormModal } from "./AnnouncementFormModal";
import { ConfirmDialog } from "./ConfirmDialog";
import { useAnnouncements, type Announcement } from "./useAnnouncements";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/Skeleton";
import {
  getErrorMessage,
  AnnouncementCard,
} from "@/teacher/course-announcements";



interface ConfirmDeleteState {
  announcement: Announcement;
}

interface ConfirmPublishState {
  announcement: Announcement;
}

export function CourseAnnouncements() {
  const { cls } = useClassContext();
  const { profile, loading: profileLoading } = useProfile();
  const { announcements, loading, error, refresh } = useAnnouncements(cls.id);
  const toast = useToast();

  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<Announcement | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ConfirmDeleteState | null>(
    null,
  );
  const [confirmPublish, setConfirmPublish] =
    useState<ConfirmPublishState | null>(null);
  // Default-OFF "Send notifications now" toggle for the publish-now confirm
  // dialog. When false (the default), the cron worker handles fan-out on its
  // next ~60s tick. When true, we call the new fanout_announcement_now() RPC
  // (migration 0069) right after the UPDATE so notifications land immediately.
  // Reset on every dialog open via setConfirmPublish.
  const [fanoutNow, setFanoutNow] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  // Tracks rows whose publish_at we just flipped to now() so we can show the
  // optimistic "no longer scheduled" state until the refetch lands. Keyed by
  // announcement id so multiple concurrent publishes don't trample each other.
  const [publishingIds, setPublishingIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );

  // Author surface: only staff (teachers, admins) reach this tab — the
  // route is teacher-gated by AuthGate. We still guard the button + manage
  // affordances on profile presence so a still-loading profile doesn't
  // render half a UI.
  const canManage = profile !== null;
  const authorId = profile?.id ?? "";

  const onRenameCommit = useCallback(
    async (announcement: Announcement, next: string): Promise<void> => {
      const { error: updError } = await supabase
        .from("course_announcements")
        .update({ title: next })
        .eq("id", announcement.id);
      if (updError) {
        toast.error("Couldn't rename announcement", updError.message);
        // Throw so InlineTitle keeps the draft open for retry instead of
        // resolving as success and discarding the user's typed value.
        throw new Error(updError.message);
      }
      toast.success("Announcement renamed", next);
      void refresh();
    },
    [refresh, toast],
  );

  /**
   * Publish a scheduled announcement immediately. Sets publish_at to now()
   * so the student-side visibility filter (publish_at IS NULL OR <= now())
   * picks it up on next read, and clears notifications_fanout_at so the
   * cron worker (see migration 0058) fans out notifications on its next
   * tick — within ~60s.
   *
   * When `sendNow` is true (the "Send notifications immediately" toggle on
   * the confirm dialog), we additionally call fanout_announcement_now()
   * from migration 0069 right after the UPDATE. That RPC runs the same
   * per-row fan-out the cron worker would have run on its next tick, so
   * student notifications land in seconds instead of within a minute.
   * The RPC is idempotent against the cron worker — both lock the row
   * FOR UPDATE — so a race lost to cron returns 0 silently and we still
   * report success.
   *
   * Optimistic: we add the row's id to `publishingIds` so the card hides
   * its Scheduled badge instantly. On error we roll back and toast.
   */
  const onPublishNow = async (
    announcement: Announcement,
    sendNow: boolean,
  ): Promise<void> => {
    setActionBusy(true);
    setPublishingIds((prev) => {
      const next = new Set(prev);
      next.add(announcement.id);
      return next;
    });
    try {
      const { error: updError } = await supabase
        .from("course_announcements")
        .update({
          publish_at: new Date().toISOString(),
          notifications_fanout_at: null,
        })
        .eq("id", announcement.id);
      if (updError) {
        // Roll back the optimistic flip so the Scheduled badge reappears.
        setPublishingIds((prev) => {
          const next = new Set(prev);
          next.delete(announcement.id);
          return next;
        });
        toast.error("Couldn't publish announcement", updError.message);
        return;
      }

      // If the teacher opted in to immediate fan-out, call the per-row RPC.
      // We treat its failure as non-fatal — the row is already published
      // (the UPDATE landed) and the cron worker will pick it up within ~60s
      // anyway. We just surface a softer warning so the teacher knows the
      // notification timing fell back to the cron path.
      let sent = false;
      if (sendNow) {
        const { data: rpcCount, error: rpcError } = await supabase.rpc(
          "fanout_announcement_now",
          { p_announcement_id: announcement.id },
        );
        if (rpcError) {
          toast.warning(
            "Published, but notifications fell back to the queue",
            `Notifications will go out within a minute. (${rpcError.message})`,
          );
        } else {
          // rpcCount is the integer the RPC returns: 1 if it fanned out, 0
          // if the cron worker won the race or the row was ineligible. Both
          // are "success" from the teacher's perspective — notifications
          // are either out or about to go out — so we surface "sent" copy.
          sent = typeof rpcCount === "number" && rpcCount >= 0;
        }
      }

      setConfirmPublish(null);
      setFanoutNow(false);
      toast.success(
        "Announcement published",
        sent
          ? "Students will see it on next page load. Notifications have been sent."
          : "Students will see it on next page load. Notifications go out within a minute.",
      );
      void refresh();
    } catch (err: unknown) {
      setPublishingIds((prev) => {
        const next = new Set(prev);
        next.delete(announcement.id);
        return next;
      });
      toast.error(
        "Couldn't publish announcement",
        getErrorMessage(err, "Failed to publish announcement."),
      );
    } finally {
      setActionBusy(false);
    }
  };

  const onDelete = async (announcement: Announcement) => {
    setActionBusy(true);
    try {
      // Soft delete (0202): Trash with 90-day recovery.
      const { error: delError } = await supabase.rpc("trash_content", {
        p_kind: "announcement",
        p_id: announcement.id,
      });
      if (delError) {
        toast.error("Couldn't delete announcement", delError.message);
        return;
      }
      setConfirmDelete(null);
      toast.success("Moved to Trash", `${announcement.title} — recoverable for 90 days.`, {
        action: {
          label: "Undo",
          onAction: () => {
            void supabase
              .rpc("restore_content", { p_kind: "announcement", p_id: announcement.id })
              .then(({ error }) => {
                if (error) toast.error("Couldn't restore", error.message);
                else {
                  toast.success("Announcement restored", announcement.title);
                  void refresh();
                }
              });
          },
        },
      });
      void refresh();
    } catch (err: unknown) {
      toast.error(
        "Couldn't delete announcement",
        getErrorMessage(err, "Failed to delete announcement."),
      );
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <>
      <div className="space-y-5">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Announcements
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Post messages every enrolled student sees on their dashboard.
            </p>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 shadow focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              + Announcement
            </button>
          )}
        </header>

        {/* Wait for the profile too — committing to the canManage=false branch
            while the role is still loading flashes student-voice copy (and no
            + Announcement button) at the teacher. */}
        {loading || profileLoading ? (
          <SkeletonRows count={3} rowClassName="h-24" />
        ) : error ? (
          <div
            role="alert"
            className="rounded-xl bg-rose-50 dark:bg-rose-950/40 ring-1 ring-rose-200 dark:ring-rose-900 px-4 py-3 text-sm text-rose-700 dark:text-rose-300"
          >
            {error}
          </div>
        ) : announcements.length === 0 ? (
          <EmptyState
            title="No announcements yet"
            body={
              canManage
                ? "Post an update to keep your students informed."
                : "Your teacher hasn't posted anything yet."
            }
            cta={
              canManage
                ? { label: "+ New", onClick: () => setShowCreate(true) }
                : undefined
            }
          />
        ) : (
          <div className="space-y-3">
            {announcements.map((a) => (
              <AnnouncementCard
                key={a.id}
                announcement={a}
                canManage={canManage}
                onEdit={() => setEditTarget(a)}
                onRenameCommit={(next) => onRenameCommit(a, next)}
                onAfterTogglePin={() => {
                  void refresh();
                }}
                onDelete={() => setConfirmDelete({ announcement: a })}
                onPublishNow={() => {
                  setFanoutNow(false);
                  setConfirmPublish({ announcement: a });
                }}
                publishingNow={publishingIds.has(a.id)}
                actionBusy={actionBusy}
              />
            ))}
          </div>
        )}
      </div>

      <AnnouncementFormModal
        open={showCreate}
        mode="create"
        targetCourseIds={[cls.id]}
        authorId={authorId}
        onClose={() => setShowCreate(false)}
        onCreated={() => {
          // Realtime will also fire, but invoking refresh keeps the UI
          // snappy when the realtime ack is slow.
          void refresh();
        }}
      />

      {editTarget && (
        <AnnouncementFormModal
          open={true}
          mode="edit"
          targetCourseIds={[cls.id]}
          authorId={authorId}
          initialAnnouncement={editTarget}
          onClose={() => setEditTarget(null)}
          onUpdated={() => {
            void refresh();
          }}
        />
      )}

      {confirmPublish && (
        <ConfirmDialog
          title="Publish this announcement now?"
          body={
            <div className="space-y-3">
              <p>
                <span className="font-semibold">
                  {confirmPublish.announcement.title}
                </span>{" "}
                will become visible to students immediately. Its scheduled
                time will be overwritten with the current moment.
              </p>
              <label
                className="flex items-start gap-2 rounded-lg ring-1 ring-slate-200 dark:ring-slate-800 p-2.5 cursor-pointer hover:ring-indigo-300 dark:hover:ring-indigo-700 motion-safe:transition-colors"
                title="Skip the 60-second cron tick and dispatch student notifications in this request."
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500"
                  checked={fanoutNow}
                  onChange={(e) => setFanoutNow(e.target.checked)}
                  disabled={actionBusy}
                  aria-describedby="publish-now-fanout-help"
                />
                <span className="text-sm">
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    Send notifications immediately
                  </span>
                  <span
                    id="publish-now-fanout-help"
                    className="block text-xs text-slate-500 dark:text-slate-400"
                  >
                    {fanoutNow
                      ? "Bell notifications go out as part of this request."
                      : "Bell notifications go out on the next cron tick (within a minute)."}
                  </span>
                </span>
              </label>
            </div>
          }
          confirmLabel={fanoutNow ? "Publish and notify" : "Publish now"}
          busy={actionBusy}
          onConfirm={() => {
            void onPublishNow(confirmPublish.announcement, fanoutNow);
          }}
          onCancel={() => {
            setConfirmPublish(null);
            setFanoutNow(false);
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this announcement?"
          body={
            <div className="space-y-2">
              <p>
                <span className="font-semibold">
                  {confirmDelete.announcement.title}
                </span>{" "}
                will be removed for every student in this course.
              </p>
              <p className="text-rose-700 dark:text-rose-300">
                This cannot be undone.
              </p>
            </div>
          }
          confirmLabel="Delete announcement"
          destructive
          busy={actionBusy}
          onConfirm={() => {
            void onDelete(confirmDelete.announcement);
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </>
  );
}
