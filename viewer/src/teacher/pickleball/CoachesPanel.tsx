/**
 * CoachesPanel — Pickleball COACH-track teacher panel.
 *
 * A roster of coach intake/bio profiles (migration 0153). Each enrolled coach
 * (a student-role member of a `pickleball_coach` course) gets one editable
 * card backed by pickleball_coach_profiles. The educator edits inline and
 * persists through pk_upsert_coach_profile.
 *
 * Prop contract (Foundation stub): export function CoachesPanel({ courseId })
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast, SkeletonRows } from "@/components";
import { useClassRoster, type RosterStudent } from "@/teacher/useClassRoster";

interface CoachProfileRow {
  id: string;
  course_id: string;
  coach_id: string;
  dob: string | null;
  years_played: number | null;
  sports_background: string | null;
  referred_by: string | null;
  contact: string | null;
  emergency_contact: string | null;
  bio: string | null;
  updated_at: string;
}

/** The editable shape of one coach profile (string-form for inputs). */
interface DraftFields {
  dob: string;
  years_played: string;
  sports_background: string;
  referred_by: string;
  contact: string;
  emergency_contact: string;
  bio: string;
}

function rowToDraft(row: CoachProfileRow | undefined): DraftFields {
  return {
    dob: row?.dob ?? "",
    years_played:
      row?.years_played === null || row?.years_played === undefined
        ? ""
        : String(row.years_played),
    sports_background: row?.sports_background ?? "",
    referred_by: row?.referred_by ?? "",
    contact: row?.contact ?? "",
    emergency_contact: row?.emergency_contact ?? "",
    bio: row?.bio ?? "",
  };
}

function rpcError(code: string): string {
  switch (code) {
    case "not_authorized":
      return "You don't have permission to edit this coach.";
    case "not_authenticated":
      return "Your session expired — sign in again.";
    case "invalid_input":
      return "Something looks off — check the fields and try again.";
    default:
      return "Could not save the coach profile.";
  }
}

