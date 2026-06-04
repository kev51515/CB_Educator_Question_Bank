/**
 * CourseDiscussions
 * =================
 * Discussions tab inside ClassLayout. Lists the course's discussion topics
 * (pinned-first, then newest) and lets staff + enrolled students start a new
 * topic. Each row links into DiscussionTopicView for the threaded view.
 *
 * Staff/topic-authors also get inline polish:
 *   • One-click Pin / Lock badges (optimistic + toast)
 *   • Kebab "⋯" with Edit / Pin / Lock / Delete
 * (mirrors the ModulesPage + CourseAnnouncements affordance pattern.)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useClassContext } from "./classLayoutContext";
import { useProfile } from "@/lib/profile";
import { ConfirmDialog } from "./ConfirmDialog";
import { TopicFormModal } from "./TopicFormModal";
import { useDiscussions, type DiscussionTopic } from "./useDiscussions";
import { courseDiscussionPath } from "@/lib/routes";
import { SafeHtml } from "@/components/SafeHtml";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { KebabMenu, useOptimistic, type KebabMenuOption } from "@/components";

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

// --- Unread-since-last-visit (localStorage, per-user) ---------------------
//
// We persist a `{ topicId → ISO timestamp }` map keyed by user id, written on
// DiscussionTopicView mount and read here on each render. The map is LRU-
// capped at 200 entries (most-recent wins) to bound storage growth even if
// a user opens hundreds of topics across many courses.
//
// Trade-off: we have no cheap way to filter "posts by other authors" without
// a DB change, so an OP who replies to their own topic will briefly see their
// own reply marked "new" until they revisit the topic page. Accepted.
// Writes to this map (with LRU cap = 200) happen in DiscussionTopicView; the
// list surface is read-only.
const VISITED_KEY_PREFIX = "discussion.visited:";

function loadVisitedMap(userId: string): Record<string, string> {
  if (!userId) return {};
  try {
    const raw = localStorage.getItem(`${VISITED_KEY_PREFIX}${userId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
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

function replyLabel(count: number | undefined): string {
  if (count === undefined) return "";
  if (count === 0) return "No replies yet";
  if (count === 1) return "1 reply";
  return `${count} replies`;
}

interface InlineRenameTitleProps {
  value: string;
  disabled: boolean;
  onSave: (next: string) => Promise<void>;
}

/**
 * Click-to-edit topic title. Enter / blur save, Esc cancels. Empty values
 * collapse back to the original to avoid accidental clears. Mirrors the
 * DiscussionTopicView InlineRenameTitle pattern but scaled to the list-row
 * heading. Throws from onSave keep the editor open with the user's typed
 * value so they can retry instead of losing it.
 */
function InlineRenameTitle({
  value,
  disabled,
  onSave,
}: InlineRenameTitleProps): JSX.Element {
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
      setEditing(false);
    } catch {
      // Keep editing=true; parent handler toasted. User keeps their draft.
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
        onClick={(e) => {
          // Prevent the wrapping <Link> from navigating while editing.
          e.preventDefault();
          e.stopPropagation();
        }}
        onBlur={() => {
          void commit();
        }}
        className="bg-white dark:bg-slate-800 ring-1 ring-indigo-400 rounded-md px-2 py-0.5 text-base font-semibold text-slate-900 dark:text-slate-100 w-full max-w-md"
        aria-label="Topic title"
      />
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        if (disabled) return;
        e.preventDefault();
        e.stopPropagation();
        setEditing(true);
      }}
      className={`group inline-flex items-center gap-1 min-w-0 text-left ${
        disabled ? "cursor-default" : "cursor-text"
      }`}
      title={disabled ? undefined : "Click to rename"}
    >
      <span className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
        {value}
      </span>
      {!disabled && (
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
      )}
    </button>
  );
}

/**
 * Unread state per row:
 *  - "visited-new": user has visited this topic before, but new activity has
 *    landed since then. Indigo pip (•) + "New replies" text.
 *  - "never": user has never visited this topic on this device. Slate "Unread"
 *    pill — distinguishes "first-time visit" from "delta since last visit".
 *  - "none": the user is current.
 *
 * On a brand-new device with empty localStorage every topic resolves to
 * "never" until visited — graceful degradation, no false silence.
 */
type UnreadState = "visited-new" | "never" | "none";

interface TopicRowProps {
  topic: DiscussionTopic;
  courseId: string;
  replyCount: number | undefined;
  unreadState: UnreadState;
  canManage: boolean;
  onRename: (topic: DiscussionTopic, nextTitle: string) => Promise<void>;
  onEdit: (topic: DiscussionTopic) => void;
  onDelete: (topic: DiscussionTopic) => void;
}

