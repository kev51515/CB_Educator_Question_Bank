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
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useClassContext } from "./classLayoutContext";
import { useProfile } from "@/lib/profile";
import { AnnouncementFormModal } from "./AnnouncementFormModal";
import { ConfirmDialog } from "./ConfirmDialog";
import { useAnnouncements, type Announcement } from "./useAnnouncements";
import { SafeHtml } from "@/components/SafeHtml";
import { KebabMenu, useOptimistic, type KebabMenuOption } from "@/components";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/Skeleton";

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

/**
 * Pure presentation: render an ISO timestamp as "2 hours ago" / "yesterday"
 * style relative text. Falls back to the date string if Intl.RelativeTimeFormat
 * is missing (it's standard in every modern browser, but Defense in Depth).
 */
function formatRelative(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const diffMs = then.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const minutes = Math.round(diffMs / 60_000);
  const hours = Math.round(diffMs / 3_600_000);
  const days = Math.round(diffMs / 86_400_000);

  // Tiny windows — say "just now" rather than "in 0 seconds".
  if (abs < 60_000) return "just now";

  try {
    const fmt = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    if (abs < 3_600_000) return fmt.format(minutes, "minute");
    if (abs < 86_400_000) return fmt.format(hours, "hour");
    if (abs < 30 * 86_400_000) return fmt.format(days, "day");
    return then.toLocaleDateString();
  } catch {
    return then.toLocaleString();
  }
}

/**
 * Click-to-edit title field — Enter or blur saves; Esc cancels. Empty /
 * unchanged values collapse back to the original without a network round-
 * trip. Mirrors ModulesPage's `InlineRename`.
 */
interface InlineTitleProps {
  value: string;
  onSave: (next: string) => Promise<void>;
}

function InlineTitle({ value, onSave }: InlineTitleProps): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = useCallback(async (): Promise<void> => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === value) {
      setEditing(false);
      setDraft(value);
      return;
    }
    try {
      await onSave(trimmed);
      // Only close on success; throws keep the input open with the user's
      // typed value so they can retry instead of losing it.
      setEditing(false);
    } catch {
      // Keep editing=true; the parent handler already toasted.
    }
  }, [draft, onSave, value]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setDraft(value);
            setEditing(false);
          }
        }}
        onBlur={() => {
          void commit();
        }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-800 ring-1 ring-indigo-400 rounded-md px-2 py-0.5 text-base font-semibold text-slate-900 dark:text-slate-100 w-full"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      className="group inline-flex items-center gap-1 min-w-0 text-left cursor-text"
      title="Click to rename"
    >
      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
        {value}
      </h3>
      <svg
        width={12}
        height={12}
        viewBox="0 0 16 16"
        aria-hidden
        className="opacity-60 group-hover:opacity-100 transition text-slate-400 flex-none"
      >
        <path
          fill="currentColor"
          d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-1.66 1.66l-3.56-3.56l1.66-1.66Zm-2.6 2.6L2.158 10.28a1.75 1.75 0 0 0-.479.864l-.7 2.91a.75.75 0 0 0 .907.907l2.91-.7a1.75 1.75 0 0 0 .864-.479l6.254-6.254l-3.56-3.56Z"
        />
      </svg>
    </button>
  );
}

interface AnnouncementCardProps {
  announcement: Announcement;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onPublishNow: () => void;
  onRenameCommit: (next: string) => Promise<void>;
  onAfterTogglePin: () => void;
  actionBusy: boolean;
  /**
   * True while the parent is mid-publish for this row. We surface it as
   * "Publishing…" on the kebab item and as an optimistic suppression of the
   * Scheduled badge so the row visually flips immediately.
   */
  publishingNow: boolean;
}

