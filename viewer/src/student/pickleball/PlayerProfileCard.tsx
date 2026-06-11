/**
 * PlayerProfileCard — a pickleball PLAYER views + edits their OWN intake
 * profile for a course. The viewer is the signed-in student; `studentId` is
 * their `profiles.id` (== auth.uid()). Writes go through
 * `pk_upsert_player_profile` with p_student_id = self, which the RPC + RLS both
 * permit for the owning player.
 *
 * Read path: SELECT the row directly (RLS "self reads" policy). If no row
 * exists yet the card shows an empty state with a CTA to start the profile.
 *
 * UX: read mode shows a tidy field grid; an "Edit" affordance flips to an
 * inline form (no modal). Save is optimistic — we reconcile the returned row.
 * Skeleton on load, toast for feedback, no inline error text.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Combobox, useToast } from "@/components";
import { SkeletonRows } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";

// ── Shared shape (self-contained; the teacher PlayersPanel keeps its own copy
//    to avoid a student↔teacher cross-surface import). ───────────────────────

export type PlayerGoal = "fun" | "fitness" | "competition" | "skill";
export type DominantHand = "left" | "right";

export interface PlayerProfile {
  id: string;
  course_id: string;
  student_id: string;
  dob: string | null;
  years_played: number | null;
  sports_background: string | null;
  goal: PlayerGoal | null;
  goal_notes: string | null;
  referred_by: string | null;
  skill_level: string | null;
  dupr: number | null;
  dominant_hand: DominantHand | null;
  start_date: string | null;
  contact: string | null;
  emergency_contact: string | null;
  updated_at: string;
  created_at: string;
}

interface Draft {
  dob: string;
  years_played: string;
  sports_background: string;
  goal: string;
  goal_notes: string;
  referred_by: string;
  skill_level: string;
  dupr: string;
  dominant_hand: string;
  start_date: string;
  contact: string;
  emergency_contact: string;
}

const GOAL_OPTIONS: readonly PlayerGoal[] = [
  "fun",
  "fitness",
  "competition",
  "skill",
];
const HAND_OPTIONS: readonly DominantHand[] = ["left", "right"];

function goalLabel(goal: string | null | undefined): string {
  switch (goal) {
    case "fun":
      return "Fun";
    case "fitness":
      return "Fitness";
    case "competition":
      return "Competition";
    case "skill":
      return "Skill";
    default:
      return "—";
  }
}

function handLabel(hand: string | null | undefined): string {
  switch (hand) {
    case "left":
      return "Left";
    case "right":
      return "Right";
    default:
      return "—";
  }
}

function emptyDraft(): Draft {
  return {
    dob: "",
    years_played: "",
    sports_background: "",
    goal: "",
    goal_notes: "",
    referred_by: "",
    skill_level: "",
    dupr: "",
    dominant_hand: "",
    start_date: "",
    contact: "",
    emergency_contact: "",
  };
}

function draftFromProfile(p: PlayerProfile): Draft {
  return {
    dob: p.dob ?? "",
    years_played: p.years_played == null ? "" : String(p.years_played),
    sports_background: p.sports_background ?? "",
    goal: p.goal ?? "",
    goal_notes: p.goal_notes ?? "",
    referred_by: p.referred_by ?? "",
    skill_level: p.skill_level ?? "",
    dupr: p.dupr == null ? "" : String(p.dupr),
    dominant_hand: p.dominant_hand ?? "",
    start_date: p.start_date ?? "",
    contact: p.contact ?? "",
    emergency_contact: p.emergency_contact ?? "",
  };
}

/** Map the string draft to the RPC's typed args (blank → null, numbers parsed). */
function upsertArgs(d: Draft): Record<string, string | number | null> {
  const num = (v: string): number | null => {
    const t = v.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };
  const str = (v: string): string | null => (v.trim() === "" ? null : v.trim());
  return {
    p_dob: str(d.dob),
    p_years_played: num(d.years_played),
    p_sports_background: str(d.sports_background),
    p_goal: str(d.goal),
    p_goal_notes: str(d.goal_notes),
    p_referred_by: str(d.referred_by),
    p_skill_level: str(d.skill_level),
    p_dupr: num(d.dupr),
    p_dominant_hand: str(d.dominant_hand),
    p_start_date: str(d.start_date),
    p_contact: str(d.contact),
    p_emergency_contact: str(d.emergency_contact),
  };
}

interface Props {
  courseId: string;
  studentId: string;
}

