/**
 * DiscussionTopicView
 * ===================
 * Single-topic page: the original post + its full reply thread, rendered as a
 * nested tree using parent_post_id. Anyone enrolled (or staff) can reply at
 * the top level; clicking "Reply" on a post opens an inline reply form scoped
 * to that parent.
 *
 * v1 keeps the UI simple: no edit/delete from this view (those live on the
 * topic list / future post actions), no realtime — we refresh after every
 * post.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useClassContext } from "./classLayoutContext";
import { useProfile } from "@/lib/profile";
import { ConfirmDialog } from "./ConfirmDialog";
import { TopicFormModal } from "./TopicFormModal";
import { useTopicPosts, type DiscussionPost } from "./useTopicPosts";
import { courseDiscussionsPath } from "@/lib/routes";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { SafeHtml } from "@/components/SafeHtml";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";

const MAX_POST_LEN = 10000;

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

function formatRelative(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const diffMs = then.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const minutes = Math.round(diffMs / 60_000);
  const hours = Math.round(diffMs / 3_600_000);
  const days = Math.round(diffMs / 86_400_000);
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

interface InlineTitleProps {
  value: string;
  disabled: boolean;
  onSave: (next: string) => Promise<void>;
}

/**
 * Click-to-edit topic title. Enter / blur save, Esc cancels. Empty values
 * collapse back to the original to avoid accidental clears. Mirrors the
 * ModulesPage InlineRename pattern but scaled to the topic header (text-xl).
 */
function InlineRenameTitle({
  value,
  disabled,
  onSave,
}: InlineTitleProps): JSX.Element {
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
        className="bg-white dark:bg-slate-800 ring-1 ring-indigo-400 rounded-md px-2 py-0.5 text-xl font-semibold text-slate-900 dark:text-slate-100 w-full max-w-xl"
        aria-label="Topic title"
      />
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (!disabled) setEditing(true);
      }}
      className={`group inline-flex items-center gap-1 min-w-0 text-left ${
        disabled ? "cursor-default" : "cursor-text"
      }`}
      title={disabled ? undefined : "Click to rename"}
    >
      <span className="text-xl font-semibold text-slate-900 dark:text-slate-100 truncate">
        {value}
      </span>
      {!disabled && (
        <svg
          width={14}
          height={14}
          viewBox="0 0 16 16"
          aria-hidden
          className="opacity-60 group-hover:opacity-100 transition text-slate-400 flex-none"
        >
          <path
            fill="currentColor"
            d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-1.66 1.66l-3.56-3.56l1.66-1.66Zm-2.6 2.6L2.158 10.28a1.75 1.75 0 0 0-.479.864l-.7 2.91a.75.75 0 0 0 .907.907l2.91-.7a1.75 1.75 0 0 0 .864-.479l6.254-6.254l-3.56-3.56Z"
          />
        </svg>
      )}
    </button>
  );
}

interface PostTreeNode {
  post: DiscussionPost;
  children: PostTreeNode[];
}

