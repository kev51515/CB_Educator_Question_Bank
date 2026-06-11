/**
 * DrillsPanel — Pickleball PLAYER-track teacher panel (Increment 2, Lane B).
 *
 * Two jobs on one surface:
 *   1. Drill library CRUD — name, description (MarkdownEditor), demo video
 *      (embedded preview via @/lib/videoEmbed), skill tags (multi-select over
 *      the fixed PICKLEBALL_SKILLS taxonomy), level band, solo/partner,
 *      equipment, status. Inline-edit-by-pencil + one-click archive.
 *   2. Assign homework — pick a player + one-or-more drills + optional due
 *      date -> pk_assign_homework. Each player's outstanding homework + done
 *      state shows below.
 *
 * Optimistic UI + toast feedback throughout; Skeleton while loading; empty
 * states with a CTA.
 *
 * Prop contract (do not change):
 *   export function DrillsPanel({ courseId }: { courseId: string })
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  MarkdownEditor,
  SmartDatePicker,
  SkeletonRows,
  KebabMenu,
  Combobox,
  useToast,
} from "@/components";
import { PICKLEBALL_SKILLS, SKILL_LEVELS, skillLabel } from "@/lib/pickleballSkills";
import { parseVideoUrl } from "@/lib/videoEmbed";

// ─── Constants ──────────────────────────────────────────────────────────────

type DrillStatus = "draft" | "published" | "archived";
type SoloOrPartner = "solo" | "partner" | "group" | "wall";

const SOLO_OPTIONS: { value: SoloOrPartner; label: string }[] = [
  { value: "solo", label: "Solo" },
  { value: "partner", label: "Partner" },
  { value: "group", label: "Group" },
  { value: "wall", label: "Wall" },
];

const STATUS_STYLE: Record<DrillStatus, string> = {
  draft:
    "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:ring-slate-700",
  published:
    "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900",
  archived:
    "bg-slate-100 text-slate-400 ring-slate-200 dark:bg-slate-800/40 dark:text-slate-500 dark:ring-slate-700",
};

const STATUS_LABEL: Record<DrillStatus, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

const HW_STATUS_STYLE: Record<HomeworkStatus, string> = {
  assigned:
    "bg-sky-100 text-sky-700 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900",
  done:
    "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900",
  skipped:
    "bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900",
};

const HW_STATUS_LABEL: Record<HomeworkStatus, string> = {
  assigned: "Assigned",
  done: "Done",
  skipped: "Skipped",
};

// ─── Types ──────────────────────────────────────────────────────────────────

type HomeworkStatus = "assigned" | "done" | "skipped";

interface DrillRow {
  id: string;
  course_id: string;
  name: string;
  description: string | null;
  demo_video_url: string | null;
  skill_tags: string[];
  level_min: number | null;
  level_max: number | null;
  solo_or_partner: SoloOrPartner | null;
  equipment: string[] | null;
  default_params: Record<string, unknown> | null;
  contributed_by: string | null;
  status: DrillStatus;
  created_at: string;
}

interface HomeworkRow {
  id: string;
  course_id: string;
  player_id: string;
  drill_id: string;
  lesson_id: string | null;
  params: Record<string, unknown> | null;
  due_on: string | null;
  status: HomeworkStatus;
  assigned_by: string | null;
  completed_at: string | null;
  created_at: string;
}

interface PlayerOption {
  id: string;
  name: string;
}

interface DrillForm {
  id: string | null;
  name: string;
  description: string;
  demoVideoUrl: string;
  skillTags: string[];
  levelMin: string;
  levelMax: string;
  soloOrPartner: SoloOrPartner | "";
  equipment: string;
  status: DrillStatus;
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
      return "You don't have permission to manage drills for this course.";
    case "not_authenticated":
      return "Your session expired — please sign in again.";
    case "not_found":
      return "That drill no longer exists.";
    case "invalid_input":
      return "Please fill in the required fields.";
    default:
      return raw;
  }
}

function emptyDrillForm(): DrillForm {
  return {
    id: null,
    name: "",
    description: "",
    demoVideoUrl: "",
    skillTags: [],
    levelMin: "",
    levelMax: "",
    soloOrPartner: "",
    equipment: "",
    status: "published",
  };
}

function formToDrill(d: DrillRow): DrillForm {
  return {
    id: d.id,
    name: d.name,
    description: d.description ?? "",
    demoVideoUrl: d.demo_video_url ?? "",
    skillTags: d.skill_tags ?? [],
    levelMin: d.level_min != null ? String(d.level_min) : "",
    levelMax: d.level_max != null ? String(d.level_max) : "",
    soloOrPartner: d.solo_or_partner ?? "",
    equipment: (d.equipment ?? []).join(", "),
    status: d.status,
  };
}

function levelBand(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) return min === max ? `${min}` : `${min}–${max}`;
  return min != null ? `${min}+` : `≤${max}`;
}

function formatDue(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Convert a full ISO datetime to a local YYYY-MM-DD date string. */
function isoToLocalDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function DrillsPanel({ courseId }: { courseId: string }) {
  const toast = useToast();
  const aliveRef = useRef(true);

  const [loading, setLoading] = useState(true);
  const [drills, setDrills] = useState<DrillRow[]>([]);
  const [homework, setHomework] = useState<HomeworkRow[]>([]);
  const [players, setPlayers] = useState<PlayerOption[]>([]);

  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState<DrillForm>(emptyDrillForm);
  const [saving, setSaving] = useState(false);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignPlayerId, setAssignPlayerId] = useState("");
  const [assignDrillIds, setAssignDrillIds] = useState<string[]>([]);
  const [assignDue, setAssignDue] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // ─── Load ───────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [drillsRes, hwRes, rosterRes] = await Promise.all([
        supabase
          .from("pickleball_drills")
          .select(
            "id, course_id, name, description, demo_video_url, skill_tags, level_min, level_max, solo_or_partner, equipment, default_params, contributed_by, status, created_at",
          )
          .eq("course_id", courseId)
          .order("created_at", { ascending: false }),
        supabase
          .from("pickleball_homework")
          .select(
            "id, course_id, player_id, drill_id, lesson_id, params, due_on, status, assigned_by, completed_at, created_at",
          )
          .eq("course_id", courseId)
          .order("created_at", { ascending: false }),
        supabase
          .from("course_memberships")
          .select(
            "student_id, student:profiles!course_memberships_student_id_fkey(display_name, email)",
          )
          .eq("course_id", courseId),
      ]);

      if (!aliveRef.current) return;

      if (drillsRes.error) throw new Error(drillsRes.error.message);
      setDrills((drillsRes.data ?? []) as unknown as DrillRow[]);

      if (hwRes.error) throw new Error(hwRes.error.message);
      setHomework((hwRes.data ?? []) as unknown as HomeworkRow[]);

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
    } catch (err) {
      if (aliveRef.current) toast.error("Couldn't load drills", friendlyError(err));
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [courseId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const drillName = useCallback(
    (id: string) => drills.find((d) => d.id === id)?.name ?? "Drill",
    [drills],
  );
  const playerName = useCallback(
    (id: string) => players.find((p) => p.id === id)?.name ?? "Player",
    [players],
  );

  const assignableDrills = useMemo(
    () => drills.filter((d) => d.status !== "archived"),
    [drills],
  );

  const homeworkByPlayer = useMemo(() => {
    const grouped: Record<string, HomeworkRow[]> = {};
    for (const hw of homework) (grouped[hw.player_id] ??= []).push(hw);
    return grouped;
  }, [homework]);

  // ─── Drill save ───────────────────────────────────────────────────────────

  const openNewDrill = useCallback(() => {
    setForm(emptyDrillForm());
    setEditorOpen(true);
  }, []);

  const openEditDrill = useCallback((d: DrillRow) => {
    setForm(formToDrill(d));
    setEditorOpen(true);
  }, []);

  const onSaveDrill = useCallback(async () => {
    if (!form.name.trim()) {
      toast.error("Name required", "Give the drill a name.");
      return;
    }
    setSaving(true);
    try {
      const levelMin = form.levelMin.trim() ? Number(form.levelMin) : null;
      const levelMax = form.levelMax.trim() ? Number(form.levelMax) : null;
      const equipment = form.equipment
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const { data, error } = await supabase.rpc("pk_upsert_drill", {
        p_course_id: courseId,
        p_id: form.id,
        p_name: form.name.trim(),
        p_description: form.description.trim() || null,
        p_demo_video_url: form.demoVideoUrl.trim() || null,
        p_skill_tags: form.skillTags,
        p_level_min: levelMin != null && !Number.isNaN(levelMin) ? levelMin : null,
        p_level_max: levelMax != null && !Number.isNaN(levelMax) ? levelMax : null,
        p_solo_or_partner: form.soloOrPartner || null,
        p_equipment: equipment.length > 0 ? equipment : null,
        p_default_params: null,
        p_status: form.status,
      });
      if (error) throw new Error(error.message);
      if (!aliveRef.current) return;
      const saved = data as unknown as DrillRow;
      setDrills((prev) => {
        const exists = prev.some((d) => d.id === saved.id);
        return exists
          ? prev.map((d) => (d.id === saved.id ? saved : d))
          : [saved, ...prev];
      });
      setEditorOpen(false);
      setForm(emptyDrillForm());
      toast.success(form.id ? "Drill updated" : "Drill added", saved.name);
    } catch (err) {
      if (aliveRef.current) toast.error("Couldn't save drill", friendlyError(err));
    } finally {
      if (aliveRef.current) setSaving(false);
    }
  }, [courseId, form, toast]);

  // ─── Archive / restore (optimistic) ─────────────────────────────────────────

  const onArchiveDrill = useCallback(
    async (drill: DrillRow, archived: boolean) => {
      const prevStatus = drill.status;
      const optimistic: DrillStatus = archived ? "archived" : "published";
      setDrills((prev) =>
        prev.map((d) => (d.id === drill.id ? { ...d, status: optimistic } : d)),
      );
      try {
        const { data, error } = await supabase.rpc("pk_archive_drill", {
          p_id: drill.id,
          p_archived: archived,
        });
        if (error) throw new Error(error.message);
        if (!aliveRef.current) return;
        const saved = data as unknown as DrillRow;
        setDrills((prev) => prev.map((d) => (d.id === drill.id ? saved : d)));
        toast.success(archived ? "Drill archived" : "Drill restored", drill.name);
      } catch (err) {
        if (!aliveRef.current) return;
        setDrills((prev) =>
          prev.map((d) => (d.id === drill.id ? { ...d, status: prevStatus } : d)),
        );
        toast.error("Couldn't update drill", friendlyError(err));
      }
    },
    [toast],
  );

  // ─── Assign homework ─────────────────────────────────────────────────────

  const resetAssign = useCallback(() => {
    setAssignPlayerId("");
    setAssignDrillIds([]);
    setAssignDue(null);
    setAssignOpen(false);
  }, []);

  const onAssign = useCallback(async () => {
    if (!assignPlayerId) {
      toast.error("Pick a player", "Choose who this homework is for.");
      return;
    }
    if (assignDrillIds.length === 0) {
      toast.error("Pick a drill", "Select at least one drill to assign.");
      return;
    }
    setAssigning(true);
    try {
      // SmartDatePicker emits a full ISO datetime; homework.due_on is a DATE.
      const dueDate = isoToLocalDate(assignDue);
      const created: HomeworkRow[] = [];
      for (const drillId of assignDrillIds) {
        const { data, error } = await supabase.rpc("pk_assign_homework", {
          p_course_id: courseId,
          p_player_id: assignPlayerId,
          p_drill_id: drillId,
          p_lesson_id: null,
          p_params: null,
          p_due_on: dueDate,
        });
        if (error) throw new Error(error.message);
        created.push(data as unknown as HomeworkRow);
      }
      if (!aliveRef.current) return;
      setHomework((prev) => [...created, ...prev]);
      const who = playerName(assignPlayerId);
      toast.success(
        `Assigned ${created.length} drill${created.length === 1 ? "" : "s"}`,
        who,
      );
      resetAssign();
    } catch (err) {
      if (aliveRef.current) toast.error("Couldn't assign homework", friendlyError(err));
    } finally {
      if (aliveRef.current) setAssigning(false);
    }
  }, [assignDrillIds, assignDue, assignPlayerId, courseId, playerName, resetAssign, toast]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6" data-course-id={courseId}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Drills &amp; homework
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Build a drill library, then assign drills to players as homework.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAssignOpen((o) => !o)}
            disabled={assignableDrills.length === 0 || players.length === 0}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3.5 text-sm font-medium text-slate-700 ring-1 ring-slate-300 transition hover:bg-slate-50 disabled:opacity-50 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800"
          >
            <ClipboardIcon />
            {assignOpen ? "Close" : "Assign homework"}
          </button>
          <button
            type="button"
            onClick={openNewDrill}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 text-sm font-medium text-white ring-1 ring-slate-900 transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:ring-slate-100 dark:hover:bg-white"
          >
            <PlusIcon />
            New drill
          </button>
        </div>
      </div>

      {/* Assign-homework composer */}
      {assignOpen && (
        <div className="rounded-2xl bg-white/90 p-4 ring-1 ring-slate-200 dark:bg-slate-900/70 dark:ring-slate-800">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                Player
              </span>
              <Combobox
                value={assignPlayerId || null}
                onChange={setAssignPlayerId}
                options={players.map((p) => ({ value: p.id, label: p.name }))}
                ariaLabel="Player"
                placeholder="Choose a player…"
              />
            </label>

            <div className="text-sm">
              <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                Due date <span className="font-normal text-slate-400">(optional)</span>
              </span>
              <SmartDatePicker
                value={assignDue}
                onChange={setAssignDue}
                label="Due date"
              />
            </div>
          </div>

          <div className="mt-4">
            <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Drills ({assignDrillIds.length} selected)
            </span>
            <div className="flex flex-wrap gap-2">
              {assignableDrills.map((d) => {
                const selected = assignDrillIds.includes(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() =>
                      setAssignDrillIds((prev) =>
                        prev.includes(d.id)
                          ? prev.filter((id) => id !== d.id)
                          : [...prev, d.id],
                      )
                    }
                    aria-pressed={selected}
                    className={`min-h-[36px] rounded-full px-3 text-sm ring-1 transition ${
                      selected
                        ? "bg-slate-900 text-white ring-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:ring-slate-100"
                        : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50 dark:bg-slate-950 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800"
                    }`}
                  >
                    {d.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={resetAssign}
              className="min-h-[40px] rounded-xl px-3.5 text-sm font-medium text-slate-600 ring-1 ring-slate-300 transition hover:bg-slate-50 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void onAssign()}
              disabled={assigning}
              className="min-h-[40px] rounded-xl bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              {assigning ? "Assigning…" : "Assign"}
            </button>
          </div>
        </div>
      )}

      {/* Drill editor */}
      {editorOpen && (
        <DrillEditor
          form={form}
          setForm={setForm}
          saving={saving}
          onSave={() => void onSaveDrill()}
          onCancel={() => {
            setEditorOpen(false);
            setForm(emptyDrillForm());
          }}
        />
      )}

      {/* Drill library */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Drill library
        </h3>
        {loading ? (
          <div className="rounded-2xl bg-white/80 p-4 ring-1 ring-slate-200 dark:bg-slate-900/60 dark:ring-slate-800">
            <SkeletonRows count={4} />
          </div>
        ) : drills.length === 0 ? (
          <div className="rounded-2xl bg-white/80 p-8 text-center ring-1 ring-slate-200 dark:bg-slate-900/60 dark:ring-slate-800">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              No drills yet
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Add your first drill to start building this course's library.
            </p>
            <button
              type="button"
              onClick={openNewDrill}
              className="mt-4 inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              <PlusIcon />
              New drill
            </button>
          </div>
        ) : (
          <ul className="space-y-3">
            {drills.map((drill) => (
              <DrillCard
                key={drill.id}
                drill={drill}
                onEdit={() => openEditDrill(drill)}
                onArchive={() => void onArchiveDrill(drill, true)}
                onRestore={() => void onArchiveDrill(drill, false)}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Assigned homework, grouped by player */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Assigned homework
        </h3>
        {loading ? (
          <div className="rounded-2xl bg-white/80 p-4 ring-1 ring-slate-200 dark:bg-slate-900/60 dark:ring-slate-800">
            <SkeletonRows count={3} />
          </div>
        ) : homework.length === 0 ? (
          <div className="rounded-2xl bg-white/80 p-6 text-center ring-1 ring-slate-200 dark:bg-slate-900/60 dark:ring-slate-800">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              No homework assigned yet
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Use “Assign homework” above to give a player drills to practise.
            </p>
          </div>
        ) : (
          <ul className="space-y-4">
            {players
              .filter((p) => (homeworkByPlayer[p.id] ?? []).length > 0)
              .map((p) => {
                const rows = homeworkByPlayer[p.id] ?? [];
                const doneCount = rows.filter((r) => r.status === "done").length;
                return (
                  <li
                    key={p.id}
                    className="rounded-2xl bg-white/90 p-4 ring-1 ring-slate-200 dark:bg-slate-900/70 dark:ring-slate-800"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-900 dark:text-slate-100">
                        {p.name}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {doneCount}/{rows.length} done
                      </span>
                    </div>
                    <ul className="space-y-1.5">
                      {rows.map((hw) => {
                        const due = formatDue(hw.due_on);
                        return (
                          <li
                            key={hw.id}
                            className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60"
                          >
                            <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">
                              {drillName(hw.drill_id)}
                              {due && (
                                <span className="ml-2 text-xs text-slate-400">
                                  due {due}
                                </span>
                              )}
                            </span>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${HW_STATUS_STYLE[hw.status]}`}
                            >
                              {HW_STATUS_LABEL[hw.status]}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
          </ul>
        )}
      </section>
    </div>
  );
}

// ─── Drill editor ────────────────────────────────────────────────────────────

interface DrillEditorProps {
  form: DrillForm;
  setForm: React.Dispatch<React.SetStateAction<DrillForm>>;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}

function DrillEditor({ form, setForm, saving, onSave, onCancel }: DrillEditorProps) {
  const preview = form.demoVideoUrl.trim()
    ? parseVideoUrl(form.demoVideoUrl.trim())
    : null;

  const toggleTag = (slug: string) =>
    setForm((f) => ({
      ...f,
      skillTags: f.skillTags.includes(slug)
        ? f.skillTags.filter((t) => t !== slug)
        : [...f.skillTags, slug],
    }));

  return (
    <div className="rounded-2xl bg-white/90 p-4 ring-1 ring-slate-200 dark:bg-slate-900/70 dark:ring-slate-800">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
            Name
          </span>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Cross-court dink rally"
            className="min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
        </label>

        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
            Demo video URL <span className="font-normal text-slate-400">(optional)</span>
          </span>
          <input
            type="url"
            value={form.demoVideoUrl}
            onChange={(e) => setForm((f) => ({ ...f, demoVideoUrl: e.target.value }))}
            placeholder="https://youtu.be/…"
            className="min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
        </label>

        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
            Format
          </span>
          <Combobox
            value={form.soloOrPartner || null}
            onChange={(v) =>
              setForm((f) => ({ ...f, soloOrPartner: v as SoloOrPartner }))
            }
            options={SOLO_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            ariaLabel="Format"
            placeholder="Any"
          />
        </label>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <label>
            <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
              Level min
            </span>
            <Combobox
              value={form.levelMin || null}
              onChange={(v) => setForm((f) => ({ ...f, levelMin: v }))}
              options={SKILL_LEVELS.map((l) => ({ value: l, label: l }))}
              ariaLabel="Level min"
              placeholder="—"
            />
          </label>
          <label>
            <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
              Level max
            </span>
            <Combobox
              value={form.levelMax || null}
              onChange={(v) => setForm((f) => ({ ...f, levelMax: v }))}
              options={SKILL_LEVELS.map((l) => ({ value: l, label: l }))}
              ariaLabel="Level max"
              placeholder="—"
            />
          </label>
        </div>

        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
            Equipment <span className="font-normal text-slate-400">(comma-separated)</span>
          </span>
          <input
            type="text"
            value={form.equipment}
            onChange={(e) => setForm((f) => ({ ...f, equipment: e.target.value }))}
            placeholder="balls, cones"
            className="min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
        </label>

        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
            Status
          </span>
          <Combobox
            value={form.status}
            onChange={(v) => setForm((f) => ({ ...f, status: v as DrillStatus }))}
            options={[
              { value: "published", label: "Published" },
              { value: "draft", label: "Draft" },
              { value: "archived", label: "Archived" },
            ]}
            ariaLabel="Status"
          />
        </label>
      </div>

      {/* Demo video preview */}
      {preview?.embedSrc && (
        <div className="mt-3">
          <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
            Preview
          </span>
          <div
            className="relative w-full overflow-hidden rounded-xl bg-black"
            style={{ paddingBottom: "56.25%" }}
          >
            <iframe
              src={preview.embedSrc}
              title="Drill demo preview"
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 h-full w-full"
            />
          </div>
        </div>
      )}

      {/* Skill tags */}
      <div className="mt-4">
        <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Skills
        </span>
        <div className="flex flex-wrap gap-2">
          {PICKLEBALL_SKILLS.map((s) => {
            const on = form.skillTags.includes(s.slug);
            return (
              <button
                key={s.slug}
                type="button"
                onClick={() => toggleTag(s.slug)}
                aria-pressed={on}
                className={`min-h-[36px] rounded-full px-3 text-sm ring-1 transition ${
                  on
                    ? "bg-slate-900 text-white ring-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:ring-slate-100"
                    : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50 dark:bg-slate-950 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Description */}
      <div className="mt-4">
        <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Description
        </span>
        <MarkdownEditor
          value={form.description}
          onChange={(html) => setForm((f) => ({ ...f, description: html }))}
          placeholder="How the drill works, what to focus on, reps / time…"
          minHeight={120}
        />
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[40px] rounded-xl px-3.5 text-sm font-medium text-slate-600 ring-1 ring-slate-300 transition hover:bg-slate-50 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="min-h-[40px] rounded-xl bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          {saving ? "Saving…" : form.id ? "Save changes" : "Add drill"}
        </button>
      </div>
    </div>
  );
}

// ─── Drill card ──────────────────────────────────────────────────────────────

interface DrillCardProps {
  drill: DrillRow;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
}

function DrillCard({ drill, onEdit, onArchive, onRestore }: DrillCardProps) {
  const band = levelBand(drill.level_min, drill.level_max);
  const isArchived = drill.status === "archived";

  return (
    <li
      className={`rounded-2xl bg-white/90 p-4 ring-1 ring-slate-200 dark:bg-slate-900/70 dark:ring-slate-800 ${
        isArchived ? "opacity-70" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-900 dark:text-slate-100">
              {drill.name}
            </span>
            <button
              type="button"
              onClick={onEdit}
              aria-label="Edit drill"
              className="grid h-7 w-7 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
            >
              <PencilIcon />
            </button>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${STATUS_STYLE[drill.status]}`}
            >
              {STATUS_LABEL[drill.status]}
            </span>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            {drill.solo_or_partner && (
              <span className="capitalize">{drill.solo_or_partner}</span>
            )}
            {band && <span>· Level {band}</span>}
            {drill.equipment && drill.equipment.length > 0 && (
              <span>· {drill.equipment.join(", ")}</span>
            )}
            {drill.demo_video_url && <span>· has video</span>}
          </div>

          {drill.skill_tags.length > 0 && (
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

          {drill.description && (
            <div
              className="prose prose-sm mt-2 max-w-none text-slate-600 dark:prose-invert dark:text-slate-300"
              // Trusted: authored by the educator via MarkdownEditor.
              dangerouslySetInnerHTML={{ __html: drill.description }}
            />
          )}
        </div>

        <KebabMenu
          options={[
            { label: "Edit", onSelect: onEdit },
            isArchived
              ? { label: "Restore", onSelect: onRestore }
              : { label: "Archive", onSelect: onArchive },
          ]}
        />
      </div>
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

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 20h9" strokeLinecap="round" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinejoin="round" />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
