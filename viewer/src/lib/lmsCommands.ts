/**
 * lmsCommands
 * ===========
 * Builds the LMS-flavored command list that augments the question-bank
 * command palette. Returns commands appropriate to the current route and
 * the current user's role:
 *
 *   - Top-level navigation (always available when authed)
 *   - Per-course actions (only when the URL is /courses/:courseId/*)
 *   - Quick-create actions (staff only)
 *
 * Quick-create actions navigate to the target page with `?openNew=1` so
 * the destination component can opt-in to auto-opening its formal modal.
 * This keeps the palette decoupled from per-page modal state.
 */
import { useEffect, useMemo, useState } from "react";
import { matchPath, useLocation, useNavigate } from "react-router-dom";
import type { Command } from "@/components/CommandPalette";
import { useToast } from "@/components/Toast";
import { useBankCommands } from "./BankCommandsContext";
import { useProfile, type ProfileRole } from "./profile";
import { canAccessQuestionBank } from "./access";
import { supabase } from "./supabase";
import {
  ROUTES,
  courseAnnouncementsPath,
  courseAssignmentsPath,
  courseDiscussionsPath,
  courseGradesPath,
  courseMaterialsPath,
  courseModulesPath,
  coursePath,
  coursePeoplePath,
  coursePortfolioPath,
  courseSettingsPath,
} from "./routes";

/**
 * Pull `:courseId` out of the current URL if we're somewhere under
 * `/courses/:courseId/*`. Returns null for the bare `/courses` index, the
 * sign-in pages, or anything else.
 */
function useCurrentCourseId(): string | null {
  const { pathname } = useLocation();
  // Match `/courses/:courseId` and any deeper sub-route.
  const match = matchPath(
    { path: `${ROUTES.COURSE}/*`, end: false },
    pathname,
  );
  const courseId = match?.params?.courseId;
  return typeof courseId === "string" && courseId.length > 0 ? courseId : null;
}

function isStaff(role: ProfileRole | undefined): boolean {
  return role === "teacher" || role === "admin";
}

interface NavSpec {
  readonly id: string;
  readonly label: string;
  readonly path: string;
  readonly keywords?: string;
}

const TOP_LEVEL_NAV: readonly NavSpec[] = [
  { id: "go-dashboard", label: "Go to Dashboard", path: ROUTES.DASHBOARD, keywords: "home overview" },
  { id: "go-courses", label: "Go to Courses", path: ROUTES.COURSES, keywords: "classes list" },
  { id: "go-calendar", label: "Go to Calendar", path: ROUTES.CALENDAR, keywords: "schedule events month list due dates" },
  { id: "go-inbox", label: "Go to Inbox", path: ROUTES.INBOX, keywords: "messages dm direct" },
  { id: "go-account", label: "Go to Account", path: ROUTES.ACCOUNT_SETTINGS, keywords: "settings profile" },
  { id: "go-notification-prefs", label: "Notification preferences", path: ROUTES.NOTIFICATION_PREFS, keywords: "account notify email alerts settings" },
  { id: "go-practice", label: "Go to Practice", path: ROUTES.PRACTICE, keywords: "question bank study" },
  { id: "go-mock-test", label: "Go to Mock Test", path: ROUTES.MOCK_TEST, keywords: "exam simulation" },
];

/**
 * Admin-only top-level destinations. Gated on the same `staff` check used by
 * AccountRoutes' sidebar so the palette mirrors the visible nav exactly.
 */
const ADMIN_NAV: readonly NavSpec[] = [
  { id: "go-admin-audit", label: "Go to Audit log", path: ROUTES.ACCOUNT_ADMIN_AUDIT, keywords: "admin events trail security" },
  { id: "go-admin-users", label: "Go to Admin users", path: ROUTES.ACCOUNT_ADMIN_USERS, keywords: "admin people accounts manage" },
  { id: "go-admin-stats", label: "Go to Admin stats", path: ROUTES.ACCOUNT_ADMIN_STATS, keywords: "admin metrics dashboard analytics" },
  { id: "go-admin-invites", label: "Go to Invite codes", path: ROUTES.ACCOUNT_ADMIN_INVITES, keywords: "admin invitations signup join" },
];

