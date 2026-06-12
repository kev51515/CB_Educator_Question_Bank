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
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useClassContext } from "./classLayoutContext";
import { useProfile } from "@/lib/profile";
import { ConfirmDialog } from "./ConfirmDialog";
import { TopicFormModal } from "./TopicFormModal";
import { useDiscussions, type DiscussionTopic } from "./useDiscussions";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import {
  getErrorMessage,
  loadVisitedMap,
  TopicRow,
  type UnreadState,
} from "@/teacher/course-discussions";



type DiscussionFilter = "all" | "unanswered" | "locked" | "pinned";

const FILTER_PILLS: { value: DiscussionFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unanswered", label: "Unanswered" },
  { value: "locked", label: "Locked" },
  { value: "pinned", label: "Pinned" },
];

function isDiscussionFilter(value: string): value is DiscussionFilter {
  return (
    value === "all" ||
    value === "unanswered" ||
    value === "locked" ||
    value === "pinned"
  );
}

export function CourseDiscussions() {
  const { cls } = useClassContext();
  const { profile, loading: profileLoading } = useProfile();
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

  // Status filter pills (All / Unanswered / Locked / Pinned), persisted per
  // (user, course) so a teacher's chosen view survives reloads. "Unanswered"
  // reuses the already-fetched reply counts (0 replies = unanswered).
  const filterKey = `discussion.filter:${profile?.id ?? "anon"}:${cls.id}`;
  const [statusFilter, setStatusFilter] = useState<DiscussionFilter>(() => {
    try {
      const raw = localStorage.getItem(filterKey);
      return raw && isDiscussionFilter(raw) ? raw : "all";
    } catch {
      return "all";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(filterKey, statusFilter);
    } catch {
      // Ignore quota / private-mode write failures — filtering still works
      // in-session, it just won't persist.
    }
  }, [filterKey, statusFilter]);

  const visibleTopics = useMemo(() => {
    switch (statusFilter) {
      case "unanswered":
        return topics.filter((t) => (replyCounts[t.id] ?? 0) === 0);
      case "locked":
        return topics.filter((t) => t.locked);
      case "pinned":
        return topics.filter((t) => t.pinned);
      default:
        return topics;
    }
  }, [topics, statusFilter, replyCounts]);

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
      // Soft delete (0202): Trash with 90-day recovery (replies survive).
      const topicId = confirmDeleteTopic.id;
      const { error: delError } = await supabase.rpc("trash_content", {
        p_kind: "topic",
        p_id: topicId,
      });
      if (delError) {
        toast.error("Couldn't delete topic", delError.message);
        return;
      }
      toast.success("Moved to Trash", "Recoverable for 90 days.", {
        action: {
          label: "Undo",
          onAction: () => {
            void supabase
              .rpc("restore_content", { p_kind: "topic", p_id: topicId })
              .then(({ error }) => {
                if (error) toast.error("Couldn't restore", error.message);
                else {
                  toast.success("Topic restored");
                  void refresh();
                }
              });
          },
        },
      });
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

        {!loading && !error && topics.length > 0 && (
          <div
            role="group"
            aria-label="Filter discussions by status"
            className="flex flex-wrap gap-2"
          >
            {FILTER_PILLS.map((pill) => {
              const active = statusFilter === pill.value;
              return (
                <button
                  key={pill.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setStatusFilter(pill.value)}
                  className={
                    "rounded-full px-3 py-1.5 text-xs font-medium ring-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 " +
                    (active
                      ? "text-indigo-700 dark:text-indigo-300 ring-indigo-400 dark:ring-indigo-600 bg-indigo-50 dark:bg-indigo-950/40"
                      : "text-slate-700 dark:text-slate-200 ring-slate-200 dark:ring-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800")
                  }
                >
                  {pill.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Wait for the profile too — committing to the canCreate=false branch
            while the role is still loading flashes student-voice copy (and no
            Start-a-topic button) at the teacher. */}
        {loading || profileLoading ? (
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
        ) : visibleTopics.length === 0 ? (
          <EmptyState
            title="No matching discussions"
            body="No topics match this filter. Try a different status."
            cta={{ label: "Show all", onClick: () => setStatusFilter("all") }}
          />
        ) : (
          <div className="space-y-3">
            {visibleTopics.map((t) => {
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
