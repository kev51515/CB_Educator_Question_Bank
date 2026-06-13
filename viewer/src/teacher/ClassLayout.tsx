/**
 * ClassLayout
 * ===========
 * Route shell for the per-course teacher surface, mounted by AuthGate at
 * /classes/:classId/*. Owns:
 *
 *   - The fetched course (via useClass + URL :classId) — redirects up to
 *     /classes on 404 or RLS-denied.
 *   - A persistent header with course name, "Back to courses" link, and a
 *     kebab actions menu (Edit / Archive / Regenerate code / Delete).
 *     The full Settings tab also exposes these — the kebab is just the
 *     one-click shortcut version.
 *   - A tab strip below the header (Overview / Roster / Assignments /
 *     Announcements / Materials / Settings) wired to nested routes via
 *     NavLink + an internal <Routes>.
 *   - A context (ClassLayoutContext) so the child tabs can read the
 *     course + mutate the cached copy after server actions.
 *
 * Pattern note: this component owns its OWN <Routes> block rather than
 * relying on <Outlet />. AuthGate registers /classes/:classId/* as a
 * single route element, so all sub-paths land here and we dispatch
 * internally. That matches how the existing routeViews.tsx ClassLayout
 * stub is wired, and means no AuthGate changes are needed.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { KebabMenu, type KebabMenuOption, useBreadcrumbLabel } from "@/components";
import {
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/lib/profile";
import { useDomain } from "@/lib/DomainProvider";
import { domainOf } from "@/lib/domain";
import { canAccessQuestionBank } from "@/lib/access";
import { useClass } from "./useClass";
import {
  ClassLayoutContext,
  type ClassLayoutContextValue,
} from "./classLayoutContext";
import { ClassFormModal, type EditableClass } from "./ClassFormModal";
import { ConfirmDialog } from "./ConfirmDialog";
import { DuplicateCourseModal } from "./DuplicateCourseModal";
import { CourseOverview } from "./CourseOverview";
import { ClassRoster } from "./ClassRoster";
import { AttendanceTab } from "./AttendanceTab";
import { ClassAssignmentsTab } from "./ClassAssignmentsTab";
import { AssignmentDetailPage } from "./AssignmentDetailPage";
import { AssignmentOverviewPage } from "./AssignmentOverviewPage";
import { AttemptDetailPage } from "./AttemptDetailPage";
import { CourseAnnouncements } from "./CourseAnnouncements";
import { CourseMaterials } from "./CourseMaterials";
import { CourseGradebook } from "./CourseGradebook";
import { ClassSkillsView } from "./ClassSkillsView";
import { DigestsPage } from "./DigestsPage";
import { CoursePortfolio } from "./CoursePortfolio";
import { CounselingCaseloadView } from "./counseling/CounselingCaseloadView";
import { CourseDiscussions } from "./CourseDiscussions";
import { DiscussionTopicView } from "./DiscussionTopicView";
import { CourseSettings } from "./CourseSettings";
import {
  CourseTabStrip,
  type CourseTab,
  type CourseTabGroup,
} from "./CourseTabStrip";
import { ModulesPage } from "./ModulesPage";
import { QuickCreatePalette } from "./QuickCreatePalette";
import { ROUTES, classPath, coursePath } from "@/lib/routes";
import { SkeletonRows } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { isPickleball } from "./useTeacherClasses";
import {
  PlayersPanel,
  LessonsPanel,
  BriefingsPanel,
  AssessmentsPanel,
  DrillsPanel,
  ProgramsPanel,
  EventsPanel,
  CoachesPanel,
  CertificationsPanel,
  DevelopmentPanel,
  ShadowLogsPanel,
  EvaluationsPanel,
  HoursPanel,
  CoachProgramsPanel,
} from "@/teacher/pickleball";
import { ChatPanel } from "@/components/pickleball/ChatPanel";
import { CourseRecordingsTab } from "@/recordings";

interface RegeneratedClassRow {
  id: string;
  join_code: string;
  archived: boolean;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

// Per-course-type tab GROUP definitions. Single-item groups render as plain
// tabs in CourseTabStrip; multi-item groups render as dropdown menus. Only the
// groups for the course's own type are built — nothing leaks across types
// (the old flat-TABS model leaked all pickleball tabs into academic courses).
// Drag-reorder happens at the group level and persists per (user, courseType).
function buildTabGroups(
  courseType: string,
  canQbank: boolean,
): CourseTabGroup[] {
  const tab = (to: string, label: string): CourseTab => ({ to, label });
  const materials: CourseTabGroup = {
    id: "materials",
    label: "Materials",
    items: [tab("materials", "Materials")],
  };
  // Recordings are cross-domain — shown for every course type.
  const recordings: CourseTabGroup = {
    id: "recordings",
    label: "Recordings",
    items: [tab("recordings", "Recordings")],
  };
  const settings: CourseTabGroup = {
    id: "settings",
    label: "Settings",
    items: [tab("settings", "Settings")],
  };
  if (courseType === "pickleball_player") {
    return [
      {
        id: "coaching",
        label: "Coaching",
        items: [
          tab("players", "Players"),
          tab("lessons", "Lessons"),
          tab("briefings", "Briefings"),
          tab("progress", "Progress"),
        ],
      },
      {
        id: "training",
        label: "Training",
        items: [
          tab("drills", "Drills"),
          tab("programs", "Programs"),
          tab("events", "Events"),
        ],
      },
      {
        id: "people",
        label: "People",
        items: [
          tab("roster", "Roster"),
          tab("chat", "Chat"),
          tab("announcements", "Announcements"),
        ],
      },
      materials,
      recordings,
      settings,
    ];
  }
  if (courseType === "pickleball_coach") {
    return [
      {
        id: "development",
        label: "Development",
        items: [
          tab("coaches", "Coaches"),
          tab("certifications", "Certifications"),
          tab("development", "Development"),
          tab("shadowing", "Shadowing"),
          tab("evaluations", "Evaluations"),
        ],
      },
      {
        id: "program",
        label: "Program",
        items: [tab("hours", "Hours"), tab("coach-programs", "Programs")],
      },
      {
        id: "people",
        label: "People",
        items: [
          tab("roster", "Roster"),
          tab("chat", "Chat"),
          tab("announcements", "Announcements"),
        ],
      },
      materials,
      recordings,
      settings,
    ];
  }
  if (courseType === "counseling") {
    return [
      {
        id: "plan",
        label: "Plan",
        items: [
          tab("caseload", "Caseload"),
          tab("portfolio", "Portfolio"),
          tab("modules", "Modules"),
        ],
      },
      {
        id: "overview",
        label: "Overview",
        items: [tab("overview", "Overview")],
      },
      {
        id: "people",
        label: "People",
        items: [
          tab("roster", "Roster"),
          tab("attendance", "Attendance"),
          tab("announcements", "Announcements"),
          tab("discussions", "Discussions"),
        ],
      },
      materials,
      recordings,
      settings,
    ];
  }
  // Academic ('class'). Skills is test-derived, gated with Q-bank access.
  return [
    {
      id: "teach",
      label: "Teach",
      items: [
        tab("modules", "Modules"),
        tab("assignments", "Assignments"),
        tab("grades", "Grades"),
      ],
    },
    {
      id: "insights",
      label: "Insights",
      items: canQbank
        ? [tab("overview", "Overview"), tab("skills", "Skills")]
        : [tab("overview", "Overview")],
    },
    {
      id: "people",
      label: "People",
      items: [
        tab("roster", "Roster"),
        tab("attendance", "Attendance"),
        tab("digests", "Digests"),
        tab("announcements", "Announcements"),
        tab("discussions", "Discussions"),
      ],
    },
    materials,
    recordings,
    settings,
  ];
}

export function ClassLayout() {
  // Route is /courses/:courseId/* — keep the local name `classId` because
  // every downstream hook + component still uses Class-flavored identifiers
  // until Wave 1D renames the DB. Once that lands this becomes `courseId`.
  const { courseId: classId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { profile } = useProfile();
  const toast = useToast();
  // The Skills tab is test-derived (per-domain mastery from test runs), so it's
  // gated with the rest of the Question-Bank/test surfaces.
  const canQbank = canAccessQuestionBank(profile?.email);

  const { cls, loading, error, notFound, refresh, patch } = useClass(classId);

  // Theme the accent by the COURSE's domain while inside it (a coach/player
  // viewing a pickleball course sees orange even if their saved domain differs),
  // reverting to the saved domain on leave.
  const { domain, previewDomain } = useDomain();
  useEffect(() => {
    if (cls?.course_type) previewDomain(domainOf(cls.course_type));
    return () => previewDomain(null);
  }, [cls?.course_type, previewDomain]);

  // Workspace rule: when the user SWITCHES domain while inside a course from a
  // different domain, leave the course — the content pane must always reflect
  // the active workspace. The initial mount is deliberately exempt so deep
  // links (notifications, bookmarks) into a cross-domain course still open;
  // only an explicit switch bounces, back to that workspace's courses list.
  const prevDomainRef = useRef<typeof domain | null>(null);
  useEffect(() => {
    const prev = prevDomainRef.current;
    prevDomainRef.current = domain;
    if (prev === null || prev === domain) return;
    if (cls?.course_type && domainOf(cls.course_type) !== domain) {
      navigate(ROUTES.CLASSES, { replace: true });
    }
  }, [domain, cls?.course_type, navigate]);

  // Portfolio is a counseling surface — only on counseling courses (0133).
  const isCounseling = cls?.course_type === "counseling";
  const courseType = cls?.course_type ?? "class";
  const isPickle = isPickleball(courseType);
  const isPicklePlayer = courseType === "pickleball_player";
  const isPickleCoach = courseType === "pickleball_coach";
  const tabGroups = useMemo(
    () => buildTabGroups(courseType, canQbank),
    [courseType, canQbank],
  );

  // Publish the real course name to the global breadcrumb bar. NO-OPs until
  // both key + label are truthy, so calling it unconditionally before the
  // early returns below is safe.
  useBreadcrumbLabel(classId, cls?.name);

  const [showEdit, setShowEdit] = useState(false);
  const [showDuplicate, setShowDuplicate] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const contextValue: ClassLayoutContextValue | null = useMemo(() => {
    if (!cls) return null;
    return { cls, patch, refresh };
  }, [cls, patch, refresh]);

  const onCopyShortCode = async (): Promise<void> => {
    if (!cls) return;
    try {
      await navigator.clipboard.writeText(cls.short_code);
      toast.success("Code copied", cls.short_code);
    } catch {
      toast.error("Copy failed", "Clipboard access blocked.");
    }
  };

  const onCopyCourseUrl = async (): Promise<void> => {
    if (!cls) return;
    try {
      const url = `${window.location.origin}${coursePath(cls.short_code)}`;
      await navigator.clipboard.writeText(url);
      toast.success("Course URL copied");
    } catch {
      toast.error("Copy failed", "Clipboard access blocked.");
    }
  };

  const onRegenerate = async (): Promise<void> => {
    if (!cls) return;
    setActionBusy(true);
    setActionError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc(
        "regenerate_course_join_code",
        { p_course_id: cls.id },
      );
      if (rpcError) {
        setActionError(rpcError.message);
        return;
      }
      const rows = (data ?? []) as unknown as RegeneratedClassRow[];
      const fresh = rows[0];
      if (fresh?.join_code) {
        patch({ join_code: fresh.join_code });
      }
      setConfirmRegen(false);
    } catch (err: unknown) {
      setActionError(getErrorMessage(err, "Failed to regenerate join code."));
    } finally {
      setActionBusy(false);
    }
  };

  const onToggleArchive = async (): Promise<void> => {
    if (!cls) return;
    setActionBusy(true);
    setActionError(null);
    try {
      const next = !cls.archived;
      const { error: updError } = await supabase
        .from("courses")
        .update({ archived: next })
        .eq("id", cls.id);
      if (updError) {
        setActionError(updError.message);
        return;
      }
      patch({ archived: next });
    } catch (err: unknown) {
      setActionError(getErrorMessage(err, "Failed to update course."));
    } finally {
      setActionBusy(false);
    }
  };

  const onToggleTemplate = async (): Promise<void> => {
    if (!cls) return;
    setActionBusy(true);
    setActionError(null);
    try {
      const next = !cls.is_template;
      const { error: updError } = await supabase
        .from("courses")
        .update({ is_template: next })
        .eq("id", cls.id);
      if (updError) {
        setActionError(updError.message);
        return;
      }
      patch({ is_template: next });
    } catch (err: unknown) {
      setActionError(getErrorMessage(err, "Failed to update template flag."));
    } finally {
      setActionBusy(false);
    }
  };

  const onDeleteClass = async (): Promise<void> => {
    if (!cls) return;
    setActionBusy(true);
    setActionError(null);
    try {
      const { error: delError } = await supabase
        .from("courses")
        .delete()
        .eq("id", cls.id);
      if (delError) {
        setActionError(delError.message);
        return;
      }
      navigate(ROUTES.CLASSES);
    } catch (err: unknown) {
      setActionError(getErrorMessage(err, "Failed to delete course."));
    } finally {
      setActionBusy(false);
    }
  };

  const onClassUpdated = (updated: EditableClass): void => {
    patch({
      name: updated.name,
      description: updated.description,
      archived: updated.archived,
    });
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-var(--app-chrome-top,0px))] bg-slate-50 dark:bg-slate-950 px-4 py-6">
        <div className="max-w-[1800px]">
          <SkeletonRows count={6} rowClassName="h-12" />
        </div>
      </div>
    );
  }

  if (notFound || !cls) {
    // 404 / RLS-denied / missing param — bounce to the course list so the
    // user isn't stuck on a blank screen with no nav.
    return <Navigate to={ROUTES.CLASSES} replace />;
  }

  if (error) {
    return (
      <div className="min-h-[calc(100vh-var(--app-chrome-top,0px))] flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
        <div className="max-w-md w-full rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-6 space-y-4 text-center">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Couldn't load this course
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">{error}</p>
          <button
            type="button"
            onClick={() => navigate(ROUTES.CLASSES)}
            className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2"
          >
            Back to courses
          </button>
        </div>
      </div>
    );
  }

  return (
    <ClassLayoutContext.Provider value={contextValue}>
      <div className="min-h-[calc(100vh-var(--app-chrome-top,0px))] bg-slate-50 dark:bg-slate-950">
        {/* Persistent header: tab strip + right-side course chrome. The course
            NAME deliberately does not render here — the breadcrumb already
            carries it (owner decision 2026-06: save the vertical space). */}
        <div className="border-b border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur">
          <div className="max-w-[1800px] px-4 sm:px-6 lg:px-8 pt-3 space-y-2">
            {actionError && (
              <div
                role="alert"
                className="rounded-lg bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-sm text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-900"
              >
                {actionError}
              </div>
            )}
            {/* Tab strip — grouped tabs + always-visible subtab band; drag to
                reorder groups; order persists per (user, course type). Course
                chrome (code chip, status, kebab) rides the groups row. */}
            <CourseTabStrip
              groups={tabGroups}
              shortCode={cls.short_code}
              userId={profile?.id ?? null}
              courseType={courseType}
              trailing={
                <>
                  {cls.archived && (
                    <span className="rounded-full bg-amber-100 dark:bg-amber-950/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-900">
                      Archived
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      void onCopyShortCode();
                    }}
                    className="rounded-lg bg-slate-100 dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700 px-2 py-0.5 font-mono text-xs text-slate-600 dark:text-slate-300 hover:bg-accent-50 dark:hover:bg-accent-950/40 hover:text-accent-700 dark:hover:text-accent-300 transition-colors"
                    title="Click to copy course code"
                  >
                    {cls.short_code}
                  </button>
                  <KebabMenu
                    options={(
                      [
                      {
                        label: "Edit course",
                        onSelect: () => setShowEdit(true),
                      },
                      {
                        label: "Copy URL",
                        onSelect: () => {
                          void onCopyCourseUrl();
                        },
                      },
                      {
                        label: "Regenerate join code",
                        onSelect: () => setConfirmRegen(true),
                      },
                      {
                        label: cls.archived ? "Unarchive course" : "Archive course",
                        disabled: actionBusy,
                        hint: actionBusy ? "Working…" : undefined,
                        onSelect: () => {
                          void onToggleArchive();
                        },
                      },
                      {
                        label: "Duplicate course",
                        onSelect: () => setShowDuplicate(true),
                      },
                      {
                        label: cls.is_template ? "Unmark as template" : "Save as template",
                        disabled: actionBusy,
                        hint: actionBusy ? "Working…" : undefined,
                        onSelect: () => {
                          void onToggleTemplate();
                        },
                      },
                      {
                        label: "Delete course…",
                        destructive: true,
                        onSelect: () => {
                          setDeleteConfirmText("");
                          setConfirmDelete(true);
                        },
                      },
                    ] satisfies KebabMenuOption[]
                  )}
                  />
                </>
              }
            />
          </div>
        </div>

        {/* Tab body — owns its own <Routes>; child paths are relative to
            /classes/:classId because AuthGate registered the parent route
            with a `/*` wildcard. */}
        <div className="max-w-[1800px] px-4 sm:px-6 lg:px-8 py-6">
          <Routes>
            {/* Default landing tab is now Modules (Canvas-aligned). The bare
                /courses/:id URL redirects to /courses/:id/modules so the tab
                strip highlights correctly and deep links keep working. */}
            <Route
              index
              element={
                <Navigate
                  to={
                    isPicklePlayer
                      ? "players"
                      : isPickleCoach
                        ? "coaches"
                        : isCounseling
                          ? "caseload"
                          : "modules"
                  }
                  replace
                />
              }
            />
            <Route path="modules" element={<ModulesPage />} />
            <Route path="overview" element={<CourseOverview />} />
            <Route
              path="caseload"
              element={
                isCounseling ? (
                  <CounselingCaseloadView />
                ) : (
                  <Navigate to={classPath(cls.short_code)} replace />
                )
              }
            />
            <Route path="roster" element={<ClassRoster />} />
            <Route path="attendance" element={<AttendanceTab />} />
            <Route path="digests" element={<DigestsPage />} />
            <Route path="assignments" element={<ClassAssignmentsTab />} />
            <Route
              path="assignments/:assignmentId"
              element={<AssignmentDetailPage />}
            />
            <Route
              path="assignments/:assignmentId/overview"
              element={<AssignmentOverviewPage />}
            />
            <Route
              path="assignments/:assignmentId/attempts/:attemptId"
              element={<AttemptDetailPage />}
            />
            <Route path="announcements" element={<CourseAnnouncements />} />
            <Route path="materials" element={<CourseMaterials />} />
            <Route path="recordings" element={<CourseRecordingsTab />} />
            <Route path="discussions" element={<CourseDiscussions />} />
            <Route
              path="discussions/:topicId"
              element={<DiscussionTopicView />}
            />
            <Route
              path="portfolio"
              element={
                isCounseling ? (
                  <CoursePortfolio />
                ) : (
                  <Navigate to={classPath(cls.short_code)} replace />
                )
              }
            />
            <Route path="grades" element={<CourseGradebook />} />
            <Route
              path="skills"
              element={
                canQbank && !isCounseling ? (
                  <ClassSkillsView />
                ) : (
                  <Navigate to={classPath(cls.short_code)} replace />
                )
              }
            />
            {/* Pickleball — player track */}
            <Route
              path="players"
              element={
                isPicklePlayer ? (
                  <PlayersPanel courseId={cls.id} />
                ) : (
                  <Navigate to={classPath(cls.short_code)} replace />
                )
              }
            />
            <Route
              path="lessons"
              element={
                isPicklePlayer ? (
                  <LessonsPanel courseId={cls.id} />
                ) : (
                  <Navigate to={classPath(cls.short_code)} replace />
                )
              }
            />
            <Route
              path="briefings"
              element={
                isPicklePlayer ? (
                  <BriefingsPanel courseId={cls.id} />
                ) : (
                  <Navigate to={classPath(cls.short_code)} replace />
                )
              }
            />
            <Route
              path="progress"
              element={
                isPicklePlayer ? (
                  <AssessmentsPanel courseId={cls.id} />
                ) : (
                  <Navigate to={classPath(cls.short_code)} replace />
                )
              }
            />
            <Route
              path="drills"
              element={
                isPicklePlayer ? (
                  <DrillsPanel courseId={cls.id} />
                ) : (
                  <Navigate to={classPath(cls.short_code)} replace />
                )
              }
            />
            <Route
              path="programs"
              element={
                isPicklePlayer ? (
                  <ProgramsPanel courseId={cls.id} />
                ) : (
                  <Navigate to={classPath(cls.short_code)} replace />
                )
              }
            />
            <Route
              path="events"
              element={
                isPicklePlayer ? (
                  <EventsPanel courseId={cls.id} />
                ) : (
                  <Navigate to={classPath(cls.short_code)} replace />
                )
              }
            />
            {/* Pickleball — coach track */}
            <Route
              path="coaches"
              element={
                isPickleCoach ? (
                  <CoachesPanel courseId={cls.id} />
                ) : (
                  <Navigate to={classPath(cls.short_code)} replace />
                )
              }
            />
            <Route
              path="certifications"
              element={
                isPickleCoach ? (
                  <CertificationsPanel courseId={cls.id} />
                ) : (
                  <Navigate to={classPath(cls.short_code)} replace />
                )
              }
            />
            <Route
              path="development"
              element={
                isPickleCoach ? (
                  <DevelopmentPanel courseId={cls.id} />
                ) : (
                  <Navigate to={classPath(cls.short_code)} replace />
                )
              }
            />
            <Route
              path="shadowing"
              element={
                isPickleCoach ? (
                  <ShadowLogsPanel courseId={cls.id} />
                ) : (
                  <Navigate to={classPath(cls.short_code)} replace />
                )
              }
            />
            <Route
              path="evaluations"
              element={
                isPickleCoach ? (
                  <EvaluationsPanel courseId={cls.id} />
                ) : (
                  <Navigate to={classPath(cls.short_code)} replace />
                )
              }
            />
            <Route
              path="hours"
              element={
                isPickleCoach ? (
                  <HoursPanel courseId={cls.id} />
                ) : (
                  <Navigate to={classPath(cls.short_code)} replace />
                )
              }
            />
            <Route
              path="coach-programs"
              element={
                isPickleCoach ? (
                  <CoachProgramsPanel courseId={cls.id} />
                ) : (
                  <Navigate to={classPath(cls.short_code)} replace />
                )
              }
            />
            {/* Pickleball — shared community chat (staff can moderate) */}
            <Route
              path="chat"
              element={
                isPickle ? (
                  <ChatPanel
                    courseId={cls.id}
                    selfId={profile?.id ?? ""}
                    canModerate
                  />
                ) : (
                  <Navigate to={classPath(cls.short_code)} replace />
                )
              }
            />
            <Route path="settings" element={<CourseSettings />} />
            <Route
              path="*"
              element={<Navigate to={classPath(cls.short_code)} replace />}
            />
          </Routes>
        </div>
      </div>

      {/* ⌘N anywhere inside the course shell opens the quick-create picker.
          The component owns its own keydown listener + visibility state. */}
      <QuickCreatePalette />

      <DuplicateCourseModal
        open={showDuplicate}
        source={{ id: cls.id, name: cls.name }}
        onClose={() => setShowDuplicate(false)}
      />

      <ClassFormModal
        open={showEdit}
        mode="edit"
        teacherId={profile?.id ?? ""}
        initialClass={{
          id: cls.id,
          name: cls.name,
          description: cls.description,
          archived: cls.archived,
        }}
        onClose={() => setShowEdit(false)}
        onUpdated={onClassUpdated}
      />

      {confirmRegen && (
        <ConfirmDialog
          title="Regenerate join code?"
          body="Students who haven't joined yet will need the new code. Students already enrolled keep their access."
          confirmLabel="Regenerate"
          busy={actionBusy}
          onConfirm={() => {
            void onRegenerate();
          }}
          onCancel={() => setConfirmRegen(false)}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this course?"
          body={
            <div className="space-y-3">
              <p>
                This permanently removes the course, its roster, and every
                assignment + attempt attached to it.{" "}
                <span className="font-semibold text-rose-700 dark:text-rose-300">
                  This cannot be undone.
                </span>
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Type{" "}
                <span className="font-mono font-semibold">{cls.name}</span> to
                confirm:
              </p>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-500"
                placeholder={cls.name}
              />
            </div>
          }
          confirmLabel="Delete course"
          destructive
          busy={actionBusy}
          confirmDisabled={deleteConfirmText.trim() !== cls.name}
          onConfirm={() => {
            void onDeleteClass();
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </ClassLayoutContext.Provider>
  );
}