interface CourseTabSpec {
  readonly id: string;
  readonly label: string;
  readonly build: (courseId: string) => string;
  readonly keywords?: string;
}

const COURSE_TABS: readonly CourseTabSpec[] = [
  { id: "course-modules", label: "Open Modules", build: courseModulesPath, keywords: "units content lessons" },
  { id: "course-roster", label: "Open Roster", build: coursePeoplePath, keywords: "students people enrolled" },
  { id: "course-assignments", label: "Open Assignments", build: courseAssignmentsPath, keywords: "homework tasks" },
  { id: "course-announcements", label: "Open Announcements", build: courseAnnouncementsPath, keywords: "news posts" },
  { id: "course-materials", label: "Open Materials", build: courseMaterialsPath, keywords: "files resources" },
  { id: "course-discussions", label: "Open Discussions", build: courseDiscussionsPath, keywords: "forum threads" },
  { id: "course-portfolio", label: "Open Portfolio", build: coursePortfolioPath, keywords: "showcase work" },
  { id: "course-grades", label: "Open Grades", build: courseGradesPath, keywords: "gradebook scores" },
  { id: "course-settings", label: "Open Settings", build: courseSettingsPath, keywords: "configure preferences" },
];

/**
 * Cap on how many directory-search commands (Open course / Find student)
 * we'll emit per teacher. Beyond this the palette becomes noisy and the
 * fuzzy matcher slows down. Most teachers have <20 courses and <100
 * students — the cap mostly bites at the long-tail admin/super-teacher case.
 */
const DIRECTORY_CMD_CAP = 100;

interface TeacherCourseRow {
  id: string;
  short_code: string | null;
  name: string;
  archived: boolean | null;
  created_at: string;
}

interface TeacherStudentRow {
  user_id: string;
  display_name: string | null;
  email: string;
  joined_at: string;
}

interface DirectoryData {
  courses: TeacherCourseRow[];
  students: TeacherStudentRow[];
}

const EMPTY_DIRECTORY: DirectoryData = { courses: [], students: [] };

/**
 * Internal hook: fetches the teacher's courses and the deduped student
 * roster across those courses, once per teacher id. Falls back to an empty
 * directory for non-staff or unauthed users so the palette stays cheap.
 *
 * RLS notes:
 *   - `courses` SELECT is gated on teacher_id = auth.uid() — works.
 *   - `course_memberships` SELECT for a teacher is allowed for rows whose
 *     course belongs to that teacher.
 *   - `profiles` SELECT — migration 0001 grants teachers a SELECT over
 *     profiles for students enrolled in their courses. So a single nested
 *     PostgREST select (`memberships → profile`) works in one round-trip.
 */
