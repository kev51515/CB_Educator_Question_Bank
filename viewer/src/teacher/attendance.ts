/**
 * attendance — typed Supabase RPC wrappers for Attendance + Session Packages.
 * ============================================================================
 * A "session package" is a prepaid block of N tutoring sessions for one student
 * in one course. Logging attendance (present/late/absent/excused) draws down
 * the package's remaining balance; voiding an attendance row refunds it. The
 * `get_course_session_balances` RPC returns one row per ENROLLED student so the
 * teacher surface can show "no package yet" rows alongside tracked ones.
 *
 * Every wrapper here delegates to the DB RPCs (applied separately) and throws on
 * error so callers can `try/catch` + toast. Keep this the single typed boundary
 * between the client and the attendance RPCs — components never call
 * `supabase.rpc("…attendance…")` directly.
 */
import { supabase } from "@/lib/supabase";

/** Attendance status — mirrors the DB CHECK constraint on `log_attendance`. */
export type AttendanceStatus = "present" | "absent" | "late" | "excused";

/** One row from `get_course_session_balances(p_course_id)` — one per enrolled
 *  student. `package_id` is null when the student has no package yet. */
export interface SessionBalanceRow {
  student_id: string;
  student_name: string;
  package_id: string | null;
  total_sessions: number | null;
  used: number | null;
  remaining: number | null;
  low_balance_threshold: number | null;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

/**
 * Create a new session package for a student in a course. Returns the new
 * package's uuid.
 */
export async function createSessionPackage(args: {
  studentId: string;
  courseId: string;
  totalSessions: number;
  note: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc("create_session_package", {
    p_student_id: args.studentId,
    p_course_id: args.courseId,
    p_total_sessions: args.totalSessions,
    p_note: args.note,
  });
  if (error) throw new Error(getErrorMessage(error, "Couldn't create package."));
  return data as string;
}

/** Log one attendance event against a package (draws down the balance). */
export async function logAttendance(args: {
  packageId: string;
  sessionDate: string; // ISO date (yyyy-mm-dd)
  status: AttendanceStatus;
  note: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc("log_attendance", {
    p_package_id: args.packageId,
    p_session_date: args.sessionDate,
    p_status: args.status,
    p_note: args.note,
  });
  if (error) throw new Error(getErrorMessage(error, "Couldn't log session."));
}

/** Void a previously-logged attendance row (refunds the session). */
export async function voidAttendance(attendanceId: string): Promise<void> {
  const { error } = await supabase.rpc("void_attendance", {
    p_attendance_id: attendanceId,
  });
  if (error) throw new Error(getErrorMessage(error, "Couldn't void session."));
}

/** Fetch per-student session balances for a course (one row per enrolled). */
export async function getCourseSessionBalances(
  courseId: string,
): Promise<SessionBalanceRow[]> {
  const { data, error } = await supabase.rpc("get_course_session_balances", {
    p_course_id: courseId,
  });
  if (error) throw new Error(getErrorMessage(error, "Couldn't load balances."));
  return (data ?? []) as SessionBalanceRow[];
}
