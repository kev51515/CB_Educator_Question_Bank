/**
 * PlayerLessonsTimeline — Pickleball PLAYER-track student card.
 *
 * The signed-in player sees their own lessons newest-first. Each lesson shows
 * the coach's plan, the post-session recap, and any recap videos — link videos
 * embed via @/lib/videoEmbed; uploaded videos play from a freshly signed URL on
 * the `pickleball-videos` bucket.
 *
 * RLS scopes reads to player_id = auth.uid(), so this only ever surfaces the
 * caller's own lessons. The `studentId` prop equals profiles.id (== auth.uid()).
 *
 * Prop contract (do not change):
 *   export function PlayerLessonsTimeline({ courseId, studentId }: {
 *     courseId: string; studentId: string })
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Skeleton, SkeletonRows } from "@/components";
import { parseVideoUrl } from "@/lib/videoEmbed";

const STORAGE_BUCKET = "pickleball-videos";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

type LessonStatus = "scheduled" | "completed" | "recapped" | "cancelled";

const STATUS_STYLE: Record<LessonStatus, string> = {
  scheduled:
    "bg-sky-100 text-sky-700 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900",
  completed:
    "bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900",
  recapped:
    "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900",
  cancelled:
    "bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:ring-slate-700",
};

const STATUS_LABEL: Record<LessonStatus, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  recapped: "Recapped",
  cancelled: "Cancelled",
};

interface LessonVideoRow {
  id: string;
  lesson_id: string;
  kind: "link" | "upload";
  url: string | null;
  storage_path: string | null;
  title: string | null;
  sort_order: number | null;
}

interface LessonRow {
  id: string;
  scheduled_at: string | null;
  duration_min: number | null;
  location: string | null;
  status: LessonStatus;
  plan_md: string | null;
  recap_md: string | null;
}

interface LessonWithVideos extends LessonRow {
  videos: LessonVideoRow[];
}

function formatWhen(iso: string | null): string {
  if (!iso) return "Unscheduled";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unscheduled";
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function PlayerLessonsTimeline({
  courseId,
  studentId,
}: {
  courseId: string;
  studentId: string;
}) {
  const aliveRef = useRef(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lessons, setLessons] = useState<LessonWithVideos[]>([]);
  // Map storage_path -> signed playback URL for uploaded videos.
  const [signedByPath, setSignedByPath] = useState<Record<string, string>>({});

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // RLS already restricts to the caller's own lessons; the explicit
      // player_id filter keeps the query tight and self-documenting.
      const { data: lessonData, error: lessonErr } = await supabase
        .from("pickleball_lessons")
        .select(
          "id, scheduled_at, duration_min, location, status, plan_md, recap_md",
        )
        .eq("course_id", courseId)
        .eq("player_id", studentId)
        .order("scheduled_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (!aliveRef.current) return;
      if (lessonErr) throw new Error(lessonErr.message);

      const lessonRows = (lessonData ?? []) as unknown as LessonRow[];
      const lessonIds = lessonRows.map((l) => l.id);

      let videos: LessonVideoRow[] = [];
      if (lessonIds.length > 0) {
        const { data: vData, error: vErr } = await supabase
          .from("pickleball_lesson_videos")
          .select("id, lesson_id, kind, url, storage_path, title, sort_order")
          .in("lesson_id", lessonIds)
          .order("sort_order", { ascending: true });
        if (!aliveRef.current) return;
        if (vErr) throw new Error(vErr.message);
        videos = (vData ?? []) as unknown as LessonVideoRow[];
      }

      // Sign uploaded-video paths for inline playback.
      const uploadPaths = videos
        .filter((v) => v.kind === "upload" && v.storage_path)
        .map((v) => v.storage_path as string);
      const signedMap: Record<string, string> = {};
      if (uploadPaths.length > 0) {
        const { data: signed } = await supabase.storage
          .from(STORAGE_BUCKET)
          .createSignedUrls(uploadPaths, SIGNED_URL_TTL_SECONDS);
        if (!aliveRef.current) return;
        for (const entry of signed ?? []) {
          if (entry.path && entry.signedUrl) signedMap[entry.path] = entry.signedUrl;
        }
      }

      const grouped: Record<string, LessonVideoRow[]> = {};
      for (const v of videos) (grouped[v.lesson_id] ??= []).push(v);

      setLessons(
        lessonRows.map((l) => ({ ...l, videos: grouped[l.id] ?? [] })),
      );
      setSignedByPath(signedMap);
    } catch (err) {
      if (aliveRef.current) {
        setError(err instanceof Error ? err.message : "Couldn't load lessons.");
      }
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [courseId, studentId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div
        className="space-y-3 rounded-2xl bg-white/80 p-6 ring-1 ring-slate-200 dark:bg-slate-900/60 dark:ring-slate-800"
        data-course-id={courseId}
        data-student-id={studentId}
      >
        <Skeleton className="h-5 w-40 rounded" />
        <SkeletonRows count={3} />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-2xl bg-white/80 p-6 text-center ring-1 ring-slate-200 dark:bg-slate-900/60 dark:ring-slate-800"
        data-course-id={courseId}
        data-student-id={studentId}
      >
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
          Couldn't load your lessons
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 inline-flex min-h-[40px] items-center rounded-xl bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          Try again
        </button>
      </div>
    );
  }

  if (lessons.length === 0) {
    return (
      <div
        className="rounded-2xl bg-white/80 p-8 text-center ring-1 ring-slate-200 dark:bg-slate-900/60 dark:ring-slate-800"
        data-course-id={courseId}
        data-student-id={studentId}
      >
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">No lessons yet</p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Your coach hasn't scheduled any sessions yet — check back soon.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-course-id={courseId} data-student-id={studentId}>
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">My lessons</h2>
      <ol className="space-y-4">
        {lessons.map((lesson) => (
          <li
            key={lesson.id}
            className="rounded-2xl bg-white/90 p-4 ring-1 ring-slate-200 dark:bg-slate-900/70 dark:ring-slate-800"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium text-slate-900 dark:text-slate-100">
                  {formatWhen(lesson.scheduled_at)}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400">
                  {lesson.duration_min != null && <span>{lesson.duration_min} min</span>}
                  {lesson.location && <span>· {lesson.location}</span>}
                </div>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${STATUS_STYLE[lesson.status]}`}
              >
                {STATUS_LABEL[lesson.status]}
              </span>
            </div>

            {/* Plan */}
            {lesson.plan_md && (
              <section className="mt-3">
                <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Plan
                </h4>
                <div
                  className="prose prose-sm max-w-none dark:prose-invert"
                  dangerouslySetInnerHTML={{ __html: lesson.plan_md }}
                />
              </section>
            )}

            {/* Recap */}
            {lesson.recap_md && (
              <section className="mt-3">
                <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Recap
                </h4>
                <div
                  className="prose prose-sm max-w-none dark:prose-invert"
                  dangerouslySetInnerHTML={{ __html: lesson.recap_md }}
                />
              </section>
            )}

            {/* Videos */}
            {lesson.videos.length > 0 && (
              <section className="mt-3">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Recap videos
                </h4>
                <div className="space-y-3">
                  {lesson.videos.map((v) => (
                    <VideoPlayer
                      key={v.id}
                      video={v}
                      signedUrl={v.storage_path ? signedByPath[v.storage_path] : undefined}
                    />
                  ))}
                </div>
              </section>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

// ─── Video player ───────────────────────────────────────────────────────────

function VideoPlayer({
  video,
  signedUrl,
}: {
  video: LessonVideoRow;
  signedUrl: string | undefined;
}) {
  const title = video.title || (video.kind === "link" ? "Recap video" : "Uploaded video");

  if (video.kind === "link" && video.url) {
    const parsed = parseVideoUrl(video.url);
    if (parsed.embedSrc) {
      return (
        <figure>
          <div className="relative w-full overflow-hidden rounded-xl bg-black" style={{ paddingBottom: "56.25%" }}>
            <iframe
              src={parsed.embedSrc}
              title={title}
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 h-full w-full"
            />
          </div>
          {video.title && (
            <figcaption className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {video.title}
            </figcaption>
          )}
        </figure>
      );
    }
    // Unrecognised provider — fall back to a plain link.
    return (
      <a
        href={video.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-[40px] items-center gap-2 text-sm font-medium text-sky-600 hover:underline dark:text-sky-400"
      >
        {title}
      </a>
    );
  }

  if (video.kind === "upload") {
    if (!signedUrl) {
      return (
        <div className="rounded-xl bg-slate-100 px-3 py-4 text-center text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
          Preparing video…
        </div>
      );
    }
    return (
      <figure>
        <video
          src={signedUrl}
          controls
          preload="metadata"
          className="w-full rounded-xl bg-black"
        />
        {video.title && (
          <figcaption className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {video.title}
          </figcaption>
        )}
      </figure>
    );
  }

  return null;
}
