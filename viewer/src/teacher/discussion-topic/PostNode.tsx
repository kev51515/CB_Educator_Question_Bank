/**
 * discussion-topic/PostNode
 * =========================
 * One post in the threaded tree (body, author, actions, recursive children),
 * wiring the inline ReplyForm / EditForm. Extracted verbatim from
 * DiscussionTopicView.
 */
import { useState } from "react";
import { SafeHtml } from "@/components/SafeHtml";
import { type DiscussionPost } from "@/teacher/useTopicPosts";
import { formatRelative, type PostTreeNode } from "./helpers";
import { EditForm } from "./EditForm";
import { ReplyForm } from "./ReplyForm";
export interface PostNodeProps {
  node: PostTreeNode;
  topicLocked: boolean;
  depth: number;
  canManage: (post: DiscussionPost) => boolean;
  onSubmitReply: (body: string, parentPostId: string | null) => Promise<boolean>;
  onEditPost: (post: DiscussionPost, body: string) => Promise<boolean>;
  onDeletePost: (post: DiscussionPost) => void;
  collapsedIds: Set<string>;
  onToggleCollapsed: (postId: string) => void;
}

export function PostNode({
  node,
  topicLocked,
  depth,
  canManage,
  onSubmitReply,
  onEditPost,
  onDeletePost,
  collapsedIds,
  onToggleCollapsed,
}: PostNodeProps) {
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const indent = Math.min(depth, 4);
  const indentClass =
    indent === 0
      ? ""
      : indent === 1
        ? "pl-4 sm:pl-6 border-l border-slate-200 dark:border-slate-800"
        : indent === 2
          ? "pl-4 sm:pl-6 border-l border-slate-200 dark:border-slate-800"
          : "pl-4 border-l border-slate-200 dark:border-slate-800";

  const hasChildren = node.children.length > 0;
  const collapsed = hasChildren && collapsedIds.has(node.post.id);
  const childCount = node.children.length;
  const childrenContainerId = `post-children-${node.post.id}`;
  const replyLabel = childCount === 1 ? "reply" : "replies";

  return (
    <div className={indentClass}>
      <article
        id={`post-${node.post.id}`}
        className="scroll-mt-24 rounded-xl bg-white/85 dark:bg-slate-900/70 ring-1 ring-slate-200 dark:ring-slate-800 p-4 space-y-2"
      >
        <header className="flex items-baseline justify-between gap-2">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            <span className="font-medium text-slate-700 dark:text-slate-200">
              {node.post.author_name}
            </span>
            <span aria-hidden> · </span>
            <time dateTime={node.post.created_at}>
              {formatRelative(node.post.created_at)}
            </time>
            {/* `updated_at` is auto-managed by trigger trg_discussion_posts_updated (0025).
                When it's later than created_at we treat the post as edited. The 2s slack
                guards against the row's initial INSERT-driven set_updated_at being a hair
                after created_at in the DB clock. */}
            {(() => {
              const created = new Date(node.post.created_at).getTime();
              const updated = new Date(node.post.updated_at).getTime();
              const edited =
                Number.isFinite(created) &&
                Number.isFinite(updated) &&
                updated - created > 2000;
              if (!edited) return null;
              const full = new Date(node.post.updated_at).toLocaleString();
              return (
                <>
                  <span aria-hidden> · </span>
                  <span
                    className="italic text-slate-400 dark:text-slate-500"
                    title={`Edited at ${full}`}
                  >
                    edited{" "}
                    <time dateTime={node.post.updated_at}>
                      {formatRelative(node.post.updated_at)}
                    </time>
                  </span>
                </>
              );
            })()}
          </p>
          {canManage(node.post) && !editing && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => {
                  // Mutex with reply form: close reply if open before editing.
                  setReplying(false);
                  setEditing(true);
                }}
                className="rounded-md px-2 py-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 min-h-[28px]"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => onDeletePost(node.post)}
                className="rounded-md px-2 py-1 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 min-h-[28px]"
              >
                Delete
              </button>
            </div>
          )}
        </header>
        {editing ? (
          <EditForm
            initialBody={node.post.body}
            onCancel={() => setEditing(false)}
            onSave={async (next) => {
              const ok = await onEditPost(node.post, next);
              if (ok) setEditing(false);
              return ok;
            }}
          />
        ) : (
          /* Body is HTML produced by MarkdownEditor (legacy plain text still renders correctly as a text node). */
          <SafeHtml
            html={node.post.body}
            className="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-300"
          />
        )}
        {!editing && (!topicLocked || hasChildren) && (
          <div className="pt-1 flex items-center gap-3 flex-wrap">
            {!topicLocked && (
              <>
                {replying ? (
                  <ReplyForm
                    placeholder={`Reply to ${node.post.author_name}…`}
                    onCancel={() => setReplying(false)}
                    onSubmitReply={async (body) => {
                      const ok = await onSubmitReply(body, node.post.id);
                      if (ok) setReplying(false);
                      return ok;
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setReplying(true)}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    Reply
                  </button>
                )}
              </>
            )}
            {hasChildren && !replying && (
              <button
                type="button"
                onClick={() => onToggleCollapsed(node.post.id)}
                aria-expanded={!collapsed}
                aria-controls={childrenContainerId}
                aria-label={`${collapsed ? "Expand" : "Collapse"} ${childCount} ${replyLabel}`}
                className="inline-flex items-center gap-1 min-h-[40px] -my-2 px-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-md"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 12 12"
                  width="10"
                  height="10"
                  className={`motion-safe:transition-transform ${collapsed ? "" : "rotate-90"}`}
                >
                  <path
                    d="M3.5 2 L8 6 L3.5 10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>
                  {collapsed
                    ? `Show ${childCount} ${replyLabel}`
                    : `Collapse ${childCount} ${replyLabel}`}
                </span>
              </button>
            )}
          </div>
        )}
      </article>

      {hasChildren && (
        <div id={childrenContainerId} className="mt-2 space-y-2">
          {collapsed ? (
            <button
              type="button"
              onClick={() => onToggleCollapsed(node.post.id)}
              aria-expanded={false}
              aria-controls={childrenContainerId}
              aria-label={`Show ${childCount} hidden ${replyLabel}`}
              className={`${indent === 0 ? "" : "ml-1"} block w-full text-left text-xs text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 min-h-[40px] px-3 py-2 rounded-lg ring-1 ring-dashed ring-slate-200 dark:ring-slate-800 hover:ring-indigo-300 dark:hover:ring-indigo-700 bg-slate-50/60 dark:bg-slate-900/40`}
            >
              {childCount} {replyLabel} hidden — click to show
            </button>
          ) : (
            node.children.map((child) => (
              <PostNode
                key={child.post.id}
                node={child}
                topicLocked={topicLocked}
                depth={depth + 1}
                canManage={canManage}
                onSubmitReply={onSubmitReply}
                onEditPost={onEditPost}
                onDeletePost={onDeletePost}
                collapsedIds={collapsedIds}
                onToggleCollapsed={onToggleCollapsed}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
