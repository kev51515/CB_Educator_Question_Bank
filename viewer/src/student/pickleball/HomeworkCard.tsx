/**
 * HomeworkCard — Pickleball PLAYER-track student card (Increment 2, Lane B).
 *
 * The signed-in player sees the drills their coach assigned them as homework:
 * drill name, demo video (embeds via @/lib/videoEmbed), description, params,
 * and due date. Each item can be marked done / skipped (optimistic via
 * pk_set_homework_status). Outstanding items sort to the top.
 *
 * RLS scopes homework reads to player_id = auth.uid(); the explicit player_id
 * filter keeps the query tight. The `studentId` prop equals profiles.id
 * (== auth.uid()).
 *
 * Prop contract (do not change):
 *   export function HomeworkCard({ courseId, studentId }: {
 *     courseId: string; studentId: string })
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Skeleton, SkeletonRows, useToast } from "@/components";
import { skillLabel } from "@/lib/pickleballSkills";
import { parseVideoUrl } from "@/lib/videoEmbed";

type HomeworkStatus = "assigned" | "done" | "skipped";

const STATUS_LABEL: Record<HomeworkStatus, string> = {
  assigned: "To do",
  done: "Done",
  skipped: "Skipped",
};

const STATUS_STYLE: Record<HomeworkStatus, string> = {
  assigned:
    "bg-sky-100 text-sky-700 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900",
  done:
    "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900",
  skipped:
    "bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900",
};

interface DrillInfo {
  id: string;
  name: string;
  description: string | null;
  demo_video_url: string | null;
  skill_tags: string[];
  solo_or_partner: string | null;
}

interface HomeworkRow {
  id: string;
  drill_id: string;
  params: Record<string, unknown> | null;
  due_on: string | null;
  status: HomeworkStatus;
  created_at: string;
}

interface HomeworkItem extends HomeworkRow {
  drill: DrillInfo | null;
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Something went wrong.";
}

function friendlyError(err: unknown): string {
  const raw = getErrorMessage(err);
  switch (raw) {
    case "not_authorized":
      return "You can't update this homework.";
    case "not_authenticated":
      return "Your session expired — please sign in again.";
    case "not_found":
      return "That homework no longer exists.";
    default:
      return raw;
  }
}

function formatDue(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function paramEntries(params: Record<string, unknown> | null): [string, string][] {
  if (!params || typeof params !== "object") return [];
  return Object.entries(params).map(([k, v]) => [k, String(v)]);
}

export function HomeworkCard({
  courseId,
  studentId,
}: {
  courseId: string;
  studentId: string;
}) {
  const toast = useToast();
  const aliveRef = useRef(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<HomeworkItem[]>([]);

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
      const { data: hwData, error: hwErr } = await supabase
        .from("pickleball_homework")
        .select("id, drill_id, params, due_on, status, created_at")
        .eq("course_id", courseId)
        .eq("player_id", studentId)
        .order("created_at", { ascending: false });

      if (!aliveRef.current) return;
      if (hwErr) throw new Error(hwErr.message);

      const hwRows = (hwData ?? []) as unknown as HomeworkRow[];
      const drillIds = Array.from(new Set(hwRows.map((h) => h.drill_id)));

      const drillMap: Record<string, DrillInfo> = {};
      if (drillIds.length > 0) {
        const { data: dData, error: dErr } = await supabase
          .from("pickleball_drills")
          .select("id, name, description, demo_video_url, skill_tags, solo_or_partner")
          .in("id", drillIds);
        if (!aliveRef.current) return;
        if (dErr) throw new Error(dErr.message);
        for (const d of (dData ?? []) as unknown as DrillInfo[]) {
          drillMap[d.id] = d;
        }
      }

      setItems(hwRows.map((h) => ({ ...h, drill: drillMap[h.drill_id] ?? null })));
    } catch (err) {
      if (aliveRef.current) {
        setError(err instanceof Error ? err.message : "Couldn't load homework.");
      }
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [courseId, studentId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Outstanding first, then by due date (soonest first), then newest.
  const ordered = useMemo(() => {
    return [...items].sort((a, b) => {
      const aOpen = a.status === "assigned" ? 0 : 1;
      const bOpen = b.status === "assigned" ? 0 : 1;
      if (aOpen !== bOpen) return aOpen - bOpen;
      if (a.due_on && b.due_on && a.due_on !== b.due_on) {
        return a.due_on < b.due_on ? -1 : 1;
      }
      if (a.due_on && !b.due_on) return -1;
      if (!a.due_on && b.due_on) return 1;
      return a.created_at < b.created_at ? 1 : -1;
    });
  }, [items]);

  const outstanding = useMemo(
    () => items.filter((i) => i.status === "assigned").length,
    [items],
  );

  const onSetStatus = useCallback(
    async (item: HomeworkItem, status: HomeworkStatus) => {
      const prevStatus = item.status;
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status } : i)),
      );
      try {
        const { error: rpcErr } = await supabase.rpc("pk_set_homework_status", {
          p_id: item.id,
          p_status: status,
        });
        if (rpcErr) throw new Error(rpcErr.message);
      } catch (err) {
        if (!aliveRef.current) return;
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: prevStatus } : i)),
        );
        toast.error("Couldn't update homework", friendlyError(err));
      }
    },
    [toast],
  );

  if (loading) {
    return (
      <div
        className="space-y-3 rounded-2xl bg-white/80 p-6 ring-1 ring-slate-200 dark:bg-slate-900/60 dark:ring-slate-800"
        data-course-id={courseId}
        data-student-id={studentId}
      >
        <Skeleton className="h-5 w-36 rounded" />
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
          Couldn't load your homework
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

  if (items.length === 0) {
    return (
      <div
        className="rounded-2xl bg-white/80 p-8 text-center ring-1 ring-slate-200 dark:bg-slate-900/60 dark:ring-slate-800"
        data-course-id={courseId}
        data-student-id={studentId}
      >
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
          No homework yet
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Your coach hasn't assigned any drills yet. Check your lessons for what
          to practise next.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-course-id={courseId} data-student-id={studentId}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          My homework
        </h2>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {outstanding} to do
        </span>
      </div>

      <ul className="space-y-4">
        {ordered.map((item) => (
          <HomeworkItemCard
            key={item.id}
            item={item}
            onMarkDone={() => void onSetStatus(item, "done")}
            onMarkSkipped={() => void onSetStatus(item, "skipped")}
            onReopen={() => void onSetStatus(item, "assigned")}
          />
        ))}
      </ul>
    </div>
  );
}

// ─── Homework item card ──────────────────────────────────────────────────────

interface HomeworkItemCardProps {
  item: HomeworkItem;
  onMarkDone: () => void;
  onMarkSkipped: () => void;
  onReopen: () => void;
}

function HomeworkItemCard({
  item,
  onMarkDone,
  onMarkSkipped,
  onReopen,
}: HomeworkItemCardProps) {
  const drill = item.drill;
  const due = formatDue(item.due_on);
  const params = paramEntries(item.params);
  const embed = drill?.demo_video_url ? parseVideoUrl(drill.demo_video_url) : null;
  const isOpen = item.status === "assigned";

  return (
    <li
      className={`rounded-2xl bg-white/90 p-4 ring-1 ring-slate-200 dark:bg-slate-900/70 dark:ring-slate-800 ${
        isOpen ? "" : "opacity-80"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-slate-900 dark:text-slate-100">
            {drill?.name ?? "Drill"}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400">
            {drill?.solo_or_partner && (
              <span className="capitalize">{drill.solo_or_partner}</span>
            )}
            {due && <span>{drill?.solo_or_partner ? "· " : ""}Due {due}</span>}
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${STATUS_STYLE[item.status]}`}
        >
          {STATUS_LABEL[item.status]}
        </span>
      </div>

      {drill && drill.skill_tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {drill.skill_tags.map((slug) => (
            <span
              key={slug}
              className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"
            >
              {skillLabel(slug)}
            </span>
          ))}
        </div>
      )}

      {/* Demo video */}
      {embed?.embedSrc ? (
        <div className="mt-3">
          <div
            className="relative w-full overflow-hidden rounded-xl bg-black"
            style={{ paddingBottom: "56.25%" }}
          >
            <iframe
              src={embed.embedSrc}
              title={`${drill?.name ?? "Drill"} demo`}
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 h-full w-full"
            />
          </div>
        </div>
      ) : (
        drill?.demo_video_url && (
          <a
            href={drill.demo_video_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex min-h-[40px] items-center gap-2 text-sm font-medium text-sky-600 hover:underline dark:text-sky-400"
          >
            Watch demo
          </a>
        )
      )}

      {/* Description */}
      {drill?.description && (
        <div
          className="prose prose-sm mt-3 max-w-none text-slate-600 dark:prose-invert dark:text-slate-300"
          // Trusted: authored by the educator via MarkdownEditor.
          dangerouslySetInnerHTML={{ __html: drill.description }}
        />
      )}

      {/* Params */}
      {params.length > 0 && (
        <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {params.map(([k, v]) => (
            <div key={k} className="flex items-center gap-1">
              <dt className="font-medium text-slate-500 capitalize dark:text-slate-400">
                {k.replace(/_/g, " ")}:
              </dt>
              <dd className="text-slate-700 dark:text-slate-200">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* Actions */}
      <div className="mt-4 flex flex-wrap gap-2">
        {isOpen ? (
          <>
            <button
              type="button"
              onClick={onMarkDone}
              className="min-h-[40px] rounded-xl bg-emerald-600 px-4 text-sm font-medium text-white transition hover:bg-emerald-500"
            >
              Mark done
            </button>
            <button
              type="button"
              onClick={onMarkSkipped}
              className="min-h-[40px] rounded-xl px-3.5 text-sm font-medium text-slate-600 ring-1 ring-slate-300 transition hover:bg-slate-50 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800"
            >
              Skip
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onReopen}
            className="min-h-[40px] rounded-xl px-3.5 text-sm font-medium text-slate-600 ring-1 ring-slate-300 transition hover:bg-slate-50 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800"
          >
            Reopen
          </button>
        )}
      </div>
    </li>
  );
}
