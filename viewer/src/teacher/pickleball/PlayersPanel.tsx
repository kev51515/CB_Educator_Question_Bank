/**
 * PlayersPanel — teacher roster of player intake profiles for a pickleball
 * (player track) course. Lists every enrolled student joined against their
 * `pickleball_player_profiles` row (one per course+student). The educator can:
 *   - expand a player to inline-edit their profile fields (goal + hand as
 *     selects), saved via `pk_upsert_player_profile`,
 *   - remove a player's profile via `pk_delete_player_profile` (ConfirmDialog).
 *
 * Roster comes from `course_memberships → profiles` (same join the rest of the
 * teacher surfaces use). Profiles are fetched in one query keyed by course and
 * indexed by student_id, so a row that has no profile yet renders an inline
 * "Add profile" affordance rather than being hidden.
 *
 * Skeleton load, empty state with CTA, toast feedback, optimistic local update.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Combobox, useToast } from "@/components";
import { SkeletonRows } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmDialog } from "../ConfirmDialog";

type PlayerGoal = "fun" | "fitness" | "competition" | "skill";
type DominantHand = "left" | "right";

interface PlayerProfile {
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

interface RosterRow {
  student_id: string;
  display_name: string | null;
  email: string;
}

interface MembershipRow {
  student_id: string;
  student: {
    display_name: string | null;
    email: string;
  } | null;
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

const inputCls =
  "w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500";

function ProfileForm({
  draft,
  onChange,
  idPrefix,
}: {
  draft: Draft;
  onChange: (next: Draft) => void;
  idPrefix: string;
}) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]): void => {
    onChange({ ...draft, [key]: value });
  };
  const labelCls = "block text-xs text-slate-500 dark:text-slate-400 mb-1";
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label htmlFor={`${idPrefix}-dob`} className={labelCls}>
          Date of birth
        </label>
        <input
          id={`${idPrefix}-dob`}
          type="date"
          value={draft.dob}
          onChange={(e) => set("dob", e.target.value)}
          className={`${inputCls} min-h-[40px]`}
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-years`} className={labelCls}>
          Years played
        </label>
        <input
          id={`${idPrefix}-years`}
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
        <label htmlFor={`${idPrefix}-goal`} className={labelCls}>
          Goal
        </label>
        <Combobox
          id={`${idPrefix}-goal`}
          ariaLabel="Goal"
          value={draft.goal === "" ? null : draft.goal}
          onChange={(v) => set("goal", v)}
          options={GOAL_OPTIONS.map((g) => ({ value: g, label: goalLabel(g) }))}
          placeholder="Not set"
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-hand`} className={labelCls}>
          Dominant hand
        </label>
        <Combobox
          id={`${idPrefix}-hand`}
          ariaLabel="Dominant hand"
          value={draft.dominant_hand === "" ? null : draft.dominant_hand}
          onChange={(v) => set("dominant_hand", v)}
          options={HAND_OPTIONS.map((h) => ({ value: h, label: handLabel(h) }))}
          placeholder="Not set"
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-skill`} className={labelCls}>
          Skill level
        </label>
        <input
          id={`${idPrefix}-skill`}
          type="text"
          value={draft.skill_level}
          onChange={(e) => set("skill_level", e.target.value)}
          placeholder="e.g. Beginner / 3.0"
          className={`${inputCls} min-h-[40px]`}
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-dupr`} className={labelCls}>
          DUPR
        </label>
        <input
          id={`${idPrefix}-dupr`}
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
        <label htmlFor={`${idPrefix}-start`} className={labelCls}>
          Start date
        </label>
        <input
          id={`${idPrefix}-start`}
          type="date"
          value={draft.start_date}
          onChange={(e) => set("start_date", e.target.value)}
          className={`${inputCls} min-h-[40px]`}
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-referred`} className={labelCls}>
          Referred by
        </label>
        <input
          id={`${idPrefix}-referred`}
          type="text"
          value={draft.referred_by}
          onChange={(e) => set("referred_by", e.target.value)}
          placeholder="Referral source"
          className={`${inputCls} min-h-[40px]`}
        />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`${idPrefix}-sports`} className={labelCls}>
          Sports background
        </label>
        <textarea
          id={`${idPrefix}-sports`}
          value={draft.sports_background}
          onChange={(e) => set("sports_background", e.target.value)}
          rows={2}
          placeholder="Other racquet / paddle / athletic experience"
          className={inputCls}
        />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`${idPrefix}-goalnotes`} className={labelCls}>
          Goal notes
        </label>
        <textarea
          id={`${idPrefix}-goalnotes`}
          value={draft.goal_notes}
          onChange={(e) => set("goal_notes", e.target.value)}
          rows={2}
          placeholder="Coaching focus for this player"
          className={inputCls}
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-contact`} className={labelCls}>
          Contact
        </label>
        <input
          id={`${idPrefix}-contact`}
          type="text"
          value={draft.contact}
          onChange={(e) => set("contact", e.target.value)}
          placeholder="Phone or email"
          className={`${inputCls} min-h-[40px]`}
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-emergency`} className={labelCls}>
          Emergency contact
        </label>
        <input
          id={`${idPrefix}-emergency`}
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

function ProfileSummary({ profile }: { profile: PlayerProfile }) {
  const chips: string[] = [];
  if (profile.goal) chips.push(goalLabel(profile.goal));
  if (profile.skill_level) chips.push(profile.skill_level);
  if (profile.dupr != null) chips.push(`DUPR ${profile.dupr}`);
  if (profile.dominant_hand) chips.push(`${handLabel(profile.dominant_hand)} hand`);
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <span
          key={c}
          className="inline-flex items-center rounded-full bg-indigo-50 dark:bg-indigo-950/40 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:text-indigo-300"
        >
          {c}
        </span>
      ))}
    </div>
  );
}

export function PlayersPanel({ courseId }: { courseId: string }) {
  const toast = useToast();
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, PlayerProfile>>({});
  const [loading, setLoading] = useState(true);

  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{
    profile: PlayerProfile;
    name: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    const [rosterRes, profilesRes] = await Promise.all([
      supabase
        .from("course_memberships")
        .select(
          "student_id, student:profiles!course_memberships_student_id_fkey(display_name, email)",
        )
        .eq("course_id", courseId)
        .order("joined_at", { ascending: true }),
      supabase
        .from("pickleball_player_profiles")
        .select("*")
        .eq("course_id", courseId),
    ]);
    if (!aliveRef.current) return;

    if (rosterRes.error) {
      toast.error("Couldn't load players", rosterRes.error.message);
      setRoster([]);
    } else {
      const rows = (rosterRes.data ?? []) as unknown as MembershipRow[];
      setRoster(
        rows.map((r) => ({
          student_id: r.student_id,
          display_name: r.student?.display_name ?? null,
          email: r.student?.email ?? "",
        })),
      );
    }

    if (profilesRes.error) {
      setProfiles({});
    } else {
      const map: Record<string, PlayerProfile> = {};
      for (const p of (profilesRes.data ?? []) as PlayerProfile[]) {
        map[p.student_id] = p;
      }
      setProfiles(map);
    }
    setLoading(false);
  }, [courseId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const beginEdit = (studentId: string): void => {
    const existing = profiles[studentId];
    setDraft(existing ? draftFromProfile(existing) : emptyDraft());
    setOpenId(studentId);
  };

  const onSave = async (studentId: string): Promise<void> => {
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
      toast.error("Couldn't save profile", error.message);
      return;
    }
    const row = (Array.isArray(data) ? data[0] : data) as PlayerProfile | null;
    if (row) {
      setProfiles((prev) => ({ ...prev, [studentId]: row }));
    }
    setOpenId(null);
    toast.success("Profile saved");
  };

  const onConfirmDelete = async (): Promise<void> => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    const { error } = await supabase.rpc("pk_delete_player_profile", {
      p_id: pendingDelete.profile.id,
    });
    if (!aliveRef.current) return;
    setDeleting(false);
    if (error) {
      toast.error("Couldn't remove profile", error.message);
      return;
    }
    const removedStudent = pendingDelete.profile.student_id;
    setProfiles((prev) => {
      const next = { ...prev };
      delete next[removedStudent];
      return next;
    });
    if (openId === removedStudent) setOpenId(null);
    setPendingDelete(null);
    toast.success("Profile removed");
  };

  const nameOf = (r: RosterRow): string =>
    r.display_name?.trim() || r.email || "Player";

  return (
    <section className="rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white/80 dark:bg-slate-900/60 px-5 py-5 space-y-4">
      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
        Players
      </h3>

      {loading ? (
        <SkeletonRows count={4} />
      ) : roster.length === 0 ? (
        <EmptyState
          icon="inbox"
          title="No players enrolled yet"
          body="Add players to this course from the People tab, then capture each player's intake profile here."
        />
      ) : (
        <ul className="space-y-3">
          {roster.map((r) => {
            const profile = profiles[r.student_id];
            const isOpen = openId === r.student_id;
            const name = nameOf(r);
            return (
              <li
                key={r.student_id}
                className="rounded-xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1.5">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {name}
                    </p>
                    {r.email && r.display_name && (
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {r.email}
                      </p>
                    )}
                    {profile ? (
                      <ProfileSummary profile={profile} />
                    ) : (
                      <p className="text-xs italic text-slate-400 dark:text-slate-500">
                        No profile yet.
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        isOpen ? setOpenId(null) : beginEdit(r.student_id)
                      }
                      className="min-h-[40px] rounded-md px-2.5 py-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                    >
                      {isOpen ? "Close" : profile ? "Edit" : "Add profile"}
                    </button>
                    {profile && (
                      <button
                        type="button"
                        onClick={() =>
                          setPendingDelete({ profile, name })
                        }
                        className="min-h-[40px] rounded-md ring-1 ring-rose-300 dark:ring-rose-800 bg-rose-50 dark:bg-rose-950/40 px-2.5 py-1 text-xs font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/40"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>

                {isOpen && (
                  <div className="space-y-3 border-t border-slate-200 dark:border-slate-800 pt-3">
                    <ProfileForm
                      draft={draft}
                      onChange={setDraft}
                      idPrefix={`pk-player-${r.student_id}`}
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setOpenId(null)}
                        className="min-h-[40px] rounded-lg px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void onSave(r.student_id);
                        }}
                        disabled={saving}
                        className="min-h-[40px] rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {saving ? "Saving…" : "Save profile"}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Remove player profile"
          body={
            <>
              Remove the intake profile for{" "}
              <span className="font-semibold">{pendingDelete.name}</span>? This
              can't be undone (the player stays enrolled).
            </>
          }
          confirmLabel="Remove"
          destructive
          busy={deleting}
          onConfirm={() => {
            void onConfirmDelete();
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </section>
  );
}
