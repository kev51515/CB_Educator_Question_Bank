/**
 * studentCommands
 * ===============
 * Builds the ⌘K command list for student personas (Sophia / Jordan). Mirrors
 * the staff-facing `useLmsCommands` pattern but stays scoped to student
 * surfaces: resume in-progress test, weak-skills practice, mock test, inbox,
 * calendar, account, and a "home" entry that proxies for the dashboard's
 * "what's due" / "my courses" panels.
 *
 * The "resume your most recent in-progress test" entry runs a small Supabase
 * lookup (assignment_attempts where submitted_at IS NULL) once when the
 * palette mounts. RLS scopes the query to the current student, so we just
 * grab the newest row. If there's no in-progress attempt, the command stays
 * visible but is wired to a friendly no-op + subtitle so users see why it's
 * inert instead of having the entry disappear.
 *
 * Recents are persisted per-surface under `student.cmdpalette.recent`,
 * matching the staff key (`staff.cmdpalette.recent`) so the two never collide
 * on a shared browser profile.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Command } from "@/components/CommandPalette";
import { useToast } from "@/components/Toast";
import { useProfile } from "./profile";
import { supabase } from "./supabase";
import { ROUTES, assignmentTakePath, studentCoursePath } from "./routes";

/** localStorage key for the student ⌘K "recent commands" stack. */
export const STUDENT_RECENT_COMMANDS_KEY = "student.cmdpalette.recent";
export const STUDENT_RECENT_COMMANDS_CAP = 8;

export function readStudentRecentCommandIds(): string[] {
  try {
    const raw = window.localStorage.getItem(STUDENT_RECENT_COMMANDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v): v is string => typeof v === "string")
      .slice(0, STUDENT_RECENT_COMMANDS_CAP);
  } catch {
    return [];
  }
}

export function writeStudentRecentCommandIds(ids: readonly string[]): void {
  try {
    window.localStorage.setItem(
      STUDENT_RECENT_COMMANDS_KEY,
      JSON.stringify(ids.slice(0, STUDENT_RECENT_COMMANDS_CAP)),
    );
  } catch {
    // ignore (private mode, quota)
  }
}

/**
 * Shape returned by the resume-test lookup. We only need enough to build the
 * destination URL. RLS already restricts visible rows to the current student.
 */
interface InProgressAttemptRow {
  readonly id: string;
  readonly assignment_id: string;
}

/**
 * Run the in-progress lookup once on mount. The result is intentionally cached
 * for the lifetime of the hook — we don't poll, because the palette pulls a
 * fresh value each time it remounts (the keyboard listener toggles the
 * `paletteOpen` flag on the shell, but the hook itself stays mounted with the
 * shell). For now that's fine; if students start submitting tests inside a
 * single ⌘K session we can wire a refresh trigger later.
 */
