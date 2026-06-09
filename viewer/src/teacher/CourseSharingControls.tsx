/**
 * CourseSharingControls
 * =====================
 * The inner controls for the "Sharing" card on CourseSettings. Lets the course
 * OWNER (or an admin) grant another educator full co-management of the course
 * (see migration 0130: `course_shares` + the `share_course` / `unshare_course`
 * RPCs; a recipient passes every `is_teacher_of_course` check). Non-owners who
 * can edit the course (a shared co-teacher) see a read-only note instead of the
 * grant controls — only the owner may re-share.
 *
 * Data:
 *   - the course's `teacher_id` (to decide owner vs co-teacher),
 *   - current shares (course_shares → recipient profiles),
 *   - the pool of educators to share with (teacher-role profiles; staff can
 *     read all profiles via RLS), filtered by a typeahead.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components";
import { useProfile } from "@/lib/profile";

interface Educator {
  id: string;
  display_name: string | null;
  email: string;
}

interface Props {
  courseId: string;
}

function labelFor(e: Educator): string {
  return e.display_name?.trim() || e.email;
}

function shareErrorMessage(raw: string): string {
  if (raw.includes("not_authorized")) return "Only the course owner can share it.";
  if (raw.includes("recipient_not_educator")) return "That account isn't an educator.";
  if (raw.includes("cannot_share_with_owner")) return "They already own this course.";
  if (raw.includes("recipient_not_found")) return "Couldn't find that educator.";
  return raw;
}

export function CourseSharingControls({ courseId }: Props) {
  const { profile } = useProfile();
  const toast = useToast();
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [shares, setShares] = useState<Educator[]>([]);
  const [educators, setEducators] = useState<Educator[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    // Owner of the course.
    const { data: courseRow } = await supabase
      .from("courses")
      .select("teacher_id")
      .eq("id", courseId)
      .maybeSingle();
    // Existing shares (recipient ids) → resolve to profiles.
    const { data: shareRows } = await supabase
      .from("course_shares")
      .select("recipient_id")
      .eq("course_id", courseId);
    const recipientIds = (shareRows ?? []).map((r) => (r as { recipient_id: string }).recipient_id);
    // The educator pool (teacher-role profiles).
    const { data: eduRows } = await supabase
      .from("profiles")
      .select("id, display_name, email")
      .eq("role", "teacher")
      .order("display_name", { ascending: true });

    if (!aliveRef.current) return;
    const owner = (courseRow as { teacher_id: string } | null)?.teacher_id ?? null;
    const allEdu = (eduRows ?? []) as Educator[];
    const byId = new Map(allEdu.map((e) => [e.id, e]));
    setOwnerId(owner);
    setEducators(allEdu);
    setShares(recipientIds.map((id) => byId.get(id)).filter((e): e is Educator => !!e));
    setLoading(false);
  }, [courseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const isOwner = !!profile && profile.id === ownerId;
  const isAdmin = profile?.role === "admin";
  const canShare = isOwner || isAdmin;

  const sharedIds = useMemo(() => new Set(shares.map((s) => s.id)), [shares]);

  // Candidates: educators who aren't the owner, aren't me, and aren't already
  // shared — filtered by the typeahead.
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return educators.filter((e) => {
      if (e.id === ownerId) return false;
      if (e.id === profile?.id) return false;
      if (sharedIds.has(e.id)) return false;
      if (!q) return true;
      return (
        (e.display_name?.toLowerCase().includes(q) ?? false) ||
        e.email.toLowerCase().includes(q)
      );
    });
  }, [educators, ownerId, profile?.id, sharedIds, query]);

  const onShare = async (recipient: Educator): Promise<void> => {
    setBusyId(recipient.id);
    const { error } = await supabase.rpc("share_course", {
      p_course_id: courseId,
      p_recipient_id: recipient.id,
    });
    if (!aliveRef.current) return;
    setBusyId(null);
    if (error) {
      toast.error("Couldn't share course", shareErrorMessage(error.message));
      return;
    }
    setQuery("");
    toast.success(`Shared with ${labelFor(recipient)}`);
    void load();
  };

  const onUnshare = async (recipient: Educator): Promise<void> => {
    setBusyId(recipient.id);
    const { error } = await supabase.rpc("unshare_course", {
      p_course_id: courseId,
      p_recipient_id: recipient.id,
    });
    if (!aliveRef.current) return;
    setBusyId(null);
    if (error) {
      toast.error("Couldn't remove access", shareErrorMessage(error.message));
      return;
    }
    toast.success(`Removed ${labelFor(recipient)}`);
    void load();
  };

  if (loading) {
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400">Loading sharing…</p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Current shares */}
      {shares.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Not shared with anyone yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {shares.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-3 rounded-lg ring-1 ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                  {labelFor(s)}
                </p>
                {s.display_name && (
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {s.email}
                  </p>
                )}
              </div>
              {canShare && (
                <button
                  type="button"
                  disabled={busyId === s.id}
                  onClick={() => {
                    void onUnshare(s);
                  }}
                  className="shrink-0 rounded-md ring-1 ring-rose-300 dark:ring-rose-800 bg-rose-50 dark:bg-rose-950/40 px-2.5 py-1 text-xs font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/40 disabled:opacity-50"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Grant control (owner / admin only) */}
      {canShare ? (
        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Share with an educator
          </label>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search educators by name or email…"
            aria-label="Search educators to share with"
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {query.trim() && (
            <div className="max-h-56 overflow-auto rounded-lg ring-1 ring-slate-200 dark:ring-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
              {candidates.length === 0 ? (
                <p className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                  No matching educators.
                </p>
              ) : (
                candidates.slice(0, 8).map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    disabled={busyId === e.id}
                    onClick={() => {
                      void onShare(e);
                    }}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {labelFor(e)}
                      </span>
                      {e.display_name && (
                        <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                          {e.email}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs font-medium text-indigo-600 dark:text-indigo-400">
                      {busyId === e.id ? "Sharing…" : "Share"}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
          <p className="text-xs text-slate-500 dark:text-slate-400">
            A shared educator can fully co-manage this course (modules,
            assignments, grades, roster) but can't delete it or re-share it.
          </p>
        </div>
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Only the course owner can change who it's shared with.
        </p>
      )}
    </div>
  );
}