const inputCls =
  "w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500";

function fmtDate(value: string | null): string {
  if (!value) return "—";
  const [y, m, d] = value.split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return value;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function ReadField({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-slate-900 dark:text-slate-100">
        {value && String(value).trim() !== "" ? value : "—"}
      </dd>
    </div>
  );
}

function ProfileForm({
  draft,
  onChange,
}: {
  draft: Draft;
  onChange: (next: Draft) => void;
}) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]): void => {
    onChange({ ...draft, [key]: value });
  };
  const labelCls = "block text-xs text-slate-500 dark:text-slate-400 mb-1";
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label htmlFor="pk-self-dob" className={labelCls}>
          Date of birth
        </label>
        <input
          id="pk-self-dob"
          type="date"
          value={draft.dob}
          onChange={(e) => set("dob", e.target.value)}
          className={`${inputCls} min-h-[40px]`}
        />
      </div>
      <div>
        <label htmlFor="pk-self-years" className={labelCls}>
          Years played
        </label>
        <input
          id="pk-self-years"
          type="number"
          min={0}
          step="0.5"
          inputMode="decimal"
          value={draft.years_played}
          onChange={(e) => set("years_played", e.target.value)}
          placeholder="e.g. 2"
          className={`${inputCls} min-h-[40px]`}
        />
      </div>
      <div>
        <label htmlFor="pk-self-goal" className={labelCls}>
          Goal
        </label>
        <Combobox
          id="pk-self-goal"
          ariaLabel="Goal"
          value={draft.goal === "" ? null : draft.goal}
          onChange={(v) => set("goal", v)}
          options={GOAL_OPTIONS.map((g) => ({
            value: g,
            label: goalLabel(g),
          }))}
          placeholder="Not set"
          className={`${inputCls} min-h-[40px]`}
        />
      </div>
      <div>
        <label htmlFor="pk-self-hand" className={labelCls}>
          Dominant hand
        </label>
        <Combobox
          id="pk-self-hand"
          ariaLabel="Dominant hand"
          value={draft.dominant_hand === "" ? null : draft.dominant_hand}
          onChange={(v) => set("dominant_hand", v)}
          options={HAND_OPTIONS.map((h) => ({
            value: h,
            label: handLabel(h),
          }))}
          placeholder="Not set"
          className={`${inputCls} min-h-[40px]`}
        />
      </div>
      <div>
        <label htmlFor="pk-self-skill" className={labelCls}>
          Skill level
        </label>
        <input
          id="pk-self-skill"
          type="text"
          value={draft.skill_level}
          onChange={(e) => set("skill_level", e.target.value)}
          placeholder="e.g. Beginner / 3.0"
          className={`${inputCls} min-h-[40px]`}
        />
      </div>
      <div>
        <label htmlFor="pk-self-dupr" className={labelCls}>
          DUPR
        </label>
        <input
          id="pk-self-dupr"
          type="number"
          min={0}
          step="0.001"
          inputMode="decimal"
          value={draft.dupr}
          onChange={(e) => set("dupr", e.target.value)}
          placeholder="e.g. 3.250"
          className={`${inputCls} min-h-[40px]`}
        />
      </div>
      <div>
        <label htmlFor="pk-self-start" className={labelCls}>
          Start date
        </label>
        <input
          id="pk-self-start"
          type="date"
          value={draft.start_date}
          onChange={(e) => set("start_date", e.target.value)}
          className={`${inputCls} min-h-[40px]`}
        />
      </div>
      <div>
        <label htmlFor="pk-self-referred" className={labelCls}>
          Referred by
        </label>
        <input
          id="pk-self-referred"
          type="text"
          value={draft.referred_by}
          onChange={(e) => set("referred_by", e.target.value)}
          placeholder="Who told you about us?"
          className={`${inputCls} min-h-[40px]`}
        />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="pk-self-sports" className={labelCls}>
          Sports background
        </label>
        <textarea
          id="pk-self-sports"
          value={draft.sports_background}
          onChange={(e) => set("sports_background", e.target.value)}
          rows={2}
          placeholder="Other racquet / paddle / athletic experience"
          className={inputCls}
        />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="pk-self-goalnotes" className={labelCls}>
          Goal notes
        </label>
        <textarea
          id="pk-self-goalnotes"
          value={draft.goal_notes}
          onChange={(e) => set("goal_notes", e.target.value)}
          rows={2}
          placeholder="What do you most want to improve?"
          className={inputCls}
        />
      </div>
      <div>
        <label htmlFor="pk-self-contact" className={labelCls}>
          Contact
        </label>
        <input
          id="pk-self-contact"
          type="text"
          value={draft.contact}
          onChange={(e) => set("contact", e.target.value)}
          placeholder="Phone or email"
          className={`${inputCls} min-h-[40px]`}
        />
      </div>
      <div>
        <label htmlFor="pk-self-emergency" className={labelCls}>
          Emergency contact
        </label>
        <input
          id="pk-self-emergency"
          type="text"
          value={draft.emergency_contact}
          onChange={(e) => set("emergency_contact", e.target.value)}
          placeholder="Name + phone"
          className={`${inputCls} min-h-[40px]`}
        />
      </div>
    </div>
  );
}