function useInProgressAttempt(authed: boolean): InProgressAttemptRow | null {
  const [row, setRow] = useState<InProgressAttemptRow | null>(null);

  useEffect(() => {
    if (!authed) {
      setRow(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("assignment_attempts")
          .select("id, assignment_id")
          .is("submitted_at", null)
          .order("started_at", { ascending: false })
          .limit(1);
        if (cancelled) return;
        if (error || !data || data.length === 0) {
          setRow(null);
          return;
        }
        const first = data[0] as { id: string; assignment_id: string };
        setRow({ id: first.id, assignment_id: first.assignment_id });
      } catch {
        if (!cancelled) setRow(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authed]);

  return row;
}

/**
 * Shape returned by the "what's due soon" lookup. We only need enough to deep
 * link the student to the actual assignment-take page. RLS scopes assignments
 * to courses the student is enrolled in.
 */
interface NextDueAssignmentRow {
  readonly id: string;
}

/**
 * Fire once on mount: find the soonest-upcoming, non-archived assignment in
 * any course the student is enrolled in. Returns null if there's nothing on
 * the horizon — the caller surfaces that with a friendly toast.
 */
function useNextDueAssignment(authed: boolean): NextDueAssignmentRow | null {
  const [row, setRow] = useState<NextDueAssignmentRow | null>(null);

  useEffect(() => {
    if (!authed) {
      setRow(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("assignments")
          .select("id")
          .gt("due_at", new Date().toISOString())
          .eq("archived", false)
          .order("due_at", { ascending: true })
          .limit(1);
        if (cancelled) return;
        if (error || !data || data.length === 0) {
          setRow(null);
          return;
        }
        const first = data[0] as { id: string };
        setRow({ id: first.id });
      } catch {
        if (!cancelled) setRow(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authed]);

  return row;
}

/**
 * Shape returned by the "my courses" lookup. We only need short_code (for the
 * URL — Wave 21+ prefers slugs over UUIDs) and the human-readable name (for
 * the per-course command label).
 */
interface StudentCourseRow {
  readonly short_code: string;
  readonly name: string;
}

interface MembershipCourseRow {
  readonly courses: { short_code: string; name: string } | null;
}

/**
 * Fire once on mount: list every course the student is enrolled in. Used to
 * generate one "Open {course name}" command per course (Option B from the
 * lane scope) instead of an unresolved navigator-style entry. RLS scopes the
 * memberships table to the current user.
 */
function useStudentCoursesForCommands(authed: boolean): StudentCourseRow[] {
  const [rows, setRows] = useState<StudentCourseRow[]>([]);

  useEffect(() => {
    if (!authed) {
      setRows([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("course_memberships")
          .select("courses:courses(short_code, name)")
          .order("joined_at", { ascending: false });
        if (cancelled) return;
        if (error || !data) {
          setRows([]);
          return;
        }
        const memberships = data as unknown as MembershipCourseRow[];
        const mapped: StudentCourseRow[] = memberships
          .map((m) => m.courses)
          .filter((c): c is { short_code: string; name: string } => c !== null);
        setRows(mapped);
      } catch {
        if (!cancelled) setRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authed]);

  return rows;
}

/**
 * Build the student-flavored Command list. Safe to call from any component
 * rendered under the BrowserRouter — uses only the cached profile (via
 * `useProfile()`) and a few Supabase lookups (in-progress attempt, next due
 * assignment, enrolled courses).
 */
export function useStudentCommands(): Command[] {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const toast = useToast();
  const authed = Boolean(profile);
  const inProgress = useInProgressAttempt(authed);
  const nextDue = useNextDueAssignment(authed);
  const courses = useStudentCoursesForCommands(authed);

  return useMemo<Command[]>(() => {
    if (!profile) return [];

    const cmds: Command[] = [];

    // 1. Resume in-progress test (or surface why we can't).
    if (inProgress) {
      cmds.push({
        id: "resume-in-progress-test",
        label: "Resume your most recent in-progress test",
        keywords: "continue assignment attempt unfinished",
        group: "Command",
        run: () => navigate(assignmentTakePath(inProgress.assignment_id)),
      });
    } else {
      cmds.push({
        id: "resume-in-progress-test",
        label: "Resume your most recent in-progress test",
        // Subtitle is rendered as the secondary line in the palette via the
        // `keywords` field today; CommandPalette doesn't have a dedicated
        // subtitle slot, so we surface the state via a toast on click.
        keywords: "continue assignment no in-progress test",
        group: "Command",
        run: () =>
          toast.info(
            "No in-progress test",
            "You don't have an unfinished assignment right now.",
          ),
      });
    }

    // 2. Inbox.
    cmds.push({
      id: "open-inbox",
      label: "Open your inbox",
      keywords: "messages dm direct messages",
      group: "Command",
      run: () => navigate(ROUTES.STUDENT_INBOX),
    });

    // 5. Calendar.
    cmds.push({
      id: "open-calendar",
      label: "Open your calendar",
      keywords: "schedule due dates events",
      group: "Command",
      run: () => navigate(ROUTES.STUDENT_CALENDAR),
    });

    // 6. Account settings.
    cmds.push({
      id: "open-account-settings",
      label: "Open your account settings",
      keywords: "profile password preferences",
      group: "Command",
      run: () => navigate(`${ROUTES.STUDENT_ACCOUNT}/settings`),
    });

    // 7. What's due soon — deep-link straight to the soonest-upcoming
    //    assignment-take page so it's a single click to start. If nothing
    //    is upcoming, surface a friendly "all caught up" toast.
    if (nextDue) {
      cmds.push({
        id: "whats-due-soon",
        label: "What's due soon",
        keywords: "deadlines upcoming assignments due",
        group: "Command",
        run: () => navigate(assignmentTakePath(nextDue.id)),
      });
    } else {
      cmds.push({
        id: "whats-due-soon",
        label: "What's due soon",
        keywords: "deadlines upcoming assignments due caught up",
        group: "Command",
        run: () =>
          toast.info("Nothing due soon", "You're all caught up."),
      });
    }

    // 8. Open my courses — expose each course as its own command (Option B
    //    from the lane scope). Better UX than a navigator entry: one click
    //    jumps directly to the course home. If the student has zero courses,
    //    surface a friendly toast instead of a dead entry.
    if (courses.length === 0) {
      cmds.push({
        id: "open-my-courses",
        label: "Open my courses",
        keywords: "classes enrolled my classes",
        group: "Command",
        run: () =>
          toast.info(
            "No courses yet",
            "You aren't enrolled in any courses right now.",
          ),
      });
    } else {
      for (const course of courses) {
        cmds.push({
          id: `open-course-${course.short_code}`,
          label: `Open ${course.name}`,
          keywords: `class course enrolled ${course.name} ${course.short_code}`,
          group: "Command",
          run: () => navigate(studentCoursePath(course.short_code)),
        });
      }
    }

    return cmds;
  }, [navigate, profile, inProgress, nextDue, courses, toast]);
}