function buildTree(posts: ReadonlyArray<DiscussionPost>): PostTreeNode[] {
  const byId = new Map<string, PostTreeNode>();
  for (const post of posts) {
    byId.set(post.id, { post, children: [] });
  }
  const roots: PostTreeNode[] = [];
  for (const post of posts) {
    const node = byId.get(post.id);
    if (!node) continue;
    if (post.parent_post_id && byId.has(post.parent_post_id)) {
      byId.get(post.parent_post_id)?.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

interface ReplyFormProps {
  /** Body submission handled by the parent so it can stage an optimistic append, fire the insert, and reconcile/rollback. Resolves true on success. */
  onSubmitReply: (body: string) => Promise<boolean>;
  onCancel?: () => void;
  placeholder?: string;
  autoFocusKey?: number;
}

function ReplyForm({
  onSubmitReply,
  onCancel,
  placeholder,
  autoFocusKey,
}: ReplyFormProps) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bump `autoFocusKey` from the parent to force a remount when the user
  // clicks "Be the first to reply" — TipTap doesn't expose an imperative
  // focus handle here, so remounting is the lightest-touch fix.
  const _focusBump = autoFocusKey;
  void _focusBump;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = body.trim();
    if (!trimmed) {
      setError("Please enter a reply.");
      return;
    }
    if (trimmed.length > MAX_POST_LEN) {
      setError(`Reply must be ${MAX_POST_LEN} characters or fewer.`);
      return;
    }
    // Snapshot the typed draft BEFORE attempting the insert. If the insert
    // fails for any reason (RLS, network, or a thrown exception) we restore
    // the editor to this snapshot so the user doesn't lose what they wrote.
    // Mirrors ThreadView.tsx:149 / SubmissionDetailDrawer.tsx:241 patterns.
    const snapshot = body;
    // Optimistic local clear so the editor visibly empties while pending.
    // (Set back from `snapshot` on failure below.)
    setBody("");
    setBusy(true);
    try {
      const ok = await onSubmitReply(trimmed);
      if (!ok) {
        // Restore the typed content so the user can retry / edit.
        setBody(snapshot);
      }
    } catch (err: unknown) {
      // Hard throw — restore the draft and surface inline + via parent toast.
      setBody(snapshot);
      setError(getErrorMessage(err, "Failed to post reply."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      {error && (
        <div
          role="alert"
          className="rounded-md bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-900"
        >
          {error}
        </div>
      )}
      {/* Editor stores HTML — DB body column accepts string transparently. */}
      <MarkdownEditor
        value={body}
        onChange={setBody}
        placeholder={placeholder ?? "Write a reply…"}
        minHeight={80}
        characterLimit={MAX_POST_LEN}
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-medium px-3 py-1.5"
        >
          {busy ? "Posting…" : "Post reply"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

interface EditFormProps {
  /** Initial body HTML to seed the editor with. */
  initialBody: string;
  /** Save handler — resolves true on success so the form can collapse. */
  onSave: (body: string) => Promise<boolean>;
  onCancel: () => void;
}

/**
 * Inline body editor for an existing post. Esc cancels, Cmd/Ctrl+Enter saves.
 * Mirrors ReplyForm's snapshot/restore-on-failure pattern so a failed save
 * never loses the typed value.
 */
function EditForm({ initialBody, onSave, onCancel }: EditFormProps) {
  const [body, setBody] = useState(initialBody);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Keyboard shortcuts: Esc cancels, Cmd/Ctrl+Enter saves. Bound on the
  // container so the editor (TipTap) still owns intra-text Enter.
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void submit();
      }
    };
    node.addEventListener("keydown", onKeyDown);
    return () => node.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCancel, body]);

  const submit = async (): Promise<void> => {
    setError(null);
    const trimmed = body.trim();
    if (!trimmed) {
      setError("Post body cannot be empty.");
      return;
    }
    if (trimmed.length > MAX_POST_LEN) {
      setError(`Post must be ${MAX_POST_LEN} characters or fewer.`);
      return;
    }
    setBusy(true);
    try {
      const ok = await onSave(trimmed);
      if (!ok) {
        // Keep the form open with the typed value so the user can retry.
        return;
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to save edit."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={containerRef} className="space-y-2">
      {error && (
        <div
          role="alert"
          className="rounded-md bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-900"
        >
          {error}
        </div>
      )}
      <MarkdownEditor
        value={body}
        onChange={setBody}
        placeholder="Edit your post…"
        minHeight={80}
        characterLimit={MAX_POST_LEN}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-medium px-3 py-1.5 min-h-[40px]"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 min-h-[40px]"
        >
          Cancel
        </button>
        <span className="text-[11px] text-slate-400 dark:text-slate-500 ml-auto hidden sm:inline">
          Esc to cancel · ⌘/Ctrl+Enter to save
        </span>
      </div>
    </div>
  );
}

interface PostNodeProps {
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

function PostNode({
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

export function DiscussionTopicView() {
  const { topicId } = useParams<{ topicId: string }>();
  const navigate = useNavigate();
  const { cls } = useClassContext();
  const { profile } = useProfile();
  const { topic, posts, loading, error, notFound, refresh } = useTopicPosts(
    topicId ?? null,
  );
  const toast = useToast();

  const [editingTopic, setEditingTopic] = useState(false);
  const [confirmDeleteTopic, setConfirmDeleteTopic] = useState(false);
  const [confirmDeletePost, setConfirmDeletePost] =
    useState<DiscussionPost | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  // Per-action errors surface via toast; no need for a persistent banner.

  // Optimistic posts appended locally before the round-trip completes. The
  // realtime subscription in useTopicPosts will re-emit the canonical row
  // shortly after; we filter dupes by id so the swap is seamless.
  const [optimisticPosts, setOptimisticPosts] = useState<DiscussionPost[]>([]);

  // Optimistic edits: map of post.id → { body, updated_at }. Applied as an
  // override on top of the realtime feed so the user sees their edit
  // immediately. Rolled back on failure; cleared once the realtime row
  // catches up (updated_at on server ≥ our local).
  const [optimisticEdits, setOptimisticEdits] = useState<
    Record<string, { body: string; updated_at: string }>
  >({});

  // Bumped to focus the top-level compose box when the user clicks the
  // "Be the first to reply" CTA in the empty state.
  const [composeFocusKey, setComposeFocusKey] = useState(0);
  const composeRef = useRef<HTMLDivElement | null>(null);

  // Tracks live-mount so async post-insert callbacks don't setState on a dead component.
  const mountedRef = useRef<boolean>(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // When the realtime subscription delivers a canonical row that matches one of
  // our optimistic placeholders (same author + body), drop the placeholder so
  // we don't briefly show duplicates.
  useEffect(() => {
    if (optimisticPosts.length === 0) return;
    const stillPending = optimisticPosts.filter(
      (opt) =>
        !posts.some(
          (real) =>
            real.author_id === opt.author_id && real.body === opt.body,
        ),
    );
    if (stillPending.length !== optimisticPosts.length) {
      setOptimisticPosts(stillPending);
    }
  }, [posts, optimisticPosts]);

  const combinedPosts = useMemo(() => {
    const editKeys = Object.keys(optimisticEdits);
    const withEdits =
      editKeys.length === 0
        ? posts
        : posts.map((p) => {
            const ov = optimisticEdits[p.id];
            if (!ov) return p;
            // If the realtime row has already caught up (its updated_at is >=
            // our local edit's updated_at), don't override — let the real one
            // through. The cleanup effect below will then drop the override.
            if (
              new Date(p.updated_at).getTime() >=
              new Date(ov.updated_at).getTime()
            ) {
              return p;
            }
            return { ...p, body: ov.body, updated_at: ov.updated_at };
          });
    if (optimisticPosts.length === 0) return withEdits;
    const seen = new Set(withEdits.map((p) => p.id));
    return [...withEdits, ...optimisticPosts.filter((p) => !seen.has(p.id))];
  }, [posts, optimisticPosts, optimisticEdits]);

  // Drop optimistic edits whose realtime row has caught up.
  useEffect(() => {
    const keys = Object.keys(optimisticEdits);
    if (keys.length === 0) return;
    let changed = false;
    const next = { ...optimisticEdits };
    for (const id of keys) {
      const real = posts.find((p) => p.id === id);
      const local = optimisticEdits[id];
      if (!real || !local) continue;
      if (
        new Date(real.updated_at).getTime() >=
          new Date(local.updated_at).getTime() &&
        real.body === local.body
      ) {
        delete next[id];
        changed = true;
      }
    }
    if (changed) setOptimisticEdits(next);
  }, [posts, optimisticEdits]);

  const tree = useMemo(() => buildTree(combinedPosts), [combinedPosts]);

  // Record this topic visit in localStorage so CourseDiscussions can suppress
  // the "new replies" indicator on subsequent renders. Stored per-user; LRU-
  // capped at 200 entries. Failure modes (quota exceeded, corrupt JSON) are
  // swallowed — the indicator just stays visible, which is a graceful default.
  useEffect(() => {
    if (!topic?.id || !profile?.id) return;
    try {
      const key = `discussion.visited:${profile.id}`;
      const raw = localStorage.getItem(key);
      let map: Record<string, string> = {};
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          map = parsed as Record<string, string>;
        }
      }
      map[topic.id] = new Date().toISOString();
      const entries = Object.entries(map);
      if (entries.length > 200) {
        entries.sort(([, a], [, b]) => b.localeCompare(a)); // newest first
        const trimmed = Object.fromEntries(entries.slice(0, 200));
        localStorage.setItem(key, JSON.stringify(trimmed));
      } else {
        localStorage.setItem(key, JSON.stringify(map));
      }
    } catch {
      // Best-effort persistence — quota or serialization errors are non-fatal.
    }
  }, [topic?.id, profile?.id]);

  // Transient collapsed state for reply subtrees. Per CLAUDE.md we don't
  // persist this — it resets per visit so users always see the full thread
  // by default.
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const onToggleCollapsed = (postId: string): void => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  };

  const location = useLocation();
  const lastScrolledHashRef = useRef<string | null>(null);
  useEffect(() => {
    if (combinedPosts.length === 0) return;
    const hash = location.hash;
    if (!hash || !hash.startsWith("#post-")) return;
    if (lastScrolledHashRef.current === hash) return;
    // The deeplink target may live inside a collapsed subtree. Simplest
    // correct fix: clear all collapse state so the target post is mounted
    // and `getElementById` can find it on this tick.
    if (collapsedIds.size > 0) {
      setCollapsedIds(new Set());
      // Effect will re-run on the next render with collapsedIds empty;
      // the target post will then be mounted in the DOM.
      return;
    }
    const el = document.getElementById(hash.slice(1));
    if (!el) return;
    lastScrolledHashRef.current = hash;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.add(
      "ring-2",
      "ring-indigo-400",
      "dark:ring-indigo-500",
      "motion-safe:transition-shadow",
    );
    const t = window.setTimeout(() => {
      el.classList.remove(
        "ring-2",
        "ring-indigo-400",
        "dark:ring-indigo-500",
        "motion-safe:transition-shadow",
      );
    }, 2400);
    return () => window.clearTimeout(t);
  }, [combinedPosts, location.hash, collapsedIds]);

  if (notFound) {
    return <Navigate to={courseDiscussionsPath(cls.short_code)} replace />;
  }

  const authorId = profile?.id ?? "";
  const isStaff = profile?.role === "teacher" || profile?.role === "admin";
  const isTopicAuthor = topic !== null && profile?.id === topic.author_id;
  const canManageTopic = isStaff || isTopicAuthor;

  const canManagePost = (post: DiscussionPost): boolean =>
    isStaff || (profile !== null && post.author_id === profile.id);

  // Insert a reply with optimistic append. Resolves true on success so the
  // child ReplyForm can clear its textarea / collapse itself.
  const handleSubmitReply = async (
    body: string,
    parentPostId: string | null,
  ): Promise<boolean> => {
    if (!topic || !profile) return false;
    const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimistic: DiscussionPost = {
      id: tempId,
      topic_id: topic.id,
      author_id: profile.id,
      author_name: profile.display_name ?? profile.email ?? "You",
      body,
      parent_post_id: parentPostId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setOptimisticPosts((prev) => [...prev, optimistic]);
    try {
      const { error: insErr } = await supabase
        .from("discussion_posts")
        .insert({
          topic_id: topic.id,
          author_id: profile.id,
          body,
          parent_post_id: parentPostId,
        });
      if (insErr) throw insErr;
      // Realtime in useTopicPosts will deliver the canonical row; clear
      // optimistic placeholder on the next refresh.
      // .finally so the ghost clears even if refresh() rejects (insert already landed); mountedRef guards against unmount-during-flight.
      void refresh().finally(() => {
        if (!mountedRef.current) return;
        setOptimisticPosts((prev) => prev.filter((p) => p.id !== tempId));
      });
      toast.success("Reply posted");
      return true;
    } catch (err: unknown) {
      setOptimisticPosts((prev) => prev.filter((p) => p.id !== tempId));
      toast.error(
        "Couldn't post reply",
        getErrorMessage(err, "Please try again."),
      );
      return false;
    }
  };

  // Edit an existing post's body. Optimistic local update, rollback on
  // failure. RLS allows the author (and staff) to UPDATE (see migration
  // 0025), and the BEFORE UPDATE trigger bumps updated_at automatically —
  // we don't need to set it ourselves on the server, but we stamp a local
  // value so the optimistic override has a comparable timestamp.
  const handleEditPost = async (
    post: DiscussionPost,
    nextBody: string,
  ): Promise<boolean> => {
    const prevBody = post.body;
    const prevUpdatedAt = post.updated_at;
    if (nextBody === prevBody) return true; // no-op
    const nowIso = new Date().toISOString();
    setOptimisticEdits((prev) => ({
      ...prev,
      [post.id]: { body: nextBody, updated_at: nowIso },
    }));
    try {
      const { error: updError } = await supabase
        .from("discussion_posts")
        .update({ body: nextBody })
        .eq("id", post.id);
      if (updError) {
        // Roll back the override.
        setOptimisticEdits((prev) => {
          const next = { ...prev };
          delete next[post.id];
          return next;
        });
        toast.error("Couldn't save edit", updError.message);
        return false;
      }
      // Realtime will deliver the canonical row; the cleanup effect drops
      // the override once the server timestamp catches up.
      void refresh();
      toast.success("Post updated");
      return true;
    } catch (err: unknown) {
      setOptimisticEdits((prev) => {
        const next = { ...prev };
        delete next[post.id];
        return next;
      });
      // Silence unused vars for the "rollback to previous body" path; the
      // override drop above suffices because the realtime row still carries
      // the pre-edit body until the (failed) write would have arrived.
      void prevBody;
      void prevUpdatedAt;
      toast.error(
        "Couldn't save edit",
        getErrorMessage(err, "Please try again."),
      );
      return false;
    }
  };

  const onDeleteTopic = async (): Promise<void> => {
    if (!topic) return;
    setActionBusy(true);
    try {
      const { error: delError } = await supabase
        .from("discussion_topics")
        .delete()
        .eq("id", topic.id);
      if (delError) {
        toast.error("Couldn't delete topic", delError.message);
        return;
      }
      toast.success("Topic deleted");
      navigate(courseDiscussionsPath(cls.short_code));
    } catch (err: unknown) {
      const msg = getErrorMessage(err, "Failed to delete topic.");
      toast.error("Couldn't delete topic", msg);
    } finally {
      setActionBusy(false);
    }
  };

  const onDeletePost = async (post: DiscussionPost): Promise<void> => {
    setActionBusy(true);
    try {
      const { error: delError } = await supabase
        .from("discussion_posts")
        .delete()
        .eq("id", post.id);
      if (delError) {
        toast.error("Couldn't delete reply", delError.message);
        return;
      }
      setConfirmDeletePost(null);
      toast.success("Reply deleted");
      void refresh();
    } catch (err: unknown) {
      const msg = getErrorMessage(err, "Failed to delete reply.");
      toast.error("Couldn't delete reply", msg);
    } finally {
      setActionBusy(false);
    }
  };

  // Inline rename: persist on Enter / blur. RLS already restricts to staff
  // and the topic author (matching canManageTopic), so a rejection here
  // surfaces as a toast without breaking the local UI.
  const onRenameTopic = async (nextTitle: string): Promise<void> => {
    if (!topic) return;
    const { error: updError } = await supabase
      .from("discussion_topics")
      .update({ title: nextTitle })
      .eq("id", topic.id);
    if (updError) {
      toast.error("Couldn't rename topic", updError.message);
      // Throw so InlineRenameTitle keeps the draft open for retry instead of
      // resolving as success and discarding the user's typed value.
      throw new Error(updError.message);
    }
    toast.success("Topic renamed");
    void refresh();
  };

  const focusComposeBox = (): void => {
    setComposeFocusKey((k) => k + 1);
    composeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <>
      <div className="space-y-5">
        <div>
          <Link
            to={courseDiscussionsPath(cls.short_code)}
            className="inline-flex items-center gap-1.5 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
          >
            <span aria-hidden>←</span> Back to discussions
          </Link>
        </div>

        {loading ? (
          <SkeletonRows count={4} />
        ) : error ? (
          <div
            role="alert"
            className="rounded-xl bg-rose-50 dark:bg-rose-950/40 ring-1 ring-rose-200 dark:ring-rose-900 px-4 py-3 text-sm text-rose-700 dark:text-rose-300"
          >
            {error}
          </div>
        ) : topic === null ? null : (
          <>
            <article className="rounded-2xl bg-white/85 dark:bg-slate-900/70 ring-1 ring-slate-200 dark:ring-slate-800 p-5 shadow-sm space-y-3">
              <header className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <InlineRenameTitle
                      value={topic.title}
                      disabled={!canManageTopic}
                      onSave={onRenameTopic}
                    />
                    {topic.pinned && (
                      <span className="rounded-full bg-amber-100 dark:bg-amber-950/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-900">
                        Pinned
                      </span>
                    )}
                    {topic.locked && (
                      <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-700">
                        Locked
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-medium text-slate-600 dark:text-slate-300">
                      {topic.author_name}
                    </span>
                    <span aria-hidden> · </span>
                    <time dateTime={topic.created_at}>
                      {formatRelative(topic.created_at)}
                    </time>
                  </p>
                </div>
                {canManageTopic && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditingTopic(true)}
                      className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteTopic(true)}
                      className="rounded-md px-2 py-1 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </header>

              {/* Body is HTML produced by MarkdownEditor (legacy plain text still renders correctly as a text node). */}
              <SafeHtml
                html={topic.body}
                className="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-300"
              />
            </article>

            <section aria-label="Replies" className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                {posts.length === 0
                  ? "No replies yet"
                  : posts.length === 1
                    ? "1 reply"
                    : `${posts.length} replies`}
              </h3>

              {tree.length > 0 ? (
                <div className="space-y-2">
                  {tree.map((node) => (
                    <PostNode
                      key={node.post.id}
                      node={node}
                      topicLocked={topic.locked}
                      depth={0}
                      canManage={canManagePost}
                      onSubmitReply={handleSubmitReply}
                      onEditPost={handleEditPost}
                      onDeletePost={(post) => setConfirmDeletePost(post)}
                      collapsedIds={collapsedIds}
                      onToggleCollapsed={onToggleCollapsed}
                    />
                  ))}
                </div>
              ) : !topic.locked ? (
                <EmptyState
                  title="No replies yet"
                  body="Kick off the conversation — the first reply often gets the most responses."
                  cta={{ label: "Write a reply", onClick: focusComposeBox }}
                />
              ) : null}

              {topic.locked ? (
                <div className="rounded-xl bg-slate-50 dark:bg-slate-900/50 ring-1 ring-slate-200 dark:ring-slate-800 px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                  This topic is locked. No new replies can be posted.
                </div>
              ) : profile === null ? null : (
                <div
                  ref={composeRef}
                  className="rounded-xl bg-white/85 dark:bg-slate-900/70 ring-1 ring-slate-200 dark:ring-slate-800 p-4"
                >
                  <ReplyForm
                    onSubmitReply={(body) => handleSubmitReply(body, null)}
                    placeholder="Add to the discussion…"
                    autoFocusKey={composeFocusKey}
                  />
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {topic && (
        <TopicFormModal
          open={editingTopic}
          mode="edit"
          courseId={cls.id}
          authorId={authorId}
          initialTopic={topic}
          onClose={() => setEditingTopic(false)}
          onUpdated={() => {
            void refresh();
          }}
        />
      )}

      {confirmDeleteTopic && topic && (
        <ConfirmDialog
          title="Delete this topic?"
          body={
            <div className="space-y-2">
              <p>
                <span className="font-semibold">{topic.title}</span> and all of
                its replies will be permanently removed.
              </p>
              <p className="text-rose-700 dark:text-rose-300">
                This cannot be undone.
              </p>
            </div>
          }
          confirmLabel="Delete topic"
          destructive
          busy={actionBusy}
          onConfirm={() => {
            void onDeleteTopic();
          }}
          onCancel={() => setConfirmDeleteTopic(false)}
        />
      )}

      {confirmDeletePost && (
        <ConfirmDialog
          title="Delete this reply?"
          body={
            <p>
              This reply (and any replies underneath it) will be permanently
              removed.
            </p>
          }
          confirmLabel="Delete reply"
          destructive
          busy={actionBusy}
          onConfirm={() => {
            void onDeletePost(confirmDeletePost);
          }}
          onCancel={() => setConfirmDeletePost(null)}
        />
      )}
    </>
  );
}
