/**
 * CoachProgramsPanel — program catalog + coach×program qualification matrix.
 *
 * For a 'pickleball_coach' course: manage the shared program catalog (reuse the
 * 0150 program RPCs) and a matrix where each coach is marked training / cleared
 * per program (pk_set_coach_program, one-click toggle, optimistic).
 *
 *   export function CoachProgramsPanel({ courseId }: { courseId: string })
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useClassRoster } from "@/teacher/useClassRoster";
import { EmptyState, SkeletonRows, useToast } from "@/components";

interface ProgramRow {
  id: string;
  course_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  archived: boolean;
}

interface CoachProgramRow {
  coach_id: string;
  program_id: string;
  status: "training" | "cleared";
}

const RPC_ERROR_LABELS: Record<string, string> = {
  not_authenticated: "Please sign in again.",
  not_authorized: "You do not have permission to do that.",
  not_found: "That item no longer exists.",
  invalid_input: "Please check the fields and try again.",
};

function rpcMessage(err: unknown): string {
  const raw =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";
  for (const code of Object.keys(RPC_ERROR_LABELS)) {
    if (raw.includes(code)) return RPC_ERROR_LABELS[code];
  }
  return "Something went wrong. Please try again.";
}

export function CoachProgramsPanel({ courseId }: { courseId: string }) {
  const toast = useToast();
  const { roster, loading: rosterLoading } = useClassRoster(courseId);
  const [programs, setPrograms] = useState<ProgramRow[]>([]);
  const [matrix, setMatrix] = useState<Record<string, "training" | "cleared">>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const aliveRef = useRef(true);

  // Add-program form
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  // Inline rename
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const matrixKey = (coachId: string, programId: string) =>
    `${coachId}:${programId}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [progRes, cpRes] = await Promise.all([
        supabase
          .from("pickleball_programs")
          .select("id, course_id, name, description, sort_order, archived")
          .eq("course_id", courseId)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
        supabase
          .from("pickleball_coach_programs")
          .select("coach_id, program_id, status")
          .eq("course_id", courseId),
      ]);
      if (!aliveRef.current) return;
      if (progRes.error) {
        toast.error(progRes.error.message);
      } else {
        setPrograms((progRes.data ?? []) as ProgramRow[]);
      }
      if (!cpRes.error) {
        const map: Record<string, "training" | "cleared"> = {};
        for (const row of (cpRes.data ?? []) as CoachProgramRow[]) {
          map[matrixKey(row.coach_id, row.program_id)] = row.status;
        }
        setMatrix(map);
      }
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [courseId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addProgram() {
    if (!newName.trim()) return;
    setAdding(true);
    try {
      const { data, error } = await supabase.rpc("pk_upsert_program", {
        p_course_id: courseId,
        p_id: null,
        p_name: newName.trim(),
        p_description: null,
        p_sort_order: programs.length,
      });
      if (error) {
        toast.error(rpcMessage(error));
        return;
      }
      if (aliveRef.current && data) {
        setPrograms((prev) => [...prev, data as ProgramRow]);
        setNewName("");
        toast.success("Program added.");
      }
    } finally {
      if (aliveRef.current) setAdding(false);
    }
  }

  async function renameProgram(program: ProgramRow) {
    if (!editName.trim() || editName.trim() === program.name) {
      setEditingId(null);
      return;
    }
    const { data, error } = await supabase.rpc("pk_upsert_program", {
      p_course_id: courseId,
      p_id: program.id,
      p_name: editName.trim(),
      p_description: program.description,
      p_sort_order: program.sort_order,
    });
    if (error) {
      toast.error(rpcMessage(error));
      return;
    }
    if (aliveRef.current && data) {
      setPrograms((prev) =>
        prev.map((p) => (p.id === program.id ? (data as ProgramRow) : p)),
      );
      setEditingId(null);
      toast.success("Renamed.");
    }
  }

  async function toggleArchive(program: ProgramRow) {
    const next = !program.archived;
    // Optimistic
    setPrograms((prev) =>
      prev.map((p) => (p.id === program.id ? { ...p, archived: next } : p)),
    );
    const { error } = await supabase.rpc("pk_archive_program", {
      p_id: program.id,
      p_archived: next,
    });
    if (error) {
      toast.error(rpcMessage(error));
      setPrograms((prev) =>
        prev.map((p) =>
          p.id === program.id ? { ...p, archived: program.archived } : p,
        ),
      );
    }
  }

  async function setQualification(
    coachId: string,
    programId: string,
    status: "training" | "cleared",
  ) {
    const key = matrixKey(coachId, programId);
    const prev = matrix[key];
    // Optimistic
    setMatrix((m) => ({ ...m, [key]: status }));
    const { error } = await supabase.rpc("pk_set_coach_program", {
      p_coach_id: coachId,
      p_program_id: programId,
      p_status: status,
    });
    if (error) {
      toast.error(rpcMessage(error));
      setMatrix((m) => {
        const copy = { ...m };
        if (prev) copy[key] = prev;
        else delete copy[key];
        return copy;
      });
    }
  }

  const activePrograms = programs.filter((p) => !p.archived);

  return (
    <div className="space-y-4">
      {/* Catalog */}
      <div className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 p-4">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-3">
          Program catalog
        </h3>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addProgram();
            }}
            placeholder="New program name"
            className="min-h-[44px] flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm"
          />
          <button
            type="button"
            onClick={() => void addProgram()}
            disabled={adding || !newName.trim()}
            className="min-h-[44px] rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {adding ? "Adding…" : "Add"}
          </button>
        </div>

        {loading ? (
          <SkeletonRows count={2} />
        ) : programs.length === 0 ? (
          <EmptyState
            icon="sparkles"
            title="No programs yet"
            body="Add the first coaching program above — e.g. Beginner Clinic, Intermediate Drills."
          />
        ) : (
          <ul className="space-y-1.5">
            {programs.map((p) => {
              const editing = editingId === p.id;
              return (
                <li
                  key={p.id}
                  className="group flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2"
                >
                  {editing ? (
                    <input
                      type="text"
                      value={editName}
                      autoFocus
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={() => void renameProgram(p)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void renameProgram(p);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="min-h-[40px] flex-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 text-sm"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(p.id);
                        setEditName(p.name);
                      }}
                      className={`flex-1 text-left text-sm ${
                        p.archived
                          ? "text-slate-400 line-through dark:text-slate-500"
                          : "text-slate-800 dark:text-slate-100"
                      }`}
                    >
                      {p.name}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void toggleArchive(p)}
                    className={`min-h-[36px] rounded-md px-2 text-xs font-medium ${
                      p.archived
                        ? "text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
                        : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                  >
                    {p.archived ? "Restore" : "Archive"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Qualification matrix */}
      <div className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 p-4">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-3">
          Coach qualifications
        </h3>
        {rosterLoading || loading ? (
          <SkeletonRows count={3} />
        ) : roster.length === 0 ? (
          <EmptyState
            icon="inbox"
            title="No coaches enrolled yet"
            body="Add coaches from the Coaches tab to track their program qualifications."
          />
        ) : activePrograms.length === 0 ? (
          <EmptyState
            icon="sparkles"
            title="No active programs"
            body="Add a program in the catalog above to start qualifying coaches."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-white/80 dark:bg-slate-900/60 px-2 py-2 text-left font-medium text-slate-500 dark:text-slate-400">
                    Coach
                  </th>
                  {activePrograms.map((p) => (
                    <th
                      key={p.id}
                      className="px-2 py-2 text-center font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap"
                    >
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roster.map((r) => (
                  <tr
                    key={r.student_id}
                    className="border-t border-slate-100 dark:border-slate-800"
                  >
                    <td className="sticky left-0 bg-white/80 dark:bg-slate-900/60 px-2 py-2 font-medium text-slate-800 dark:text-slate-100 whitespace-nowrap">
                      {r.display_name || r.email}
                    </td>
                    {activePrograms.map((p) => {
                      const status =
                        matrix[matrixKey(r.student_id, p.id)] ?? null;
                      const cleared = status === "cleared";
                      const next: "training" | "cleared" = cleared
                        ? "training"
                        : "cleared";
                      return (
                        <td key={p.id} className="px-2 py-2 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              void setQualification(r.student_id, p.id, next)
                            }
                            aria-label={`${r.display_name || r.email} — ${p.name}: ${
                              status ?? "not started"
                            }. Click to set ${next}.`}
                            className={`min-h-[36px] rounded-full px-3 text-xs font-medium ${
                              cleared
                                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                                : status === "training"
                                  ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 hover:bg-amber-200"
                                  : "border border-dashed border-slate-300 dark:border-slate-700 text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                            }`}
                          >
                            {cleared
                              ? "Cleared"
                              : status === "training"
                                ? "Training"
                                : "—"}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
