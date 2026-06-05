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
import { useMemo, useState } from "react";
import { KebabMenu, type KebabMenuOption, useBreadcrumbLabel } from "@/components";
import {
  NavLink,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/lib/profile";
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
import { ClassAssignmentsTab } from "./ClassAssignmentsTab";
import { AssignmentDetailPage } from "./AssignmentDetailPage";
import { AttemptDetailPage } from "./AttemptDetailPage";
import { CourseAnnouncements } from "./CourseAnnouncements";
import { CourseMaterials } from "./CourseMaterials";
import { CourseGradebook } from "./CourseGradebook";
import { CoursePortfolio } from "./CoursePortfolio";
import { CourseDiscussions } from "./CourseDiscussions";
import { DiscussionTopicView } from "./DiscussionTopicView";
import { CourseSettings } from "./CourseSettings";
import { ModulesPage } from "./ModulesPage";
import { QuickCreatePalette } from "./QuickCreatePalette";
import { ROUTES, classPath, coursePath } from "@/lib/routes";
import { SkeletonRows } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";

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

interface TabDef {
  /** Relative path inside /classes/:classId. Empty string = index. */
  to: string;
  label: string;
  /**
   * NavLink matches the exact path. Used for the index tab so it doesn't
   * stay highlighted while you're inside a deeper sub-tab.
   */
  end?: boolean;
}

const TABS: ReadonlyArray<TabDef> = [
  // Why first + default: Canvas convention. The course detail used to default
  // to the Assignments list; per the spec it now lands on Modules. The
  // `index` route below redirects "" → "modules" so the bare /courses/:id
  // URL resolves cleanly. Overview is still a tab — just no longer the index.
  { to: "modules", label: "Modules" },
  { to: "overview", label: "Overview" },
  { to: "roster", label: "Roster" },
  { to: "assignments", label: "Assignments" },
  { to: "announcements", label: "Announcements" },
  { to: "materials", label: "Materials" },
  { to: "discussions", label: "Discussions" },
  { to: "portfolio", label: "Portfolio" },
  { to: "grades", label: "Grades" },
  { to: "settings", label: "Settings" },
];

function tabClass({ isActive }: { isActive: boolean }): string {
  return `whitespace-nowrap min-h-[40px] md:min-h-0 inline-flex items-center px-3 py-2.5 md:py-2 text-sm font-medium border-b-2 transition-colors ${
    isActive
      ? "border-indigo-600 text-indigo-700 dark:text-indigo-300"
      : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700"
  }`;
}

export function ClassLayout() {
  // Route is /courses/:courseId/* — keep the local name `classId` because
  // every downstream hook + component still uses Class-flavored identifiers
  // until Wave 1D renames the DB. Once that lands this becomes `courseId`.
  const { courseId: classId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { profile } = useProfile();
  const toast = useToast();

  const { cls, loading, error, notFound, refresh, patch } = useClass(classId);

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
        <div className="mx-auto max-w-5xl">
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
      <div className="min-h-[calc(100vh-var(--app-chrome-top,0px))] bg-gradient-to-br from-slate-50 via-indigo-50 to-sky-100 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950">
        {/* Persistent header: course name + back link + kebab actions */}
        <div className="border-b border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur">
          <div className="mx-auto max-w-5xl px-4 pt-6 pb-2 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 truncate">
                    {cls.name}
                  </h1>
                  <button
                    type="button"
                    onClick={() => {
                      void onCopyShortCode();
                    }}
                    className="rounded-md bg-slate-100 dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700 px-2 py-0.5 font-mono text-xs text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                    title="Click to copy course code"
                  >
                    {cls.short_code}
                  </button>
                  {cls.archived && (
                    <span className="rounded-full bg-amber-100 dark:bg-amber-950/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-900">
                      Archived
                    </span>
                  )}
                </div>
              </div>
              <div className="shrink-0">
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
              </div>
            </div>
            {actionError && (
              <div
                role="alert"
                className="rounded-md bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-sm text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-900"
              >
                {actionError}
              </div>
            )}
            {/* Tab strip */}
            <nav
              aria-label="Course sections"
              className="flex items-center gap-1 overflow-x-auto -mb-px"
            >
              {TABS.map((tab) => (
                <NavLink
                  key={tab.to || "overview"}
                  to={tab.to ? `${classPath(cls.short_code)}/${tab.to}` : classPath(cls.short_code)}
                  end={tab.end}
                  className={tabClass}
                >
                  {tab.label}
                </NavLink>
              ))}
            </nav>
          </div>
        </div>

        {/* Tab body — owns its own <Routes>; child paths are relative to
            /classes/:classId because AuthGate registered the parent route
            with a `/*` wildcard. */}
        <div className="mx-auto max-w-5xl px-4 py-6">
          <Routes>
            {/* Default landing tab is now Modules (Canvas-aligned). The bare
                /courses/:id URL redirects to /courses/:id/modules so the tab
                strip highlights correctly and deep links keep working. */}
            <Route index element={<Navigate to="modules" replace />} />
            <Route path="modules" element={<ModulesPage />} />
            <Route path="overview" element={<CourseOverview />} />
            <Route path="roster" element={<ClassRoster />} />
            <Route path="assignments" element={<ClassAssignmentsTab />} />
            <Route
              path="assignments/:assignmentId"
              element={<AssignmentDetailPage />}
            />
            <Route
              path="assignments/:assignmentId/attempts/:attemptId"
              element={<AttemptDetailPage />}
            />
            <Route path="announcements" element={<CourseAnnouncements />} />
            <Route path="materials" element={<CourseMaterials />} />
            <Route path="discussions" element={<CourseDiscussions />} />
            <Route
              path="discussions/:topicId"
              element={<DiscussionTopicView />}
            />
            <Route path="portfolio" element={<CoursePortfolio />} />
            <Route path="grades" element={<CourseGradebook />} />
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
