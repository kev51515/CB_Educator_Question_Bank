/**
 * CoachProfileCard — a pickleball COACH (a student-role enrollee) views + edits
 * their OWN intake/bio profile for a course, and sees their (read-only)
 * certifications. The viewer is the signed-in student; `studentId` is their
 * `profiles.id` (== auth.uid()). Profile writes go through
 * `pk_upsert_coach_profile` with p_coach_id = self, which the RPC + RLS both
 * permit for the owning coach (migration 0153). Certifications are
 * educator-minted; the coach reads them via the "coach reads own" RLS policy
 * but cannot edit them here.
 *
 * Read path: SELECT both rows directly (RLS self-read policies). If no profile
 * row exists yet the card shows an empty state with a CTA to start it.
 *
 * UX: read mode shows a tidy field grid; an inline "Edit" affordance flips to a
 * form (no modal). Save is optimistic — we reconcile the returned row. Skeleton
 * on load, toast for feedback, no inline error text, no emoji.
 *
 * Prop contract (Foundation stub):
 *   export function CoachProfileCard({ courseId, studentId })  // studentId = self
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components";
import { SkeletonRows } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";

export interface CoachProfile {
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
  created_at: string;
}

interface Certification {
  id: string;
  name: string;
  issuing_body: string | null;
  level: string | null;
  earned_on: string | null;
  expires_on: string | null;
  cert_no: string | null;
  file_url: string | null;
}

interface Draft {
  dob: string;
  years_played: string;
  sports_background: string;
  referred_by: string;
  contact: string;
  emergency_contact: string;
  bio: string;
}

function emptyDraft(): Draft {
  return {
    dob: "",
    years_played: "",
    sports_background: "",
    referred_by: "",
    contact: "",
    emergency_contact: "",
    bio: "",
  };
}

function draftFromProfile(p: CoachProfile): Draft {
  return {
    dob: p.dob ?? "",
    years_played: p.years_played == null ? "" : String(p.years_played),
    sports_background: p.sports_background ?? "",
    referred_by: p.referred_by ?? "",
    contact: p.contact ?? "",
    emergency_contact: p.emergency_contact ?? "",
    bio: p.bio ?? "",
  };
}

function upsertArgs(d: Draft): Record<string, string | number | null> {
  const str = (v: string): string | null => (v.trim() === "" ? null : v.trim());
  const yearsRaw = d.years_played.trim();
  const years =
    yearsRaw === "" ? null : Number.isFinite(Number(yearsRaw)) ? Number(yearsRaw) : null;
  return {
    p_dob: str(d.dob),
    p_years_played: years,
    p_sports_background: str(d.sports_background),
    p_referred_by: str(d.referred_by),
    p_contact: str(d.contact),
    p_emergency_contact: str(d.emergency_contact),
    p_bio: str(d.bio),
  };
}

function rpcError(code: string): string {
  switch (code) {
    case "not_authorized":
      return "You can only edit your own profile.";
    case "not_authenticated":
      return "Your session expired — sign in again.";
    case "invalid_input":
      return "Something looks off — check the fields and try again.";
    default:
      return "Could not save your profile.";
  }
}

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

type ExpiryState = "ok" | "soon" | "expired" | "none";
function expiryState(expiresOn: string | null): ExpiryState {
  if (!expiresOn) return "none";
  const exp = new Date(`${expiresOn}T00:00:00`);
  if (Number.isNaN(exp.getTime())) return "none";
  const days = Math.ceil((exp.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return "expired";
  if (days <= 60) return "soon";
  return "ok";
}

const inputCls =
  "w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[40px]";
const labelCls = "block text-xs text-slate-500 dark:text-slate-400 mb-1";

function ReadField({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}): React.ReactElement {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </dt>
      <dd className="mt-0.5 whitespace-pre-wrap break-words text-sm text-slate-900 dark:text-slate-100">
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
}): React.ReactElement {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]): void => {
    onChange({ ...draft, [key]: value });
  };
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label htmlFor="pk-coach-dob" className={labelCls}>
          Date of birth
        </label>
        <input
          id="pk-coach-dob"
          type="date"
          value={draft.dob}
          onChange={(e) => set("dob", e.target.value)}
          className={inputCls}
        />
      </div>
      <div>
        <label htmlFor="pk-coach-years" className={labelCls}>
          Years played
        </label>
        <input
          id="pk-coach-years"
          type="number"
          min={0}
          step="0.5"
          inputMode="decimal"
          value={draft.years_played}
          onChange={(e) => set("years_played", e.target.value)}
          placeholder="e.g. 5"
          className={inputCls}
        />
      </div>
      <div>
        <label htmlFor="pk-coach-contact" className={labelCls}>
          Contact
        </label>
        <input
          id="pk-coach-contact"
          type="text"
          value={draft.contact}
          onChange={(e) => set("contact", e.target.value)}
          placeholder="Phone or email"
          className={inputCls}
        />
      </div>
      <div>
        <label htmlFor="pk-coach-emergency" className={labelCls}>
          Emergency contact
        </label>
        <input
          id="pk-coach-emergency"
          type="text"
          value={draft.emergency_contact}
          onChange={(e) => set("emergency_contact", e.target.value)}
          placeholder="Name + phone"
          className={inputCls}
        />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="pk-coach-referred" className={labelCls}>
          Referred by
        </label>
        <input
          id="pk-coach-referred"
          type="text"
          value={draft.referred_by}
          onChange={(e) => set("referred_by", e.target.value)}
          className={inputCls}
        />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="pk-coach-sports" className={labelCls}>
          Sports background
        </label>
        <textarea
          id="pk-coach-sports"
          value={draft.sports_background}
          onChange={(e) => set("sports_background", e.target.value)}
          rows={2}
          placeholder="Prior sports, level, achievements"
          className={`${inputCls} min-h-[60px] resize-y`}
        />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="pk-coach-bio" className={labelCls}>
          Bio
        </label>
        <textarea
          id="pk-coach-bio"
          value={draft.bio}
          onChange={(e) => set("bio", e.target.value)}
          rows={3}
          placeholder="A short coaching bio"
          className={`${inputCls} min-h-[72px] resize-y`}
        />
      </div>
    </div>
  );
}

function CertExpiryBadge({
  expiresOn,
}: {
  expiresOn: string | null;
}): React.ReactElement | null {
  const state = expiryState(expiresOn);
  if (state === "none") return null;
  const cls =
    state === "expired"
      ? "bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300"
      : state === "soon"
        ? "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300"
        : "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  const label =
    state === "expired"
      ? `Expired · ${expiresOn}`
      : state === "soon"
        ? `Expiring soon · ${expiresOn}`
        : `Valid · expires ${expiresOn}`;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}
    >
      {label}
    </span>
  );
}

export function CoachProfileCard({
  courseId,
  studentId,
}: {
  courseId: string;
  studentId: string;
}): React.ReactElement {
  const toast = useToast();
  const aliveRef = useRef(true);

  const [profile, setProfile] = useState<CoachProfile | null>(null);
  const [certs, setCerts] = useState<Certification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setLoadError(null);
    try {
      const [profileRes, certRes] = await Promise.all([
        supabase
          .from("pickleball_coach_profiles")
          .select(
            "id, course_id, coach_id, dob, years_played, sports_background, referred_by, contact, emergency_contact, bio, updated_at, created_at",
          )
          .eq("course_id", courseId)
          .eq("coach_id", studentId)
          .maybeSingle(),
        supabase
          .from("pickleball_certifications")
          .select(
            "id, name, issuing_body, level, earned_on, expires_on, cert_no, file_url",
          )
          .eq("course_id", courseId)
          .eq("coach_id", studentId)
          .order("earned_on", { ascending: false, nullsFirst: false }),
      ]);
      if (!aliveRef.current) return;
      if (profileRes.error) {
        setLoadError(profileRes.error.message);
        setProfile(null);
      } else {
        setProfile((profileRes.data as CoachProfile | null) ?? null);
      }
      if (!certRes.error) {
        setCerts((certRes.data ?? []) as Certification[]);
      }
    } catch {
      if (aliveRef.current) setLoadError("Could not load your coach profile.");
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [courseId, studentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const startEdit = useCallback((): void => {
    setDraft(profile ? draftFromProfile(profile) : emptyDraft());
    setEditing(true);
  }, [profile]);

  const save = useCallback(async (): Promise<void> => {
    const yearsRaw = draft.years_played.trim();
    if (yearsRaw !== "" && (!Number.isFinite(Number(yearsRaw)) || Number(yearsRaw) < 0)) {
      toast.error("Years played must be a non-negative number.");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("pk_upsert_coach_profile", {
        p_course_id: courseId,
        p_coach_id: studentId,
        ...upsertArgs(draft),
      });
      if (!aliveRef.current) return;
      if (error) {
        toast.error(rpcError(error.message));
        return;
      }
      setProfile(data as CoachProfile);
      setEditing(false);
      toast.success("Profile saved.");
    } catch {
      if (aliveRef.current) toast.error("Could not save your profile.");
    } finally {
      if (aliveRef.current) setSaving(false);
    }
  }, [courseId, studentId, draft, toast]);

  if (loading) {
    return (
      <div className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 p-6">
        <SkeletonRows count={4} rowClassName="h-12" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-2xl bg-rose-50 dark:bg-rose-500/10 ring-1 ring-rose-200 dark:ring-rose-500/30 p-6 text-sm text-rose-700 dark:text-rose-300">
        {loadError}
      </div>
    );
  }

  // No profile yet, and not currently editing → empty state with a CTA.
  if (!profile && !editing) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 p-2">
          <EmptyState
            icon="pencil"
            title="Start your coach profile"
            body="Add your background, contact, and a short bio so your program lead has what they need."
            cta={{ label: "Add profile", onClick: startEdit }}
          />
        </div>
        <CertSection certs={certs} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 p-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            My coach profile
          </h2>
          {!editing && (
            <button
              type="button"
              onClick={startEdit}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
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
              Edit
            </button>
          )}
        </div>

        {editing ? (
          <div className="space-y-4">
            <ProfileForm draft={draft} onChange={setDraft} />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="inline-flex min-h-[40px] items-center rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={saving}
                className="inline-flex min-h-[40px] items-center rounded-lg px-4 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            <ReadField label="Date of birth" value={fmtDate(profile!.dob)} />
            <ReadField
              label="Years played"
              value={
                profile!.years_played == null
                  ? "—"
                  : String(profile!.years_played)
              }
            />
            <ReadField label="Contact" value={profile!.contact} />
            <ReadField
              label="Emergency contact"
              value={profile!.emergency_contact}
            />
            <ReadField label="Referred by" value={profile!.referred_by} />
            <div className="sm:col-span-2">
              <ReadField
                label="Sports background"
                value={profile!.sports_background}
              />
            </div>
            <div className="sm:col-span-2">
              <ReadField label="Bio" value={profile!.bio} />
            </div>
          </dl>
        )}
      </div>

      <CertSection certs={certs} />
    </div>
  );
}

function CertSection({ certs }: { certs: Certification[] }): React.ReactElement {
  return (
    <div className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 p-6">
      <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
        My certifications
      </h2>
      {certs.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No certifications recorded yet. Your program lead adds these as you
          earn them.
        </p>
      ) : (
        <ul className="space-y-2">
          {certs.map((cert) => (
            <li
              key={cert.id}
              className="rounded-lg bg-slate-50 dark:bg-slate-800/40 px-3 py-2.5 ring-1 ring-slate-200 dark:ring-slate-800"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {cert.name}
                </span>
                {cert.level && (
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {cert.level}
                  </span>
                )}
                <CertExpiryBadge expiresOn={cert.expires_on} />
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {[
                  cert.issuing_body,
                  cert.cert_no ? `No. ${cert.cert_no}` : null,
                  cert.earned_on ? `earned ${cert.earned_on}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {cert.file_url && (
                <a
                  href={cert.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-300 hover:underline"
                >
                  <svg
                    width={13}
                    height={13}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  View certificate
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
