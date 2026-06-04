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
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useClassContext } from "./classLayoutContext";
import { useProfile } from "@/lib/profile";
import { ConfirmDialog } from "./ConfirmDialog";
import { TopicFormModal } from "./TopicFormModal";
import { useTopicPosts, type DiscussionPost } from "./useTopicPosts";
import { courseDiscussionsPath } from "@/lib/routes";
import { SafeHtml } from "@/components/SafeHtml";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import {
  buildTree,
  formatRelative,
  getErrorMessage,
  InlineRenameTitle,
  PostNode,
  ReplyForm,
} from "@/teacher/discussion-topic";






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