function AnnouncementCard({
  announcement,
  canManage,
  onEdit,
  onDelete,
  onPublishNow,
  onRenameCommit,
  onAfterTogglePin,
  actionBusy,
  publishingNow,
}: AnnouncementCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [pinned, applyPin] = useOptimistic<boolean>(announcement.pinned);
  const [pinBusy, setPinBusy] = useState(false);

  // Treat publish_at as "scheduled" only while it's still in the future.
  // Once the moment passes the row behaves like a normal published post and
  // the badge would just be noise. Recomputed on render — cheap.
  // While `publishingNow` is true we suppress the badge to give the row an
  // instant optimistic "published" appearance even before the refetch lands.
  const scheduledFor: string | null =
    !publishingNow &&
    announcement.publish_at &&
    new Date(announcement.publish_at).getTime() > Date.now()
      ? announcement.publish_at
      : null;

  const togglePin = async (): Promise<void> => {
    setPinBusy(true);
    const target = !pinned;
    await applyPin({
      optimistic: () => target,
      commit: async () => {
        const { error: updError } = await supabase
          .from("course_announcements")
          .update({ pinned: target })
          .eq("id", announcement.id);
        if (updError) throw new Error(updError.message);
      },
      successMessage: target ? "Pinned" : "Unpinned",
    });
    setPinBusy(false);
    onAfterTogglePin();
  };

  return (
    <article
      className="rounded-2xl bg-white/85 dark:bg-slate-900/70 ring-1 ring-slate-200 dark:ring-slate-800 p-5 shadow-sm space-y-3"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {canManage ? (
              <InlineTitle value={announcement.title} onSave={onRenameCommit} />
            ) : (
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                {announcement.title}
              </h3>
            )}
            {canManage ? (
              <button
                type="button"
                onClick={() => {
                  void togglePin();
                }}
                disabled={pinBusy || actionBusy}
                title={pinned ? "Pinned — click to unpin" : "Click to pin to top"}
                className={`rounded-full min-h-[40px] md:min-h-0 inline-flex items-center justify-center px-3 md:px-2 py-1.5 md:py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 transition ${
                  pinned
                    ? "bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 ring-amber-200 dark:ring-amber-900 hover:bg-amber-200 dark:hover:bg-amber-900/60"
                    : "bg-slate-50 dark:bg-slate-900 text-slate-400 dark:text-slate-500 ring-slate-200 dark:ring-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                } ${pinBusy ? "opacity-60 cursor-wait" : ""}`}
              >
                {pinned ? "Pinned" : "Pin"}
              </button>
            ) : (
              pinned && (
                <span className="rounded-full bg-amber-100 dark:bg-amber-950/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-900">
                  Pinned
                </span>
              )
            )}
            {/*
              Scheduled badge — only shown while publish_at is still in the
              future. Teachers see this on every still-queued row so they
              know it isn't visible to students yet.
            */}
            {scheduledFor && (
              <span
                className="rounded-full bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-200 dark:ring-indigo-900"
                title={`Will publish at ${new Date(scheduledFor).toLocaleString()}`}
              >
                Scheduled · {formatRelative(scheduledFor)}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-medium text-slate-600 dark:text-slate-300">
              {announcement.author_name}
            </span>
            <span aria-hidden> · </span>
            <time dateTime={announcement.created_at}>
              {formatRelative(announcement.created_at)}
            </time>
          </p>
        </div>

        {canManage && (
          <div className="shrink-0">
            <KebabMenu
              options={(
                [
                  { label: "Edit", onSelect: onEdit },
                  {
                    label: pinned ? "Unpin" : "Pin to top",
                    disabled: actionBusy || pinBusy,
                    hint: pinBusy ? "Updating pin…" : undefined,
                    onSelect: () => {
                      void togglePin();
                    },
                  },
                  // "Publish now" only appears while the row is still queued
                  // — once publish_at has passed it'd be a no-op so we hide it.
                  ...(scheduledFor
                    ? ([
                        {
                          label: publishingNow ? "Publishing…" : "Publish now",
                          disabled: actionBusy || publishingNow,
                          hint: publishingNow
                            ? "Updating…"
                            : "Push live immediately and notify students.",
                          onSelect: onPublishNow,
                        },
                      ] satisfies KebabMenuOption[])
                    : []),
                  {
                    label: "Delete…",
                    destructive: true,
                    onSelect: onDelete,
                  },
                ] satisfies KebabMenuOption[]
              )}
            />
          </div>
        )}
      </header>

      {/*
        Body collapsed: 3-line clamp. Expanded: full body preserving line breaks.
        Click anywhere on the body to toggle.
      */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="block w-full text-left"
      >
        {/* Body is HTML produced by MarkdownEditor (legacy plain text still renders correctly as a text node). */}
        <SafeHtml
          html={announcement.body}
          className={`prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 ${
            expanded ? "" : "line-clamp-3"
          }`}
        />
        <span className="mt-1 inline-block text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
          {expanded ? "Show less" : "Show more"}
        </span>
      </button>
    </article>
  );
}

interface ConfirmDeleteState {
  announcement: Announcement;
}

interface ConfirmPublishState {
  announcement: Announcement;
}

export function CourseAnnouncements() {
  const { cls } = useClassContext();
  const { profile } = useProfile();
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
      const { error: delError } = await supabase
        .from("course_announcements")
        .delete()
        .eq("id", announcement.id);
      if (delError) {
        toast.error("Couldn't delete announcement", delError.message);
        return;
      }
      setConfirmDelete(null);
      toast.success("Announcement deleted", announcement.title);
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

        {loading ? (
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