function useTeacherDirectory(teacherId: string | null, isStaffUser: boolean): DirectoryData {
  const [data, setData] = useState<DirectoryData>(EMPTY_DIRECTORY);

  useEffect(() => {
    if (!isStaffUser || !teacherId) {
      setData(EMPTY_DIRECTORY);
      return;
    }
    let cancelled = false;
    void (async () => {
      // 1. Fetch the teacher's courses (used both for "Open course" commands
      //    and to scope the student-membership query).
      const { data: courseRows, error: courseError } = await supabase
        .from("courses")
        .select("id, short_code, name, archived, created_at")
        .eq("teacher_id", teacherId)
        .order("created_at", { ascending: false });

      if (cancelled) return;
      if (courseError || !courseRows) {
        setData(EMPTY_DIRECTORY);
        return;
      }

      const courses = courseRows as TeacherCourseRow[];
      const courseIds = courses.map((c) => c.id);
      if (courseIds.length === 0) {
        setData({ courses, students: [] });
        return;
      }

      // 2. Fetch enrolled students for those courses. We embed the
      //    `profiles` row so display_name + email arrive in one trip.
      const { data: membershipRows, error: membershipError } = await supabase
        .from("course_memberships")
        .select("student_id, joined_at, profile:profiles!student_id(id, display_name, email)")
        .in("course_id", courseIds)
        .order("joined_at", { ascending: false });

      if (cancelled) return;
      if (membershipError || !membershipRows) {
        setData({ courses, students: [] });
        return;
      }

      // PostgREST returns the embedded `profile` as either an object or an
      // array depending on the relationship cardinality inference. Normalise.
      type RawMembershipRow = {
        student_id: string;
        joined_at: string;
        profile:
          | { id: string; display_name: string | null; email: string }
          | { id: string; display_name: string | null; email: string }[]
          | null;
      };
      const seen = new Set<string>();
      const students: TeacherStudentRow[] = [];
      for (const raw of membershipRows as RawMembershipRow[]) {
        const profile = Array.isArray(raw.profile) ? raw.profile[0] : raw.profile;
        if (!profile) continue;
        if (seen.has(profile.id)) continue;
        seen.add(profile.id);
        students.push({
          user_id: profile.id,
          display_name: profile.display_name,
          email: profile.email,
          joined_at: raw.joined_at,
        });
      }

      setData({ courses, students });
    })();
    return () => {
      cancelled = true;
    };
  }, [teacherId, isStaffUser]);

  return data;
}

/**
 * Build the LMS-specific Command list for the current route + role. Safe to
 * call from any component rendered under the BrowserRouter — uses no
 * Supabase calls of its own beyond reading the cached profile via
 * `useProfile()`.
 */
