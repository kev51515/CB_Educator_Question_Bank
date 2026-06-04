/**
 * course-announcements/AnnouncementCard
 * =====================================
 * One announcement card (title, body, publish state, kebab actions, inline
 * title rename). Extracted verbatim from CourseAnnouncements.
 */
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { KebabMenu, useOptimistic, type KebabMenuOption } from "@/components";
import { SafeHtml } from "@/components/SafeHtml";
import { type Announcement } from "@/teacher/useAnnouncements";
import { formatRelative } from "./helpers";
import { InlineTitle } from "./InlineTitle";
export interface AnnouncementCardProps {
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

export function AnnouncementCard({
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

