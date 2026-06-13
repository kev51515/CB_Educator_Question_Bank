/**
 * GuardiansSection
 * ================
 * Teacher-facing panel on StudentProfilePage for managing a student's guardian
 * (parent) accounts. A guardian is a coded-login profile (role='guardian')
 * attached to the student via guardian_students; once the parent binds LINE,
 * they receive the student's notifications. Backed by the RPCs in migration
 * 0155 (create_guardian_for_student / list_guardians_for_student /
 * unlink_guardian) — all teacher-gated server-side.
 *
 * A parent of siblings is ONE guardian linked to several students (the
 * many-to-many guardian_students). Use "Link existing parent" (0241
 * link_guardian_to_student, by login code) to attach an already-created parent
 * to this student instead of minting a duplicate account; each guardian row
 * shows the other students it covers ("Also follows", 0241
 * guardian_other_students).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/Toast";

interface GuardianRow {
  guardian_id: string;
  display_name: string | null;
  login_code: string | null;
  created_at: string;
}

interface CreatedCreds {
  name: string;
  login_code: string;
  password: string;
}

interface OtherStudent {
  student_id: string;
  display_name: string | null;
}

export function GuardiansSection({ studentId }: { studentId: string }) {
  const toast = useToast();
  const [rows, setRows] = useState<GuardianRow[]>([]);
  const [siblings, setSiblings] = useState<Record<string, OtherStudent[]>>({});
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [linking, setLinking] = useState(false);
  const [linkCode, setLinkCode] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastCreated, setLastCreated] = useState<CreatedCreds | null>(null);
  const alive = useRef(true);

  // For each guardian, the OTHER students they cover that this teacher can see.
  const loadSiblings = useCallback(
    async (guardianRows: GuardianRow[]) => {
      const entries = await Promise.all(
        guardianRows.map(async (g) => {
          const { data } = await supabase.rpc("guardian_other_students", {
            p_guardian_id: g.guardian_id,
            p_student_id: studentId,
          });
          return [g.guardian_id, (data as OtherStudent[]) ?? []] as const;
        }),
      );
      if (!alive.current) return;
      setSiblings(Object.fromEntries(entries));
    },
    [studentId],
  );

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.rpc("list_guardians_for_student", {
      p_student_id: studentId,
    });
    if (!alive.current) return;
    if (error) {
      toast.error("Couldn't load guardians", error.message);
      setRows([]);
    } else {
      const list = (data as GuardianRow[]) ?? [];
      setRows(list);
      void loadSiblings(list);
    }
    setLoading(false);
  }, [studentId, toast, loadSiblings]);

  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => {
      alive.current = false;
    };
  }, [refresh]);

  async function createGuardian(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Enter the guardian's name.");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc("create_guardian_for_student", {
      p_student_id: studentId,
      p_display_name: trimmed,
      p_password: password,
    });
    setBusy(false);
    if (error) {
      toast.error("Couldn't create guardian", error.message);
      return;
    }
    const created = (Array.isArray(data) ? data[0] : data) as
      | { login_code: string }
      | undefined;
    if (created?.login_code) {
      setLastCreated({ name: trimmed, login_code: created.login_code, password });
    }
    toast.success("Guardian created", "Share the login code + password with the parent.");
    setName("");
    setPassword("");
    setAdding(false);
    void refresh();
  }

  async function linkExisting(e: React.FormEvent) {
    e.preventDefault();
    const code = linkCode.trim().toUpperCase();
    if (code.length < 4) {
      toast.error("Enter the parent's login code.");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc("link_guardian_to_student", {
      p_login_code: code,
      p_student_id: studentId,
    });
    setBusy(false);
    if (error) {
      const msg =
        error.message === "guardian_not_found"
          ? "No parent account has that login code."
          : error.message === "not_authorized"
            ? "You can only link parents to your own students."
            : error.message;
      toast.error("Couldn't link parent", msg);
      return;
    }
    const result = (Array.isArray(data) ? data[0] : data) as
      | { display_name: string | null; already_linked: boolean }
      | undefined;
    const who = result?.display_name ?? "Parent";
    if (result?.already_linked) {
      toast.info("Already linked", `${who} already follows this student.`);
    } else {
      toast.success("Parent linked", `${who} now also follows this student.`);
    }
    setLinkCode("");
    setLinking(false);
    void refresh();
  }

  async function unlink(guardianId: string, label: string) {
    const { error } = await supabase.rpc("unlink_guardian", {
      p_guardian_id: guardianId,
      p_student_id: studentId,
    });
    if (error) {
      toast.error("Couldn't remove guardian", error.message);
      return;
    }
    setRows((prev) => prev.filter((r) => r.guardian_id !== guardianId));
    toast.success("Guardian removed", `${label} is no longer linked.`);
  }

  return (
    <section className="rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Guardians
        </h2>
        {!adding && !linking && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setLinking(true);
                setLastCreated(null);
              }}
              className="rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 text-sm font-medium px-3 py-1.5 text-slate-700 dark:text-slate-200 min-h-[36px]"
            >
              Link existing
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(true);
                setLastCreated(null);
              }}
              className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-1.5 min-h-[36px]"
            >
              + Guardian
            </button>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        A guardian signs in with a login code and can receive this student's
        reminders, grades, and announcements on LINE.
      </p>

      {lastCreated && (
        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 ring-1 ring-emerald-200 dark:ring-emerald-800 px-3 py-2 text-sm">
          <p className="font-medium text-emerald-800 dark:text-emerald-300">
            {lastCreated.name} created — hand these to the parent:
          </p>
          <p className="mt-1 text-emerald-700 dark:text-emerald-400">
            Login code: <span className="font-mono font-semibold">{lastCreated.login_code}</span>
            {"  ·  "}Password: <span className="font-mono font-semibold">{lastCreated.password}</span>
          </p>
        </div>
      )}

      {adding && (
        <form onSubmit={createGuardian} className="space-y-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 p-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Guardian name (e.g. Mrs Chen)"
            maxLength={100}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (≥6 chars — you'll share this with them)"
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setName("");
                setPassword("");
              }}
              className="rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 text-sm px-3 py-1.5 text-slate-700 dark:text-slate-200 min-h-[36px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium px-3 py-1.5 min-h-[36px]"
            >
              {busy ? "Creating…" : "Create guardian"}
            </button>
          </div>
        </form>
      )}

      {linking && (
        <form onSubmit={linkExisting} className="space-y-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 p-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Already created this parent for a sibling? Enter their login code to
            link them to this student too — no duplicate account.
          </p>
          <input
            type="text"
            value={linkCode}
            onChange={(e) => setLinkCode(e.target.value.toUpperCase())}
            placeholder="Parent login code (e.g. ABCDEF)"
            maxLength={6}
            autoCapitalize="characters"
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setLinking(false);
                setLinkCode("");
              }}
              className="rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 text-sm px-3 py-1.5 text-slate-700 dark:text-slate-200 min-h-[36px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium px-3 py-1.5 min-h-[36px]"
            >
              {busy ? "Linking…" : "Link parent"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="h-10 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" aria-busy="true" />
      ) : rows.length === 0 ? (
        !adding && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No guardians yet. Add one so a parent can follow this student's progress on LINE.
          </p>
        )
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((g) => (
            <li key={g.guardian_id} className="flex items-center justify-between gap-3 py-2">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {g.display_name ?? "Guardian"}
                </p>
                {g.login_code && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Login code <span className="font-mono">{g.login_code}</span>
                  </p>
                )}
                {siblings[g.guardian_id]?.length ? (
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    Also follows{" "}
                    {siblings[g.guardian_id]
                      .map((s) => s.display_name ?? "a student")
                      .join(", ")}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => void unlink(g.guardian_id, g.display_name ?? "Guardian")}
                className="text-sm font-medium text-rose-600 dark:text-rose-400 hover:underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
