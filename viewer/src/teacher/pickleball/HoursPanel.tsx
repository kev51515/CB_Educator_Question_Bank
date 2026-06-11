/**
 * HoursPanel — teaching-hours log (teacher view).
 *
 * For a 'pickleball_coach' course: a per-coach summary of total logged hours
 * (from the pickleball_coach_hours_totals view), plus a per-coach log table and
 * a quick "log hours" form (date, hours, program, #players, notes).
 *
 *   export function HoursPanel({ courseId }: { courseId: string })
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useClassRoster } from "@/teacher/useClassRoster";
import {
  Combobox,
  EmptyState,
  SkeletonRows,
  SmartDatePicker,
  useToast,
} from "@/components";

interface HoursRow {
  id: string;
  course_id: string;
  coach_id: string;
  taught_on: string;
  hours: number;
  program_id: string | null;
  num_players: number | null;
  notes: string | null;
  created_at: string;
}

interface ProgramRow {
  id: string;
  name: string;
  archived: boolean;
  sort_order: number;
}

interface TotalRow {
  coach_id: string;
  total_hours: number;
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

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function HoursPanel({ courseId }: { courseId: string }) {
  const toast = useToast();
  const { roster, loading: rosterLoading } = useClassRoster(courseId);
  const [selectedCoach, setSelectedCoach] = useState<string | null>(null);
  const [logs, setLogs] = useState<HoursRow[]>([]);
  const [programs, setPrograms] = useState<ProgramRow[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const aliveRef = useRef(true);

  // Log form
  const [taughtOn, setTaughtOn] = useState<string | null>(null);
  const [hours, setHours] = useState("");
  const [programId, setProgramId] = useState<string>("");
  const [numPlayers, setNumPlayers] = useState("");
  const [notes, setNotes] = useState("");
  const [logging, setLogging] = useState(false);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedCoach && roster.length > 0) {
      setSelectedCoach(roster[0].student_id);
    }
  }, [roster, selectedCoach]);

  // Load the course program catalog once.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data } = await supabase
        .from("pickleball_programs")
        .select("id, name, archived, sort_order")
        .eq("course_id", courseId)
        .order("sort_order", { ascending: true });
      if (alive) setPrograms((data ?? []) as ProgramRow[]);
    })();
    return () => {
      alive = false;
    };
  }, [courseId]);

  // Load totals for all coaches in this course (view inherits RLS — teacher
  // sees every row for their course).
  const loadTotals = useCallback(async () => {
    const { data } = await supabase
      .from("pickleball_coach_hours_totals")
      .select("coach_id, total_hours")
      .eq("course_id", courseId);
    if (!aliveRef.current) return;
    const map: Record<string, number> = {};
    for (const row of (data ?? []) as TotalRow[]) {
      map[row.coach_id] = Number(row.total_hours) || 0;
    }
    setTotals(map);
  }, [courseId]);

  const loadLogs = useCallback(async () => {
    if (!selectedCoach) {
      setLogs([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("pickleball_hours_log")
        .select("*")
        .eq("course_id", courseId)
        .eq("coach_id", selectedCoach)
        .order("taught_on", { ascending: false });
      if (!aliveRef.current) return;
      if (error) {
        toast.error(error.message);
        setLogs([]);
        return;
      }
      setLogs((data ?? []) as HoursRow[]);
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [courseId, selectedCoach, toast]);

  useEffect(() => {
    void loadTotals();
  }, [loadTotals]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const programName = useCallback(
    (id: string | null) => programs.find((p) => p.id === id)?.name ?? null,
    [programs],
  );

  const coachName = useMemo(() => {
    const c = roster.find((r) => r.student_id === selectedCoach);
    return c?.display_name || c?.email || "this coach";
  }, [roster, selectedCoach]);

  async function logHours() {
    if (!selectedCoach || !taughtOn || !hours.trim()) return;
    const hoursNum = Number(hours);
    if (!Number.isFinite(hoursNum) || hoursNum <= 0) {
      toast.error("Enter a positive number of hours.");
      return;
    }
    const playersNum = numPlayers.trim() ? Number(numPlayers) : null;
    setLogging(true);
    try {
      const { data, error } = await supabase.rpc("pk_log_hours", {
        p_course_id: courseId,
        p_coach_id: selectedCoach,
        p_taught_on: taughtOn.slice(0, 10),
        p_hours: hoursNum,
        p_program_id: programId || null,
        p_num_players:
          playersNum !== null && Number.isFinite(playersNum)
            ? playersNum
            : null,
        p_notes: notes.trim() || null,
      });
      if (error) {
        toast.error(rpcMessage(error));
        return;
      }
      if (aliveRef.current && data) {
        setLogs((prev) => [data as HoursRow, ...prev]);
        setTotals((prev) => ({
          ...prev,
          [selectedCoach]: (prev[selectedCoach] ?? 0) + hoursNum,
        }));
        setTaughtOn(null);
        setHours("");
        setProgramId("");
        setNumPlayers("");
        setNotes("");
        toast.success("Hours logged.");
      }
    } finally {
      if (aliveRef.current) setLogging(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Per-coach summary */}
      <div className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 p-4">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-3">
          Hours by coach
        </h3>
        {rosterLoading ? (
          <SkeletonRows count={2} />
        ) : roster.length === 0 ? (
          <EmptyState
            icon="inbox"
            title="No coaches enrolled yet"
            body="Add coaches from the Coaches tab to start logging hours."
          />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {roster.map((r) => {
              const active = r.student_id === selectedCoach;
              return (
                <li key={r.student_id}>
                  <button
                    type="button"
                    onClick={() => setSelectedCoach(r.student_id)}
                    className={`flex min-h-[44px] w-full items-center justify-between px-2 text-left text-sm ${
                      active
                        ? "text-emerald-700 dark:text-emerald-400 font-medium"
                        : "text-slate-700 dark:text-slate-200"
                    }`}
                  >
                    <span className="truncate">
                      {r.display_name || r.email}
                    </span>
                    <span className="tabular-nums text-slate-500 dark:text-slate-400">
                      {(totals[r.student_id] ?? 0).toLocaleString(undefined, {
                        maximumFractionDigits: 1,
                      })}{" "}
                      h
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {selectedCoach && (
        <>
          {/* Log form */}
          <div className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Log hours for {coachName}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <SmartDatePicker
                value={taughtOn}
                onChange={setTaughtOn}
                label="Date taught"
              />
              <div>
                <label
                  htmlFor="hours-input"
                  className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5"
                >
                  Hours
                </label>
                <input
                  id="hours-input"
                  type="number"
                  min="0"
                  step="0.5"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  placeholder="e.g. 2"
                  className="min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm"
                />
              </div>
              <div>
                <label
                  htmlFor="program-select"
                  className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5"
                >
                  Program (optional)
                </label>
                <Combobox
                  id="program-select"
                  value={programId || null}
                  onChange={(v) => setProgramId(v)}
                  options={programs
                    .filter((p) => !p.archived)
                    .map((p) => ({ value: p.id, label: p.name }))}
                  placeholder="— No program —"
                  ariaLabel="Program (optional)"
                  className="w-full"
                />
              </div>
              <div>
                <label
                  htmlFor="players-input"
                  className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5"
                >
                  # Players (optional)
                </label>
                <input
                  id="players-input"
                  type="number"
                  min="0"
                  step="1"
                  value={numPlayers}
                  onChange={(e) => setNumPlayers(e.target.value)}
                  placeholder="e.g. 8"
                  className="min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm"
                />
              </div>
            </div>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              className="min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm"
            />
            <div>
              <button
                type="button"
                onClick={() => void logHours()}
                disabled={logging || !taughtOn || !hours.trim()}
                className="min-h-[44px] rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {logging ? "Logging…" : "Log hours"}
              </button>
            </div>
          </div>

          {/* Log table */}
          <div className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {coachName}'s log
              </h3>
              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                Total:{" "}
                {(totals[selectedCoach] ?? 0).toLocaleString(undefined, {
                  maximumFractionDigits: 1,
                })}{" "}
                h
              </span>
            </div>
            {loading ? (
              <SkeletonRows count={3} />
            ) : logs.length === 0 ? (
              <EmptyState
                icon="check"
                title="No hours logged yet"
                body="Use the form above to log this coach's first session."
              />
            ) : (
              <ul className="space-y-2">
                {logs.map((log) => (
                  <li
                    key={log.id}
                    className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                        {formatDate(log.taught_on)}
                        {programName(log.program_id) && (
                          <span className="ml-2 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-normal text-slate-600 dark:text-slate-300">
                            {programName(log.program_id)}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {log.num_players != null
                          ? `${log.num_players} player${log.num_players === 1 ? "" : "s"}`
                          : null}
                        {log.notes ? (
                          <span>
                            {log.num_players != null ? " · " : ""}
                            {log.notes}
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <span className="shrink-0 tabular-nums text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {Number(log.hours).toLocaleString(undefined, {
                        maximumFractionDigits: 1,
                      })}{" "}
                      h
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
