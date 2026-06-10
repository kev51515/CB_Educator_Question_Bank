/**
 * CoachHoursCard — the signed-in coach sees their total logged hours and can
 * log their own teaching sessions.
 *
 *   export function CoachHoursCard({ courseId, studentId }: {
 *     courseId: string; studentId: string })  // studentId = signed-in coach's profiles.id
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
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

const RPC_ERROR_LABELS: Record<string, string> = {
  not_authenticated: "Please sign in again.",
  not_authorized: "You can only log your own hours.",
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

export function CoachHoursCard({
  courseId,
  studentId,
}: {
  courseId: string;
  studentId: string;
}) {
  const toast = useToast();
  const [logs, setLogs] = useState<HoursRow[]>([]);
  const [programs, setPrograms] = useState<ProgramRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const aliveRef = useRef(true);

  // Log form
  const [taughtOn, setTaughtOn] = useState<string | null>(null);
  const [hours, setHours] = useState("");
  const [programId, setProgramId] = useState("");
  const [numPlayers, setNumPlayers] = useState("");
  const [notes, setNotes] = useState("");
  const [logging, setLogging] = useState(false);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // Program catalog (members may read it per 0150 RLS).
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [logsRes, totalRes] = await Promise.all([
        supabase
          .from("pickleball_hours_log")
          .select("*")
          .eq("course_id", courseId)
          .eq("coach_id", studentId)
          .order("taught_on", { ascending: false }),
        supabase
          .from("pickleball_coach_hours_totals")
          .select("total_hours")
          .eq("course_id", courseId)
          .eq("coach_id", studentId)
          .maybeSingle(),
      ]);
      if (!aliveRef.current) return;
      if (logsRes.error) {
        toast.error(logsRes.error.message);
        setLogs([]);
      } else {
        setLogs((logsRes.data ?? []) as HoursRow[]);
      }
      const t = totalRes.data as { total_hours: number } | null;
      setTotal(t ? Number(t.total_hours) || 0 : 0);
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [courseId, studentId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const programName = useCallback(
    (id: string | null) => programs.find((p) => p.id === id)?.name ?? null,
    [programs],
  );

  async function logHours() {
    if (!taughtOn || !hours.trim()) return;
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
        p_coach_id: studentId,
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
        setTotal((t) => t + hoursNum);
        setTaughtOn(null);
        setHours("");
        setProgramId("");
        setNumPlayers("");
        setNotes("");
        setShowForm(false);
        toast.success("Hours logged.");
      }
    } finally {
      if (aliveRef.current) setLogging(false);
    }
  }

  return (
    <div className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            My coaching hours
          </h3>
          <p className="mt-0.5 text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
            {total.toLocaleString(undefined, { maximumFractionDigits: 1 })}
            <span className="ml-1 text-sm font-normal text-slate-500 dark:text-slate-400">
              hours
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="min-h-[40px] rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700"
        >
          {showForm ? "Close" : "Log hours"}
        </button>
      </div>

      {showForm && (
        <div className="mb-4 space-y-3 rounded-xl border border-slate-200 dark:border-slate-800 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <SmartDatePicker
              value={taughtOn}
              onChange={setTaughtOn}
              label="Date taught"
            />
            <div>
              <label
                htmlFor="coach-hours-input"
                className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5"
              >
                Hours
              </label>
              <input
                id="coach-hours-input"
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
                htmlFor="coach-program-select"
                className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5"
              >
                Program (optional)
              </label>
              <select
                id="coach-program-select"
                value={programId}
                onChange={(e) => setProgramId(e.target.value)}
                className="min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm"
              >
                <option value="">— No program —</option>
                {programs
                  .filter((p) => !p.archived)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="coach-players-input"
                className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5"
              >
                # Players (optional)
              </label>
              <input
                id="coach-players-input"
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
          <button
            type="button"
            onClick={() => void logHours()}
            disabled={logging || !taughtOn || !hours.trim()}
            className="min-h-[44px] rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {logging ? "Logging…" : "Save"}
          </button>
        </div>
      )}

      {loading ? (
        <SkeletonRows count={3} />
      ) : logs.length === 0 ? (
        <EmptyState
          icon="check"
          title="No hours logged yet"
          body="Log your first coaching session to start tracking your hours."
          cta={{ label: "Log hours", onClick: () => setShowForm(true) }}
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
  );
}
