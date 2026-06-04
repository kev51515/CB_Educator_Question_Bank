/**
 * course-discussions/TopicRow
 * ===========================
 * One topic row in the discussions list (title, unread state, reply count,
 * kebab actions, inline rename). Extracted verbatim from CourseDiscussions.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { KebabMenu, useOptimistic, type KebabMenuOption } from "@/components";
import { SafeHtml } from "@/components/SafeHtml";
import { courseDiscussionPath } from "@/lib/routes";
import { type DiscussionTopic } from "@/teacher/useDiscussions";
import { formatRelative, replyLabel, type UnreadState } from "./helpers";
import { InlineRenameTitle } from "./InlineRenameTitle";
export interface TopicRowProps {
  topic: DiscussionTopic;
  courseId: string;
  replyCount: number | undefined;
  unreadState: UnreadState;
  canManage: boolean;
  onRename: (topic: DiscussionTopic, nextTitle: string) => Promise<void>;
  onEdit: (topic: DiscussionTopic) => void;
  onDelete: (topic: DiscussionTopic) => void;
}

export function TopicRow({
  topic,
  courseId,
  replyCount,
  unreadState,
  canManage,
  onRename,
  onEdit,
  onDelete,
}: TopicRowProps) {
  const [pinned, applyPin] = useOptimistic<boolean>(topic.pinned);
  const [locked, applyLock] = useOptimistic<boolean>(topic.locked);
  const [pinBusy, setPinBusy] = useState(false);
  const [lockBusy, setLockBusy] = useState(false);

  const togglePin = async (): Promise<void> => {
    setPinBusy(true);
    const target = !pinned;
    await applyPin({
      optimistic: () => target,
      commit: async () => {
        const { error: updError } = await supabase
          .from("discussion_topics")
          .update({ pinned: target })
          .eq("id", topic.id);
        if (updError) throw new Error(updError.message);
      },
      successMessage: target ? "Pinned" : "Unpinned",
    });
    setPinBusy(false);
  };

  const toggleLock = async (): Promise<void> => {
    setLockBusy(true);
    const target = !locked;
    await applyLock({
      optimistic: () => target,
      commit: async () => {
        const { error: updError } = await supabase
          .from("discussion_topics")
          .update({ locked: target })
          .eq("id", topic.id);
        if (updError) throw new Error(updError.message);
      },
      successMessage: target ? "Locked" : "Unlocked",
    });
    setLockBusy(false);
  };

  // Card wrapper — Link wraps the body, with the inline-managed badges + kebab
  // floating on top so their clicks don't navigate.
  return (
    <div className="relative rounded-2xl bg-white/85 dark:bg-slate-900/70 ring-1 ring-slate-200 dark:ring-slate-800 p-5 shadow-sm hover:ring-indigo-300 dark:hover:ring-indigo-700 transition">
      <Link
        to={courseDiscussionPath(courseId, topic.short_code)}
        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-xl"
      >
        <div className="flex items-center gap-2 flex-nowrap pr-28">
          {unreadState === "visited-new" && (
            <span
              aria-label="New replies since your last visit"
              title="New replies since your last visit"
              className="flex-shrink-0 inline-block h-2 w-2 rounded-full bg-indigo-500 dark:bg-indigo-400 motion-safe:transition-colors"
            />
          )}
          {unreadState === "never" && (
            <span
              aria-label="You haven't opened this topic yet"
              title="You haven't opened this topic yet"
              className="flex-shrink-0 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-700 motion-safe:transition-colors"
            >
              Unread
            </span>
          )}
          <div className="min-w-0 flex-1">
            {canManage ? (
              <InlineRenameTitle
                value={topic.title}
                disabled={false}
                onSave={(next) => onRename(topic, next)}
              />
            ) : (
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                {topic.title}
              </h3>
            )}
          </div>
          {/*
            Read-only badges for non-managers (the interactive toggle versions
            live in the header overlay below so their clicks don't navigate).
          */}
          {!canManage && pinned && (
            <span className="flex-shrink-0 rounded-full bg-amber-100 dark:bg-amber-950/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-900">
              Pinned
            </span>
          )}
          {!canManage && locked && (
            <span className="flex-shrink-0 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-700">
              Locked
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          <span className="font-medium text-slate-600 dark:text-slate-300">
            {topic.author_name}
          </span>
          <span aria-hidden> · </span>
          <time dateTime={topic.created_at}>
            {formatRelative(topic.created_at)}
          </time>
          {replyCount !== undefined && (
            <>
              <span aria-hidden> · </span>
              <span
                className={
                  replyCount === 0
                    ? "text-slate-400 dark:text-slate-500"
                    : "font-medium text-indigo-600 dark:text-indigo-400"
                }
              >
                {replyLabel(replyCount)}
              </span>
            </>
          )}
          {unreadState === "visited-new" && (
            <>
              <span aria-hidden> · </span>
              <span className="font-medium text-indigo-600 dark:text-indigo-400">
                New replies since your last visit
              </span>
            </>
          )}
        </p>
        {/* Body is HTML produced by MarkdownEditor (legacy plain text still renders correctly as a text node). */}
        <SafeHtml
          html={topic.body}
          className="mt-2 prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 line-clamp-2"
        />
      </Link>

      {/* Header overlay: status toggles (left of kebab) + kebab. Sits above
          the <Link> via z-index. */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
        {canManage && (
          <>
            <button
              type="button"
              disabled={pinBusy}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void togglePin();
              }}
              title={pinned ? "Unpin topic" : "Pin to top"}
              aria-label={pinned ? "Unpin topic" : "Pin to top"}
              className={`rounded-full min-h-[40px] md:min-h-0 inline-flex items-center justify-center px-3 md:px-2 py-1.5 md:py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 transition disabled:opacity-50 ${
                pinned
                  ? "bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 ring-amber-200 dark:ring-amber-900 hover:bg-amber-200 dark:hover:bg-amber-900/60"
                  : "bg-transparent text-slate-400 dark:text-slate-500 ring-slate-200 dark:ring-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              {pinned ? "Pinned" : "Pin"}
            </button>
            <button
              type="button"
              disabled={lockBusy}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void toggleLock();
              }}
              title={locked ? "Unlock topic" : "Lock topic"}
              aria-label={locked ? "Unlock topic" : "Lock topic"}
              className={`rounded-full min-h-[40px] md:min-h-0 inline-flex items-center justify-center px-3 md:px-2 py-1.5 md:py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 transition disabled:opacity-50 ${
                locked
                  ? "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 ring-slate-300 dark:ring-slate-700 hover:bg-slate-300 dark:hover:bg-slate-700"
                  : "bg-transparent text-slate-400 dark:text-slate-500 ring-slate-200 dark:ring-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              {locked ? "Locked" : "Lock"}
            </button>

            {/* Kebab sits above the underlying <Link> via z-index already on
                the wrapping overlay; stop click propagation via a small wrap. */}
            <div
              onClick={(e) => {
                e.stopPropagation();
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
              }}
            >
              <KebabMenu
                options={(
                  [
                    { label: "Edit", onSelect: () => onEdit(topic) },
                    {
                      label: pinned ? "Unpin" : "Pin to top",
                      disabled: pinBusy,
                      hint: pinBusy ? "Updating pin…" : undefined,
                      onSelect: () => {
                        void togglePin();
                      },
                    },
                    {
                      label: locked ? "Unlock" : "Lock",
                      disabled: lockBusy,
                      hint: lockBusy ? "Updating lock…" : undefined,
                      onSelect: () => {
                        void toggleLock();
                      },
                    },
                    {
                      label: "Delete…",
                      destructive: true,
                      onSelect: () => onDelete(topic),
                    },
                  ] satisfies KebabMenuOption[]
                )}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

