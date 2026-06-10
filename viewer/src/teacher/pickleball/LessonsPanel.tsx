/**
 * LessonsPanel — Pickleball PLAYER-track teacher panel.
 *
 * Educators schedule coaching lessons for an enrolled player, write a PLAN
 * before the session and a RECAP after, and attach recap videos two ways:
 *   - paste a YouTube / Vimeo / Drive link (parsed via @/lib/videoEmbed)
 *   - upload a video file into the `pickleball-videos` storage bucket
 *
 * A lesson moves scheduled -> completed -> recapped (one-click status toggle).
 * Optimistic UI + toast feedback throughout; Skeleton while loading; empty
 * state with a CTA.
 *
 * Prop contract (do not change):
 *   export function LessonsPanel({ courseId }: { courseId: string })
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  MarkdownEditor,
  SmartDatePicker,
  FileDropzone,
  SkeletonRows,
  useToast,
} from "@/components";
import { parseVideoUrl } from "@/lib/videoEmbed";

// ─── Constants ──────────────────────────────────────────────────────────────

const STORAGE_BUCKET = "pickleball-videos";
const VIDEO_ACCEPT = "video/*";
const VIDEO_MAX_SIZE = 500 * 1024 * 1024; // 500 MB

type LessonStatus = "scheduled" | "completed" | "recapped" | "cancelled";

const STATUS_ORDER: LessonStatus[] = ["scheduled", "completed", "recapped"];

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

// ─── Types ──────────────────────────────────────────────────────────────────

interface LessonVideoRow {
  id: string;
  lesson_id: string;
  kind: "link" | "upload";
  url: string | null;
  storage_path: string | null;
  title: string | null;
  sort_order: number | null;
  created_at: string;
}

interface LessonRow {
  id: string;
  course_id: string;
  player_id: string;
  coach_id: string | null;
  program_id: string | null;
  scheduled_at: string | null;
  duration_min: number | null;
  location: string | null;
  status: LessonStatus;
  plan_md: string | null;
  recap_md: string | null;
  created_at: string;
  updated_at: string;
}

interface PlayerOption {
  id: string;
  name: string;
}

interface ProgramOption {
  id: string;
  name: string;
}

interface PendingForm {
  playerId: string;
  programId: string;
  scheduledAt: string | null;
  durationMin: string;
  location: string;
  planMd: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Something went wrong.";
}

function friendlyError(err: unknown): string {
  const raw = getErrorMessage(err);
  switch (raw) {
    case "not_authorized":
      return "You don't have permission to manage lessons for this course.";
    case "not_authenticated":
      return "Your session expired — please sign in again.";
    case "not_found":
      return "That lesson no longer exists.";
    case "invalid_input":
      return "Please fill in the required fields.";
    default:
      return raw;
  }
}

function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/_+/g, "_");
  return cleaned.slice(0, 180) || "video";
}

function formatWhen(iso: string | null): string {
  if (!iso) return "Unscheduled";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unscheduled";
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function nextStatus(current: LessonStatus): LessonStatus {
  const idx = STATUS_ORDER.indexOf(current);
  if (idx === -1 || idx === STATUS_ORDER.length - 1) return STATUS_ORDER[0];
  return STATUS_ORDER[idx + 1];
}

function emptyForm(): PendingForm {
  return {
    playerId: "",
    programId: "",
    scheduledAt: null,
    durationMin: "",
    location: "",
    planMd: "",
  };
}

// ─── Component ──────────────────────────────────────────────────────────────

export function LessonsPanel({ courseId }: { courseId: string }) {
  const toast = useToast();
  const aliveRef = useRef(true);

  const [loading, setLoading] = useState(true);
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [videosByLesson, setVideosByLesson] = useState<Record<string, LessonVideoRow[]>>({});
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [programs, setPrograms] = useState<ProgramOption[]>([]);

  const [composerOpen, setComposerOpen] = useState(false);
  const [form, setForm] = useState<PendingForm>(emptyForm);
  const [scheduling, setScheduling] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // ─── Load ─────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [lessonsRes, rosterRes, programsRes] = await Promise.all([
        supabase
          .from("pickleball_lessons")
          .select(
            "id, course_id, player_id, coach_id, program_id, scheduled_at, duration_min, location, status, plan_md, recap_md, created_at, updated_at",
          )
          .eq("course_id", courseId)
          .order("scheduled_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false }),
        supabase
          .from("course_memberships")
          .select(
            "student_id, student:profiles!course_memberships_student_id_fkey(display_name, email)",
          )
          .eq("course_id", courseId),
        supabase
          .from("pickleball_programs")
          .select("id, name")
          .eq("course_id", courseId)
          .eq("archived", false)
          .order("sort_order", { ascending: true }),
      ]);

      if (!aliveRef.current) return;

      if (lessonsRes.error) throw new Error(lessonsRes.error.message);
      const lessonRows = (lessonsRes.data ?? []) as unknown as LessonRow[];
      setLessons(lessonRows);

      // Videos for the loaded lessons.
      const lessonIds = lessonRows.map((l) => l.id);
      if (lessonIds.length > 0) {
        const { data: vData, error: vErr } = await supabase
          .from("pickleball_lesson_videos")
          .select("id, lesson_id, kind, url, storage_path, title, sort_order, created_at")
          .in("lesson_id", lessonIds)
          .order("sort_order", { ascending: true });
        if (!aliveRef.current) return;
        if (vErr) throw new Error(vErr.message);
        const grouped: Record<string, LessonVideoRow[]> = {};
        for (const v of (vData ?? []) as unknown as LessonVideoRow[]) {
          (grouped[v.lesson_id] ??= []).push(v);
        }
        setVideosByLesson(grouped);
      } else {
        setVideosByLesson({});
      }

      if (rosterRes.error) throw new Error(rosterRes.error.message);
      const rosterRows = (rosterRes.data ?? []) as unknown as {
        student_id: string;
        student: { display_name: string | null; email: string | null } | null;
      }[];
      setPlayers(
        rosterRows.map((r) => ({
          id: r.student_id,
          name: r.student?.display_name || r.student?.email || "Unnamed player",
        })),
      );

      if (programsRes.error) throw new Error(programsRes.error.message);
      setPrograms((programsRes.data ?? []) as unknown as ProgramOption[]);
    } catch (err) {
      if (aliveRef.current) toast.error("Couldn't load lessons", friendlyError(err));
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [courseId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const playerName = useCallback(
    (id: string) => players.find((p) => p.id === id)?.name ?? "Player",
    [players],
  );
  const programName = useCallback(
    (id: string | null) => (id ? programs.find((p) => p.id === id)?.name ?? null : null),
    [programs],
  );

  const hasLessons = useMemo(() => lessons.length > 0, [lessons]);

  // ─── Schedule a lesson ──────────────────────────────────────────────────────

  const onSchedule = useCallback(async () => {
    if (!form.playerId) {
      toast.error("Pick a player", "Choose which player this lesson is for.");
      return;
    }
    setScheduling(true);
    try {
      const durationParsed = form.durationMin.trim() ? Number(form.durationMin) : null;
      const { data, error } = await supabase.rpc("pk_schedule_lesson", {
        p_course_id: courseId,
        p_player_id: form.playerId,
        p_coach_id: null,
        p_program_id: form.programId || null,
        p_scheduled_at: form.scheduledAt,
        p_duration_min:
          durationParsed !== null && !Number.isNaN(durationParsed) ? durationParsed : null,
        p_location: form.location.trim() || null,
        p_plan_md: form.planMd.trim() || null,
      });
      if (error) throw new Error(error.message);
      if (!aliveRef.current) return;
      const created = data as unknown as LessonRow;
      setLessons((prev) => [created, ...prev]);
      setForm(emptyForm());
      setComposerOpen(false);
      setExpandedId(created.id);
      toast.success("Lesson scheduled", playerName(created.player_id));
    } catch (err) {
      if (aliveRef.current) toast.error("Couldn't schedule lesson", friendlyError(err));
    } finally {
      if (aliveRef.current) setScheduling(false);
    }
  }, [courseId, form, playerName, toast]);

  // ─── Status toggle (optimistic) ─────────────────────────────────────────────

  const onToggleStatus = useCallback(
    async (lesson: LessonRow) => {
      const target = nextStatus(lesson.status);
      const prevStatus = lesson.status;
      setLessons((prev) =>
        prev.map((l) => (l.id === lesson.id ? { ...l, status: target } : l)),
      );
      try {
        const { error } = await supabase.rpc("pk_set_lesson_status", {
          p_id: lesson.id,
          p_status: target,
        });
        if (error) throw new Error(error.message);
      } catch (err) {
        if (!aliveRef.current) return;
        setLessons((prev) =>
          prev.map((l) => (l.id === lesson.id ? { ...l, status: prevStatus } : l)),
        );
        toast.error("Couldn't update status", friendlyError(err));
      }
    },
    [toast],
  );

  // ─── Save recap ─────────────────────────────────────────────────────────────

  const onSaveRecap = useCallback(
    async (lessonId: string, recapMd: string, advance: boolean) => {
      try {
        const { data, error } = await supabase.rpc("pk_recap_lesson", {
          p_id: lessonId,
          p_recap_md: recapMd.trim() || null,
          p_status: advance ? "recapped" : null,
        });
        if (error) throw new Error(error.message);
        if (!aliveRef.current) return;
        const updated = data as unknown as LessonRow;
        setLessons((prev) => prev.map((l) => (l.id === lessonId ? updated : l)));
        toast.success("Recap saved");
      } catch (err) {
        if (aliveRef.current) toast.error("Couldn't save recap", friendlyError(err));
      }
    },
    [toast],
  );

  // ─── Attach a link video ────────────────────────────────────────────────────

  const onAddLink = useCallback(
    async (lessonId: string, rawUrl: string, title: string): Promise<boolean> => {
      const parsed = parseVideoUrl(rawUrl);
      if (!parsed.embedSrc) {
        toast.error("Unrecognised link", "Use a YouTube, Vimeo, or Google Drive URL.");
        return false;
      }
      try {
        const { data, error } = await supabase.rpc("pk_add_lesson_video", {
          p_lesson_id: lessonId,
          p_kind: "link",
          p_url: rawUrl.trim(),
          p_storage_path: null,
          p_title: title.trim() || null,
        });
        if (error) throw new Error(error.message);
        if (!aliveRef.current) return true;
        const created = data as unknown as LessonVideoRow;
        setVideosByLesson((prev) => ({
          ...prev,
          [lessonId]: [...(prev[lessonId] ?? []), created],
        }));
        toast.success("Video added");
        return true;
      } catch (err) {
        if (aliveRef.current) toast.error("Couldn't add video", friendlyError(err));
        return false;
      }
    },
    [toast],
  );

  // ─── Upload a video file ────────────────────────────────────────────────────

  const onUpload = useCallback(
    async (lessonId: string, file: File, title: string): Promise<boolean> => {
      const safeName = sanitizeFilename(file.name);
      const path = `${courseId}/${lessonId}/${crypto.randomUUID()}-${safeName}`;
      try {
        const { error: upErr } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(path, file, { contentType: file.type || undefined, upsert: false });
        if (upErr) throw new Error(upErr.message);

        const { data, error } = await supabase.rpc("pk_add_lesson_video", {
          p_lesson_id: lessonId,
          p_kind: "upload",
          p_url: null,
          p_storage_path: path,
          p_title: title.trim() || file.name,
        });
        if (error) {
          // Roll back the orphaned upload.
          void supabase.storage.from(STORAGE_BUCKET).remove([path]);
          throw new Error(error.message);
        }
        if (!aliveRef.current) return true;
        const created = data as unknown as LessonVideoRow;
        setVideosByLesson((prev) => ({
          ...prev,
          [lessonId]: [...(prev[lessonId] ?? []), created],
        }));
        toast.success("Video uploaded");
        return true;
      } catch (err) {
        if (aliveRef.current) toast.error("Upload failed", friendlyError(err));
        return false;
      }
    },
    [courseId, toast],
  );

  // ─── Delete a video (optimistic) ────────────────────────────────────────────

  const onDeleteVideo = useCallback(
    async (lessonId: string, video: LessonVideoRow) => {
      setVideosByLesson((prev) => ({
        ...prev,
        [lessonId]: (prev[lessonId] ?? []).filter((v) => v.id !== video.id),
      }));
      try {
        const { error } = await supabase.rpc("pk_delete_lesson_video", { p_id: video.id });
        if (error) throw new Error(error.message);
        if (video.kind === "upload" && video.storage_path) {
          void supabase.storage.from(STORAGE_BUCKET).remove([video.storage_path]);
        }
      } catch (err) {
        if (!aliveRef.current) return;
        setVideosByLesson((prev) => ({
          ...prev,
          [lessonId]: [...(prev[lessonId] ?? []), video].sort(
            (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
          ),
        }));
        toast.error("Couldn't remove video", friendlyError(err));
      }
    },
    [toast],
  );

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4" data-course-id={courseId}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Lessons</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Schedule sessions, write plans &amp; recaps, attach video.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setComposerOpen((o) => !o)}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 text-sm font-medium text-white ring-1 ring-slate-900 transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:ring-slate-100 dark:hover:bg-white"
        >
          <PlusIcon />
          {composerOpen ? "Close" : "Schedule lesson"}
        </button>
      </div>

      {/* Composer */}
      {composerOpen && (
        <div className="rounded-2xl bg-white/90 p-4 ring-1 ring-slate-200 dark:bg-slate-900/70 dark:ring-slate-800">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                Player
              </span>
              <select
                value={form.playerId}
                onChange={(e) => setForm((f) => ({ ...f, playerId: e.target.value }))}
                className="min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="">Choose a player…</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                Program <span className="font-normal text-slate-400">(optional)</span>
              </span>
              <select
                value={form.programId}
                onChange={(e) => setForm((f) => ({ ...f, programId: e.target.value }))}
                className="min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="">No program</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="text-sm">
              <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                When
              </span>
              <SmartDatePicker
                value={form.scheduledAt}
                onChange={(next) => setForm((f) => ({ ...f, scheduledAt: next }))}
                label="Session date & time"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                  Duration (min)
                </span>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={form.durationMin}
                  onChange={(e) => setForm((f) => ({ ...f, durationMin: e.target.value }))}
                  className="min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                  placeholder="60"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                  Location
                </span>
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                  className="min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                  placeholder="Court 3"
                />
              </label>
            </div>
          </div>

          <div className="mt-4">
            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Lesson plan
            </span>
            <MarkdownEditor
              value={form.planMd}
              onChange={(html) => setForm((f) => ({ ...f, planMd: html }))}
              placeholder="Drills, focus areas, goals for the session…"
              minHeight={120}
            />
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setForm(emptyForm());
                setComposerOpen(false);
              }}
              className="min-h-[40px] rounded-xl px-3.5 text-sm font-medium text-slate-600 ring-1 ring-slate-300 transition hover:bg-slate-50 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void onSchedule()}
              disabled={scheduling}
              className="min-h-[40px] rounded-xl bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              {scheduling ? "Scheduling…" : "Schedule"}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="rounded-2xl bg-white/80 p-4 ring-1 ring-slate-200 dark:bg-slate-900/60 dark:ring-slate-800">
          <SkeletonRows count={4} />
        </div>
      ) : !hasLessons ? (
        <div className="rounded-2xl bg-white/80 p-8 text-center ring-1 ring-slate-200 dark:bg-slate-900/60 dark:ring-slate-800">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">No lessons yet</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Schedule the first coaching session for one of your players.
          </p>
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="mt-4 inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            <PlusIcon />
            Schedule lesson
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {lessons.map((lesson) => (
            <LessonRowCard
              key={lesson.id}
              lesson={lesson}
              videos={videosByLesson[lesson.id] ?? []}
              playerName={playerName(lesson.player_id)}
              programLabel={programName(lesson.program_id)}
              expanded={expandedId === lesson.id}
              onToggleExpand={() =>
                setExpandedId((cur) => (cur === lesson.id ? null : lesson.id))
              }
              onToggleStatus={() => void onToggleStatus(lesson)}
              onSaveRecap={(md, advance) => void onSaveRecap(lesson.id, md, advance)}
              onAddLink={(url, title) => onAddLink(lesson.id, url, title)}
              onUpload={(file, title) => onUpload(lesson.id, file, title)}
              onDeleteVideo={(v) => void onDeleteVideo(lesson.id, v)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Lesson row card ────────────────────────────────────────────────────────

interface LessonRowCardProps {
  lesson: LessonRow;
  videos: LessonVideoRow[];
  playerName: string;
  programLabel: string | null;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleStatus: () => void;
  onSaveRecap: (recapMd: string, advance: boolean) => void;
  onAddLink: (url: string, title: string) => Promise<boolean>;
  onUpload: (file: File, title: string) => Promise<boolean>;
  onDeleteVideo: (video: LessonVideoRow) => void;
}

function LessonRowCard({
  lesson,
  videos,
  playerName,
  programLabel,
  expanded,
  onToggleExpand,
  onToggleStatus,
  onSaveRecap,
  onAddLink,
  onUpload,
  onDeleteVideo,
}: LessonRowCardProps) {
  const [recapDraft, setRecapDraft] = useState(lesson.recap_md ?? "");
  const [savingRecap, setSavingRecap] = useState(false);

  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [addingLink, setAddingLink] = useState(false);

  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploading, setUploading] = useState(false);

  // Keep the recap draft in sync if the lesson is reloaded externally.
  useEffect(() => {
    setRecapDraft(lesson.recap_md ?? "");
  }, [lesson.recap_md]);

  const status = lesson.status;

  const handleSaveRecap = (advance: boolean) => {
    setSavingRecap(true);
    onSaveRecap(recapDraft, advance);
    setSavingRecap(false);
  };

  const handleAddLink = async () => {
    if (!linkUrl.trim()) return;
    setAddingLink(true);
    const ok = await onAddLink(linkUrl, linkTitle);
    setAddingLink(false);
    if (ok) {
      setLinkUrl("");
      setLinkTitle("");
    }
  };

  const handleUpload = async () => {
    if (pendingFiles.length === 0) return;
    setUploading(true);
    const ok = await onUpload(pendingFiles[0], uploadTitle);
    setUploading(false);
    if (ok) {
      setPendingFiles([]);
      setUploadTitle("");
    }
  };

  return (
    <li className="overflow-hidden rounded-2xl bg-white/90 ring-1 ring-slate-200 dark:bg-slate-900/70 dark:ring-slate-800">
      {/* Summary row */}
      <div className="flex items-center gap-3 p-4">
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-expanded={expanded}
        >
          <ChevronIcon open={expanded} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-medium text-slate-900 dark:text-slate-100">
                {playerName}
              </span>
              {programLabel && (
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {programLabel}
                </span>
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400">
              <span>{formatWhen(lesson.scheduled_at)}</span>
              {lesson.duration_min != null && <span>· {lesson.duration_min} min</span>}
              {lesson.location && <span>· {lesson.location}</span>}
              {videos.length > 0 && (
                <span>
                  · {videos.length} video{videos.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
          </div>
        </button>

        {/* One-click status toggle */}
        <button
          type="button"
          onClick={onToggleStatus}
          title="Click to advance status"
          className={`min-h-[32px] shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition hover:opacity-80 ${STATUS_STYLE[status]}`}
        >
          {STATUS_LABEL[status]}
        </button>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-slate-200 px-4 py-4 dark:border-slate-800">
          {/* Plan */}
          {lesson.plan_md && (
            <section className="mb-4">
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Plan
              </h4>
              <div
                className="prose prose-sm max-w-none dark:prose-invert"
                // Trusted: authored by the educator via MarkdownEditor.
                dangerouslySetInnerHTML={{ __html: lesson.plan_md }}
              />
            </section>
          )}

          {/* Recap editor */}
          <section className="mb-4">
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Recap
            </h4>
            <MarkdownEditor
              value={recapDraft}
              onChange={setRecapDraft}
              placeholder="What happened, what improved, what to work on next…"
              minHeight={110}
            />
            <div className="mt-2 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => handleSaveRecap(false)}
                disabled={savingRecap}
                className="min-h-[36px] rounded-lg px-3 text-sm font-medium text-slate-600 ring-1 ring-slate-300 transition hover:bg-slate-50 disabled:opacity-60 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800"
              >
                Save draft
              </button>
              {status !== "recapped" && (
                <button
                  type="button"
                  onClick={() => handleSaveRecap(true)}
                  disabled={savingRecap}
                  className="min-h-[36px] rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60"
                >
                  Save &amp; mark recapped
                </button>
              )}
            </div>
          </section>

          {/* Videos */}
          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Recap videos
            </h4>

            {videos.length > 0 && (
              <ul className="mb-3 space-y-2">
                {videos.map((v) => (
                  <li
                    key={v.id}
                    className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <VideoIcon />
                      <span className="truncate text-slate-700 dark:text-slate-200">
                        {v.title || (v.kind === "link" ? v.url : "Uploaded video")}
                      </span>
                      <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-500 dark:bg-slate-700 dark:text-slate-300">
                        {v.kind}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => onDeleteVideo(v)}
                      aria-label="Remove video"
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                    >
                      <TrashIcon />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Add a link */}
            <div className="mb-3 rounded-xl border border-dashed border-slate-300 p-3 dark:border-slate-700">
              <p className="mb-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                Paste a link (YouTube, Vimeo, Google Drive)
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="url"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://youtu.be/…"
                  className="min-h-[40px] flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
                <input
                  type="text"
                  value={linkTitle}
                  onChange={(e) => setLinkTitle(e.target.value)}
                  placeholder="Title (optional)"
                  className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 sm:w-44"
                />
                <button
                  type="button"
                  onClick={() => void handleAddLink()}
                  disabled={addingLink || !linkUrl.trim()}
                  className="min-h-[40px] shrink-0 rounded-lg bg-slate-900 px-3.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                >
                  {addingLink ? "Adding…" : "Add link"}
                </button>
              </div>
            </div>

            {/* Upload a file */}
            <div className="rounded-xl border border-dashed border-slate-300 p-3 dark:border-slate-700">
              <p className="mb-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                Or upload a video file
              </p>
              <FileDropzone
                files={pendingFiles}
                onChange={setPendingFiles}
                accept={VIDEO_ACCEPT}
                maxSize={VIDEO_MAX_SIZE}
                multiple={false}
              />
              {pendingFiles.length > 0 && (
                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    type="text"
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    placeholder="Title (optional)"
                    className="min-h-[40px] flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                  <button
                    type="button"
                    onClick={() => void handleUpload()}
                    disabled={uploading}
                    className="min-h-[40px] shrink-0 rounded-lg bg-slate-900 px-3.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                  >
                    {uploading ? "Uploading…" : "Upload"}
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </li>
  );
}

// ─── Icons (inline SVG — no emoji) ──────────────────────────────────────────

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
    >
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="shrink-0 text-slate-400">
      <rect x="2" y="6" width="14" height="12" rx="2" />
      <path d="M16 10l6-3v10l-6-3" strokeLinejoin="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