function initials(name: string | null, email: string): string {
  const base = (name ?? email ?? "").trim();
  if (!base) return "?";
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

const FIELD_INPUT =
  "w-full min-h-[44px] rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 ring-1 ring-slate-300 dark:ring-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 placeholder:text-slate-400 dark:placeholder:text-slate-600";
const FIELD_LABEL =
  "block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1";

function CoachRow({
  courseId,
  coach,
  row,
  onSaved,
}: {
  courseId: string;
  coach: RosterStudent;
  row: CoachProfileRow | undefined;
  onSaved: (saved: CoachProfileRow) => void;
}): React.ReactElement {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<DraftFields>(() => rowToDraft(row));

  // Keep the draft in sync if the underlying row changes while collapsed.
  useEffect(() => {
    if (!editing) setDraft(rowToDraft(row));
  }, [row, editing]);

  const name = coach.display_name ?? coach.email;

  const set = (k: keyof DraftFields, v: string): void =>
    setDraft((d) => ({ ...d, [k]: v }));

  const save = useCallback(async (): Promise<void> => {
    setBusy(true);
    const yearsRaw = draft.years_played.trim();
    const yearsNum = yearsRaw === "" ? null : Number(yearsRaw);
    if (yearsNum !== null && (Number.isNaN(yearsNum) || yearsNum < 0)) {
      toast.error("Years played must be a non-negative number.");
      setBusy(false);
      return;
    }
    try {
      const { data, error } = await supabase.rpc("pk_upsert_coach_profile", {
        p_course_id: courseId,
        p_coach_id: coach.student_id,
        p_dob: draft.dob.trim() === "" ? null : draft.dob,
        p_years_played: yearsNum,
        p_sports_background:
          draft.sports_background.trim() === ""
            ? null
            : draft.sports_background.trim(),
        p_referred_by:
          draft.referred_by.trim() === "" ? null : draft.referred_by.trim(),
        p_contact: draft.contact.trim() === "" ? null : draft.contact.trim(),
        p_emergency_contact:
          draft.emergency_contact.trim() === ""
            ? null
            : draft.emergency_contact.trim(),
        p_bio: draft.bio.trim() === "" ? null : draft.bio.trim(),
      });
      if (error) {
        toast.error(rpcError(error.message));
        return;
      }
      onSaved(data as CoachProfileRow);
      setEditing(false);
      toast.success(`Saved ${name}'s profile.`);
    } catch {
      toast.error("Could not save the coach profile.");
    } finally {
      setBusy(false);
    }
  }, [courseId, coach.student_id, draft, name, onSaved, toast]);

  const hasProfile = Boolean(row);

  return (
    <div className="group rounded-xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 p-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-sm font-semibold text-indigo-700 dark:text-indigo-300"
        >
          {initials(coach.display_name, coach.email)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                {name}
              </p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                {coach.email}
                {!hasProfile && !editing ? " · no profile yet" : ""}
              </p>
            </div>
            {!editing && (
              <button
                type="button"
                onClick={() => {
                  setDraft(rowToDraft(row));
                  setEditing(true);
                }}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-indigo-600 dark:text-indigo-300 opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
              >
                <svg
                  width={15}
                  height={15}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
                {hasProfile ? "Edit" : "Add profile"}
              </button>
            )}
          </div>

          {!editing && hasProfile && (
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
              {row?.years_played !== null &&
                row?.years_played !== undefined && (
                  <ReadField label="Years played" value={String(row.years_played)} />
                )}
              {row?.dob && <ReadField label="Date of birth" value={row.dob} />}
              {row?.contact && <ReadField label="Contact" value={row.contact} />}
              {row?.referred_by && (
                <ReadField label="Referred by" value={row.referred_by} />
              )}
              {row?.emergency_contact && (
                <ReadField label="Emergency" value={row.emergency_contact} />
              )}
              {row?.sports_background && (
                <ReadField
                  label="Sports background"
                  value={row.sports_background}
                  wide
                />
              )}
              {row?.bio && <ReadField label="Bio" value={row.bio} wide />}
            </dl>
          )}

          {editing && (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={FIELD_LABEL}>Date of birth</label>
                  <input
                    type="date"
                    value={draft.dob}
                    onChange={(e) => set("dob", e.target.value)}
                    className={FIELD_INPUT}
                  />
                </div>
                <div>
                  <label className={FIELD_LABEL}>Years played</label>
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    inputMode="decimal"
                    value={draft.years_played}
                    onChange={(e) => set("years_played", e.target.value)}
                    placeholder="e.g. 3"
                    className={FIELD_INPUT}
                  />
                </div>
                <div>
                  <label className={FIELD_LABEL}>Contact</label>
                  <input
                    type="text"
                    value={draft.contact}
                    onChange={(e) => set("contact", e.target.value)}
                    placeholder="Phone or email"
                    className={FIELD_INPUT}
                  />
                </div>
                <div>
                  <label className={FIELD_LABEL}>Emergency contact</label>
                  <input
                    type="text"
                    value={draft.emergency_contact}
                    onChange={(e) => set("emergency_contact", e.target.value)}
                    placeholder="Name + phone"
                    className={FIELD_INPUT}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={FIELD_LABEL}>Referred by</label>
                  <input
                    type="text"
                    value={draft.referred_by}
                    onChange={(e) => set("referred_by", e.target.value)}
                    className={FIELD_INPUT}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={FIELD_LABEL}>Sports background</label>
                  <textarea
                    value={draft.sports_background}
                    onChange={(e) => set("sports_background", e.target.value)}
                    rows={2}
                    placeholder="Prior sports, level, achievements"
                    className={`${FIELD_INPUT} min-h-[60px] resize-y`}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={FIELD_LABEL}>Bio</label>
                  <textarea
                    value={draft.bio}
                    onChange={(e) => set("bio", e.target.value)}
                    rows={3}
                    placeholder="A short coaching bio"
                    className={`${FIELD_INPUT} min-h-[72px] resize-y`}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={busy}
                  className="inline-flex min-h-[40px] items-center rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {busy ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setDraft(rowToDraft(row));
                  }}
                  disabled={busy}
                  className="inline-flex min-h-[40px] items-center rounded-lg px-4 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ReadField({
  label,
  value,
  wide,
}: {
  label: string;
  value: string;
  wide?: boolean;
}): React.ReactElement {
  return (
    <div className={wide ? "col-span-2 sm:col-span-3" : undefined}>
      <dt className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </dt>
      <dd className="text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words">
        {value}
      </dd>
    </div>
  );
}

export function CoachesPanel({ courseId }: { courseId: string }): React.ReactElement {
  const { roster, loading: rosterLoading, error: rosterError } =
    useClassRoster(courseId);
  const [profiles, setProfiles] = useState<CoachProfileRow[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadProfiles = useCallback(async (): Promise<void> => {
    setProfilesLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from("pickleball_coach_profiles")
        .select(
          "id, course_id, coach_id, dob, years_played, sports_background, referred_by, contact, emergency_contact, bio, updated_at",
        )
        .eq("course_id", courseId);
      if (error) {
        setLoadError(error.message);
        setProfiles([]);
        return;
      }
      setProfiles((data ?? []) as CoachProfileRow[]);
    } catch {
      setLoadError("Could not load coach profiles.");
      setProfiles([]);
    } finally {
      setProfilesLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  const byCoach = useMemo(() => {
    const m = new Map<string, CoachProfileRow>();
    for (const p of profiles) m.set(p.coach_id, p);
    return m;
  }, [profiles]);

  const handleSaved = useCallback((saved: CoachProfileRow): void => {
    setProfiles((prev) => {
      const next = prev.filter((p) => p.coach_id !== saved.coach_id);
      next.push(saved);
      return next;
    });
  }, []);

  const loading = rosterLoading || profilesLoading;

  if (loading) {
    return (
      <div className="space-y-3">
        <SkeletonRows count={4} rowClassName="h-20" />
      </div>
    );
  }

  if (rosterError || loadError) {
    return (
      <div className="rounded-2xl bg-rose-50 dark:bg-rose-500/10 ring-1 ring-rose-200 dark:ring-rose-500/30 p-6 text-sm text-rose-700 dark:text-rose-300">
        {rosterError ?? loadError}
      </div>
    );
  }

  if (roster.length === 0) {
    return (
      <div className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 p-10 text-center">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
          No coaches enrolled yet
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Add coaches from the course roster (People), then their intake
          profiles will appear here to fill in.
        </p>
      </div>
    );
  }

  const withProfile = roster.filter((c) => byCoach.has(c.student_id)).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Coach profiles
        </h2>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {withProfile} of {roster.length} completed
        </span>
      </div>
      {roster.map((coach) => (
        <CoachRow
          key={coach.student_id}
          courseId={courseId}
          coach={coach}
          row={byCoach.get(coach.student_id)}
          onSaved={handleSaved}
        />
      ))}
    </div>
  );
}