function TopicRow({
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

export function CourseDiscussions() {
  const { cls } = useClassContext();
  const { profile } = useProfile();
  const { topics, loading, error, refresh } = useDiscussions(cls.id);
  const [showCreate, setShowCreate] = useState(false);
  const [editingTopic, setEditingTopic] = useState<DiscussionTopic | null>(null);
  const [confirmDeleteTopic, setConfirmDeleteTopic] =
    useState<DiscussionTopic | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [replyCounts, setReplyCounts] = useState<Record<string, number>>({});
  // ISO timestamp of the latest post per topic. Falls back to the topic's
  // own created_at when there are no replies, so the "new" comparison still
  // works on brand-new topics with no replies yet.
  const [latestPostAt, setLatestPostAt] = useState<Record<string, string>>({});
  // Force a re-read of the localStorage visited map when the route changes
  // (i.e., user navigates back to the topic list after visiting a topic).
  // The Discussions surface mounts once per course, so a Date.now() ticked on
  // page-visibility regain is the cleanest way to react to localStorage
  // writes from DiscussionTopicView.
  const [visitedTick, setVisitedTick] = useState(0);
  useEffect(() => {
    const onFocus = (): void => setVisitedTick((n) => n + 1);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);
  const visitedMap = useMemo(
    () => loadVisitedMap(profile?.id ?? ""),
    // visitedTick intentionally invalidates the memo on tab focus return.
    // profile?.id covers initial render after auth resolves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile?.id, visitedTick, topics],
  );
  const toast = useToast();

  const canCreate = profile !== null;
  const authorId = profile?.id ?? "";
  const isStaff = profile?.role === "teacher" || profile?.role === "admin";

  // Reply counts: use PostgREST embedded-count aggregation so the server
  // returns the counts directly (`discussion_posts(count)` → [{ count: N }])
  // instead of streaming every row back for the client to tally. Previously
  // 50 topics × 50 replies = 2500 rows per refresh; now it's a single
  // aggregated round-trip. If the embedded shape ever changes we fall back
  // to a single bulk fetch of topic_id columns (still one round-trip for
  // all topics — never per-topic).
  useEffect(() => {
    if (topics.length === 0) {
      setReplyCounts({});
      setLatestPostAt({});
      return;
    }
    let cancelled = false;
    const ids = topics.map((t) => t.id);
    void (async () => {
      const { data, error: countError } = await supabase
        .from("discussion_topics")
        .select("id, discussion_posts(count)")
        .in("id", ids);

      if (cancelled) return;

      if (!countError && Array.isArray(data)) {
        const counts: Record<string, number> = {};
        for (const id of ids) counts[id] = 0;
        type EmbeddedCountRow = {
          id: string;
          discussion_posts: { count: number }[] | { count: number } | null;
        };
        for (const row of data as EmbeddedCountRow[]) {
          const embed = row.discussion_posts;
          const n = Array.isArray(embed)
            ? (embed[0]?.count ?? 0)
            : (embed?.count ?? 0);
          counts[row.id] = n;
        }
        setReplyCounts(counts);
        // Fall through — we still need latest_post_at for the unread
        // indicator, which the embedded-count shape doesn't give us.
      } else {
        // Fallback path: one bulk fetch of topic_id, client-side counter.
        // Still O(1) round-trips — far better than O(N) per-topic queries.
        const { data: fallbackData, error: fallbackError } = await supabase
          .from("discussion_posts")
          .select("topic_id")
          .in("topic_id", ids);
        if (cancelled) return;
        if (fallbackError || !fallbackData) {
          setReplyCounts({});
          setLatestPostAt({});
          return;
        }
        const counts: Record<string, number> = {};
        for (const id of ids) counts[id] = 0;
        for (const row of fallbackData as { topic_id: string }[]) {
          counts[row.topic_id] = (counts[row.topic_id] ?? 0) + 1;
        }
        setReplyCounts(counts);
      }

      // Latest-post timestamps: one bulk fetch of (topic_id, created_at),
      // reduced to per-topic max client-side. One round-trip across all
      // visible topics regardless of how many replies each has.
      const { data: postRows, error: postsError } = await supabase
        .from("discussion_posts")
        .select("topic_id, created_at")
        .in("topic_id", ids);
      if (cancelled) return;
      if (postsError || !postRows) {
        setLatestPostAt({});
        return;
      }
      const latest: Record<string, string> = {};
      for (const row of postRows as { topic_id: string; created_at: string }[]) {
        const prev = latest[row.topic_id];
        if (!prev || row.created_at > prev) latest[row.topic_id] = row.created_at;
      }
      setLatestPostAt(latest);
    })();
    return () => {
      cancelled = true;
    };
  }, [topics]);

  const canManageTopic = (topic: DiscussionTopic): boolean =>
    isStaff || (profile !== null && topic.author_id === profile.id);

  /**
   * Inline rename handler for the topic title. Throws on error so the
   * InlineRenameTitle editor stays open with the user's typed value
   * (same pattern as Wave 18 C-1 fix in ClassRoster / CourseAnnouncements).
   */
  const onRenameTopic = async (
    topic: DiscussionTopic,
    nextTitle: string,
  ): Promise<void> => {
    const trimmed = nextTitle.trim();
    if (!trimmed || trimmed === topic.title) return;
    const { error: updError } = await supabase
      .from("discussion_topics")
      .update({ title: trimmed })
      .eq("id", topic.id);
    if (updError) {
      toast.error("Couldn't rename topic", updError.message);
      throw new Error(updError.message);
    }
    toast.success("Topic renamed");
    void refresh();
  };

  const onConfirmDeleteTopic = async (): Promise<void> => {
    if (!confirmDeleteTopic) return;
    setDeleteBusy(true);
    try {
      const { error: delError } = await supabase
        .from("discussion_topics")
        .delete()
        .eq("id", confirmDeleteTopic.id);
      if (delError) {
        toast.error("Couldn't delete topic", delError.message);
        return;
      }
      toast.success("Topic deleted");
      setConfirmDeleteTopic(null);
      void refresh();
    } catch (err: unknown) {
      toast.error(
        "Couldn't delete topic",
        getErrorMessage(err, "Please try again."),
      );
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <>
      <div className="space-y-5">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Discussions
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Threaded conversations between students and teachers.
            </p>
          </div>
          {canCreate && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 shadow focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              + New topic
            </button>
          )}
        </header>

        {loading ? (
          <SkeletonRows count={3} rowClassName="h-20" />
        ) : error ? (
          <div
            role="alert"
            className="rounded-xl bg-rose-50 dark:bg-rose-950/40 ring-1 ring-rose-200 dark:ring-rose-900 px-4 py-3 text-sm text-rose-700 dark:text-rose-300"
          >
            {error}
          </div>
        ) : topics.length === 0 ? (
          <EmptyState
            title="No discussions yet"
            body={
              canCreate
                ? "Start a topic to spark conversation with your students."
                : "No topics have been posted yet."
            }
            cta={
              canCreate
                ? { label: "Start a topic", onClick: () => setShowCreate(true) }
                : undefined
            }
          />
        ) : (
          <div className="space-y-3">
            {topics.map((t) => {
              // Compute unread state. The "activity" timestamp is the latest
              // reply's created_at if present, else the topic's own
              // created_at. This way a brand-new topic with zero replies
              // still shows "Unread" to first-time viewers.
              const activityAt = latestPostAt[t.id] ?? t.created_at;
              let unreadState: UnreadState = "none";
              if (profile) {
                const visitedAt = visitedMap[t.id];
                if (!visitedAt) {
                  unreadState = "never";
                } else if (activityAt > visitedAt) {
                  unreadState = "visited-new";
                }
              }
              return (
                <TopicRow
                  key={t.id}
                  topic={t}
                  courseId={cls.id}
                  replyCount={replyCounts[t.id]}
                  unreadState={unreadState}
                  canManage={canManageTopic(t)}
                  onRename={onRenameTopic}
                  onEdit={(topic) => setEditingTopic(topic)}
                  onDelete={(topic) => setConfirmDeleteTopic(topic)}
                />
              );
            })}
          </div>
        )}
      </div>

      <TopicFormModal
        open={showCreate}
        mode="create"
        courseId={cls.id}
        authorId={authorId}
        onClose={() => setShowCreate(false)}
        onCreated={() => {
          toast.success("Topic created");
          void refresh();
        }}
      />

      {editingTopic && (
        <TopicFormModal
          open={true}
          mode="edit"
          courseId={cls.id}
          authorId={authorId}
          initialTopic={editingTopic}
          onClose={() => setEditingTopic(null)}
          onUpdated={() => {
            toast.success("Topic updated");
            void refresh();
          }}
        />
      )}

      {confirmDeleteTopic && (
        <ConfirmDialog
          title="Delete this topic?"
          body={
            <div className="space-y-2">
              <p>
                <span className="font-semibold">
                  {confirmDeleteTopic.title}
                </span>{" "}
                and all of its replies will be permanently removed.
              </p>
              <p className="text-rose-700 dark:text-rose-300">
                This cannot be undone.
              </p>
            </div>
          }
          confirmLabel="Delete topic"
          destructive
          busy={deleteBusy}
          onConfirm={() => {
            void onConfirmDeleteTopic();
          }}
          onCancel={() => setConfirmDeleteTopic(null)}
        />
      )}
    </>
  );
}