export function useLmsCommands(): Command[] {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const toast = useToast();
  const courseId = useCurrentCourseId();
  const staff = isStaff(profile?.role);
  // Subscribe to the question-bank command registration so that, when the
  // user is on `/practice` (and `<App />` has registered its commands),
  // the bank actions get appended to this list. On any other route the
  // store returns the stable EMPTY array.
  const bankCommands = useBankCommands();
  const { pathname } = useLocation();
  const onPracticeRoute = matchPath(
    { path: ROUTES.PRACTICE, end: false },
    pathname,
  ) !== null;

  // Directory: teacher's courses + deduped student roster. One round-trip
  // each on hook mount; no realtime — the recents-stack and the rest of
  // the palette already drive the user back through here often enough.
  const directory = useTeacherDirectory(profile?.id ?? null, staff);

  return useMemo<Command[]>(() => {
    // No profile → user isn't authed; expose nothing LMS-flavored.
    if (!profile) return [];

    const cmds: Command[] = [];

    // 1. Top-level navigation (always available when authed). The Practice /
    //    Mock Test destinations are test/Question-Bank content, so they're
    //    filtered out for educators without test access.
    const canQbank = canAccessQuestionBank(profile.email);
    for (const nav of TOP_LEVEL_NAV) {
      if (!canQbank && (nav.id === "go-practice" || nav.id === "go-mock-test")) {
        continue;
      }
      cmds.push({
        id: nav.id,
        label: nav.label,
        keywords: nav.keywords,
        group: "Command",
        run: () => navigate(nav.path),
      });
    }

    // 1b. Admin-only top-level destinations. Mirrors the Admin section of
    //     AccountRoutes' sidebar (Stats / Users / Invite codes / Audit log)
    //     so ⌘K reaches every staff surface, not just the personal ones.
    if (staff) {
      for (const nav of ADMIN_NAV) {
        cmds.push({
          id: nav.id,
          label: nav.label,
          keywords: nav.keywords,
          group: "Command",
          run: () => navigate(nav.path),
        });
      }
    }

    // 2. Per-course actions (only when scoped to a course)
    if (courseId) {
      for (const tab of COURSE_TABS) {
        cmds.push({
          id: `${tab.id}:${courseId}`,
          label: tab.label,
          keywords: `course ${tab.keywords ?? ""}`,
          group: "Command",
          run: () => navigate(tab.build(courseId)),
        });
      }
      cmds.push({
        id: `copy-course-url:${courseId}`,
        label: "Copy course URL",
        keywords: "share link slug",
        group: "Command",
        run: () => {
          void (async () => {
            try {
              const url = `${window.location.origin}${coursePath(courseId)}`;
              await navigator.clipboard.writeText(url);
              toast.success("Course URL copied");
            } catch {
              toast.error("Copy failed", "Clipboard access blocked.");
            }
          })();
        },
      });
    }

    // 3. Quick-create actions (staff only)
    if (staff) {
      cmds.push({
        id: "new-course",
        label: "New course",
        keywords: "create add class",
        group: "Command",
        run: () => navigate(`${ROUTES.COURSES}?openNew=1`),
      });

      if (courseId) {
        cmds.push(
          {
            id: `new-announcement:${courseId}`,
            label: "New announcement",
            keywords: "create post news",
            group: "Command",
            run: () => navigate(`${courseAnnouncementsPath(courseId)}?openNew=1`),
          },
          {
            id: `new-assignment:${courseId}`,
            label: "New assignment",
            keywords: "create homework task",
            group: "Command",
            run: () => navigate(`${courseAssignmentsPath(courseId)}?openNew=1`),
          },
          {
            id: `new-module:${courseId}`,
            label: "New module",
            keywords: "create unit content",
            group: "Command",
            run: () => navigate(`${courseModulesPath(courseId)}?openNew=1`),
          },
        );
      }
    }

    // 4. Directory search (staff only): "Open {course}" and "Find {student}"
    //    commands so Maya can jump straight to a course or message a student.
    //    Sources are cached on the hook via `useTeacherDirectory`; the cap
    //    keeps the palette responsive for power users with many cohorts.
    if (staff) {
      let directoryBudget = DIRECTORY_CMD_CAP;

      // 4a. Courses — both active and archived. Use short_code when
      //     available (preferred per CLAUDE.md) and fall back to id.
      for (const course of directory.courses) {
        if (directoryBudget <= 0) break;
        const slug = course.short_code ?? course.id;
        const label = course.archived
          ? `Open ${course.name} (archived)`
          : `Open ${course.name}`;
        cmds.push({
          id: `open-course:${course.id}`,
          label,
          keywords: `course ${course.name} ${course.short_code ?? ""}`,
          group: "Command",
          run: () => navigate(coursePath(slug)),
        });
        directoryBudget -= 1;
      }

      // 4b. Students — deduped across courses, ordered most-recent join
      //     first. Navigates to the inbox compose route already used by
      //     the gradebook "nudge student" affordance.
      for (const student of directory.students) {
        if (directoryBudget <= 0) break;
        const name = student.display_name?.trim() || student.email;
        cmds.push({
          id: `find-student:${student.user_id}`,
          label: `Find ${name}`,
          keywords: `student person ${name} ${student.email}`,
          group: "Command",
          run: () =>
            navigate(
              `${ROUTES.INBOX}?compose=${encodeURIComponent(student.user_id)}`,
            ),
        });
        directoryBudget -= 1;
      }
    }

    // 5. Bank-specific commands (only when on /practice and App has
    //    registered them). Dedupe by id so an accidental collision with
    //    an LMS nav entry keeps the LMS one — those are static and safer.
    if (onPracticeRoute && bankCommands.length > 0) {
      const seen = new Set(cmds.map((c) => c.id));
      for (const c of bankCommands) {
        if (!seen.has(c.id)) cmds.push(c);
      }
    }

    return cmds;
  }, [navigate, profile, courseId, staff, onPracticeRoute, bankCommands, toast, directory]);
}