export function PlayerProfileCard({ courseId, studentId }: Props) {
  const toast = useToast();
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    const { data, error } = await supabase
      .from("pickleball_player_profiles")
      .select("*")
      .eq("course_id", courseId)
      .eq("student_id", studentId)
      .maybeSingle();
    if (!aliveRef.current) return;
    if (error) {
      toast.error("Couldn't load your profile", error.message);
      setProfile(null);
    } else {
      setProfile((data as PlayerProfile | null) ?? null);
    }
    setLoading(false);
  }, [courseId, studentId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const beginEdit = (): void => {
    setDraft(profile ? draftFromProfile(profile) : emptyDraft());
    setEditing(true);
  };

  const onSave = async (): Promise<void> => {
    if (saving) return;
    setSaving(true);
    const { data, error } = await supabase.rpc("pk_upsert_player_profile", {
      p_course_id: courseId,
      p_student_id: studentId,
      ...upsertArgs(draft),
    });
    if (!aliveRef.current) return;
    setSaving(false);
    if (error) {
      toast.error("Couldn't save your profile", error.message);
      return;
    }
    const row = (Array.isArray(data) ? data[0] : data) as PlayerProfile | null;
    if (row) setProfile(row);
    setEditing(false);
    toast.success("Profile saved");
  };

  if (loading) {
    return (
      <section className="rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white/80 dark:bg-slate-900/60 px-5 py-5 space-y-4">
        <SkeletonRows count={4} />
      </section>
    );
  }

  if (editing) {
    return (
      <section className="rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white/80 dark:bg-slate-900/60 px-5 py-5 space-y-4">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Your player profile
        </h3>
        <ProfileForm draft={draft} onChange={setDraft} />
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="min-h-[40px] rounded-lg px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              void onSave();
            }}
            disabled={saving}
            className="min-h-[40px] rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : "Save profile"}
          </button>
        </div>
      </section>
    );
  }

  if (!profile) {
    return (
      <section className="rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white/80 dark:bg-slate-900/60 px-5 py-5">
        <EmptyState
          icon="pencil"
          title="No player profile yet"
          body="Tell your coach about your pickleball background and goals so your lessons can be tailored to you."
          cta={{ label: "Start your profile", onClick: beginEdit }}
        />
      </section>
    );
  }

  return (
    <section className="rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white/80 dark:bg-slate-900/60 px-5 py-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Your player profile
        </h3>
        <button
          type="button"
          onClick={beginEdit}
          className="min-h-[40px] rounded-lg px-3 py-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
        >
          Edit
        </button>
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
        <ReadField label="Date of birth" value={fmtDate(profile.dob)} />
        <ReadField
          label="Years played"
          value={
            profile.years_played == null ? null : String(profile.years_played)
          }
        />
        <ReadField label="Goal" value={goalLabel(profile.goal)} />
        <ReadField
          label="Dominant hand"
          value={handLabel(profile.dominant_hand)}
        />
        <ReadField label="Skill level" value={profile.skill_level} />
        <ReadField
          label="DUPR"
          value={profile.dupr == null ? null : String(profile.dupr)}
        />
        <ReadField label="Start date" value={fmtDate(profile.start_date)} />
        <ReadField label="Referred by" value={profile.referred_by} />
        <div className="sm:col-span-2">
          <ReadField
            label="Sports background"
            value={profile.sports_background}
          />
        </div>
        <div className="sm:col-span-2">
          <ReadField label="Goal notes" value={profile.goal_notes} />
        </div>
        <ReadField label="Contact" value={profile.contact} />
        <ReadField
          label="Emergency contact"
          value={profile.emergency_contact}
        />
      </dl>
    </section>
  );
}
