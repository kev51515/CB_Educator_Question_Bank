/**
 * AssignmentsPage
 * ===============
 * Teacher-facing page that lists assignments for a single course, lets the
 * teacher create new ones, edit / archive / delete existing ones, and
 * exposes a "View attempts" button per card.
 *
 * Wave 8C UX upgrade — matches the ModulesPage bar:
 *   - Inline rename on each card title (click → input → Enter/blur saves,
 *     Esc cancels). Empty / unchanged values collapse back to the original.
 *   - One-click Active/Archived status badge — toggles via `useOptimistic`,
 *     rolls back on commit failure, surfaces a toast.
 *   - Toasts for archive + delete success/error (replaces the inline rose
 *     banner that lingered after the action).
 *   - "Active / Archived / All" filter pills above the list, persisted to
 *     localStorage per user so reloads remember the selection.
 *   - Destructive delete uses the shared ConfirmDialog (was a bespoke
 *     inline dialog with duplicate styling).
 *
 * Archived assignments are still rendered with the muted styling so the
 * teacher can find them to un-archive or delete from the "All" or
 * "Archived" filter.
 *
 * Refactored (post-Wave 8C): the per-row card UI moved to AssignmentCard,
 * the title/filter header moved to AssignmentsToolbar, and the bulk-select
 * sticky bar moved to BulkActionsBar. This file is the thin orchestrator:
 * state, hooks, Supabase writes, modal wiring, and the render tree that
 * composes the three children.
 */
import { useCallback, useEffect, useState } from "react";
import { AssignmentFormModal } from "./AssignmentFormModal";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/lib/profile";
import { useAssignments, type Assignment } from "./useAssignments";
import { EmptyState, SkeletonRows } from "@/components";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "./ConfirmDialog";
import { AssignmentCard } from "./AssignmentCard";
import { AssignmentsToolbar } from "./AssignmentsToolbar";
import { BulkActionsBar } from "./BulkActionsBar";
import {
  filterKey,
  readFilter,
  writeFilter,
  type ArchiveFilter,
} from "./assignmentsFilter";

interface AssignmentsPageProps {
  classId: string;
  teacherId: string;
  /** Called when a teacher clicks "View attempts" on a card. */
  onOpenAttempts: (assignment: Assignment) => void;
}

interface ConfirmDeleteState {
  assignment: Assignment;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

export function AssignmentsPage({
  classId,
  teacherId,
  onOpenAttempts,
}: AssignmentsPageProps) {
  const { assignments, loading, error, refresh } = useAssignments(classId);
  const { profile } = useProfile();
  const toast = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<Assignment | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ConfirmDeleteState | null>(
    null,
  );
  const [actionBusy, setActionBusy] = useState(false);

  // Bulk-select state — mirrors ModulesPage. The toolbar "Select"/"Done" pill
  // toggles select mode; checkboxes render on every card while it's on; the
  // sticky bar shows up once at least one row is selected.
  const [selectMode, setSelectMode] = useState<boolean>(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set<string>(),
  );
  const [bulkBusy, setBulkBusy] = useState<boolean>(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState<boolean>(false);

  const exitSelectMode = useCallback((): void => {
    setSelectMode(false);
    setSelectedIds(new Set<string>());
  }, []);

  const toggleSelected = useCallback((id: string): void => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Auto-exit select mode on window resize + browser back.
  useEffect(() => {
    if (!selectMode) return;
    const onResize = (): void => exitSelectMode();
    const onPop = (): void => exitSelectMode();
    window.addEventListener("resize", onResize);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("popstate", onPop);
    };
  }, [selectMode, exitSelectMode]);

  // Prune selection if assignments disappear (delete elsewhere, refresh, etc.).
  useEffect(() => {
    if (selectedIds.size === 0) return;
    const live = new Set(assignments.map((a) => a.id));
    let changed = false;
    const next = new Set<string>();
    for (const id of selectedIds) {
      if (live.has(id)) next.add(id);
      else changed = true;
    }
    if (changed) setSelectedIds(next);
  }, [assignments, selectedIds]);

  // Filter pill state — persisted per (user, classId) so reloading the tab
  // keeps your selection without leaking across accounts on a shared browser
  // profile. Default is "active" so the most common case (showing live
  // assignments) is what you see on first visit.
  const storageKey = filterKey(profile?.id ?? null, classId);
  const [filter, setFilter] = useState<ArchiveFilter>(() => readFilter(storageKey));
  useEffect(() => {
    writeFilter(storageKey, filter);
  }, [storageKey, filter]);

  const activeCount = assignments.filter((a) => !a.archived).length;
  const archivedCount = assignments.filter((a) => a.archived).length;
  const recentlyGradedCount = assignments.filter(
    (a) => (a.recently_graded_count ?? 0) > 0,
  ).length;
  const visible =
    filter === "active"
      ? assignments.filter((a) => !a.archived)
      : filter === "archived"
        ? assignments.filter((a) => a.archived)
        : filter === "recently-graded"
          ? assignments.filter((a) => (a.recently_graded_count ?? 0) > 0)
          : assignments;

  /**
   * Persist archive state. Throws so the inner useOptimistic wrapper can
   * roll back the badge UI on failure.
   */
  const onArchiveCommit = useCallback(
    async (assignment: Assignment, next: boolean): Promise<void> => {
      const { error: updError } = await supabase
        .from("assignments")
        .update({ archived: next })
        .eq("id", assignment.id);
      if (updError) throw new Error(updError.message);
      void refresh();
    },
    [refresh],
  );

  const onRenameCommit = useCallback(
    async (assignment: Assignment, next: string): Promise<void> => {
      const previous = assignment.title;
      const { error: updError } = await supabase
        .from("assignments")
        .update({ title: next })
        .eq("id", assignment.id);
      if (updError) {
        toast.error("Couldn't rename assignment", updError.message);
        // Throw so InlineTitle keeps the draft open for retry instead of
        // resolving as success and discarding the user's typed value.
        throw new Error(updError.message);
      }
      const canUndo = previous !== next;
      toast.success("Assignment renamed", next, canUndo ? {
        action: {
          label: "Undo",
          onAction: () => {
            void (async () => {
              const { error: undoError } = await supabase
                .from("assignments")
                .update({ title: previous })
                .eq("id", assignment.id);
              if (undoError) {
                toast.error("Couldn't undo rename", undoError.message);
                return;
              }
              void refresh();
            })();
          },
        },
      } : undefined);
      void refresh();
    },
    [refresh, toast],
  );

  // ---- Bulk-select actions ----
  const bulkSetArchived = useCallback(
    async (nextArchived: boolean): Promise<void> => {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) return;
      setBulkBusy(true);
      const { error: updError } = await supabase
        .from("assignments")
        .update({ archived: nextArchived })
        .in("id", ids);
      setBulkBusy(false);
      if (updError) {
        toast.error(
          nextArchived
            ? "Couldn't archive assignments"
            : "Couldn't unarchive assignments",
          updError.message,
        );
        return;
      }
      const verb = nextArchived ? "archived" : "unarchived";
      toast.success(
        nextArchived ? "Assignments archived" : "Assignments unarchived",
        `${ids.length} assignment${ids.length === 1 ? "" : "s"} ${verb}.`,
      );
      exitSelectMode();
      void refresh();
    },
    [exitSelectMode, refresh, selectedIds, toast],
  );

  const bulkDelete = useCallback(async (): Promise<void> => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      setBulkDeleteOpen(false);
      return;
    }
    setBulkBusy(true);
    // Soft delete (0202): each assignment moves to the Trash (90-day
    // recovery; its Modules links are hidden with it). Sequential loop —
    // bulk sizes here are small.
    let failed = 0;
    for (const id of ids) {
      const { error: delError } = await supabase.rpc("trash_content", {
        p_kind: "assignment",
        p_id: id,
      });
      if (delError) failed += 1;
    }
    setBulkBusy(false);
    setBulkDeleteOpen(false);
    if (failed > 0) {
      toast.error(
        "Some assignments couldn't be moved to Trash",
        `${failed} of ${ids.length} failed — refresh and try again.`,
      );
    } else {
      toast.success(
        "Assignments moved to Trash",
        `${ids.length} assignment${ids.length === 1 ? "" : "s"} — recoverable for 90 days.`,
      );
    }
    exitSelectMode();
    void refresh();
  }, [exitSelectMode, refresh, selectedIds, toast]);

  const onDelete = async (assignment: Assignment) => {
    setActionBusy(true);
    try {
      // Soft delete (0202): Trash with 90-day recovery; Modules links hidden.
      const { error: delError } = await supabase.rpc("trash_content", {
        p_kind: "assignment",
        p_id: assignment.id,
      });
      if (delError) {
        toast.error("Couldn't delete assignment", delError.message);
        return;
      }
      setConfirmDelete(null);
      toast.success("Moved to Trash", `${assignment.title} — recoverable for 90 days.`, {
        action: {
          label: "Undo",
          onAction: () => {
            void supabase
              .rpc("restore_content", { p_kind: "assignment", p_id: assignment.id })
              .then(({ error }) => {
                if (error) toast.error("Couldn't restore", error.message);
                else {
                  toast.success("Assignment restored", assignment.title);
                  void refresh();
                }
              });
          },
        },
      });
      void refresh();
    } catch (err: unknown) {
      toast.error(
        "Couldn't delete assignment",
        getErrorMessage(err, "Failed to delete assignment."),
      );
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <>
      {/* Course-tab surface — flat like Modules/Gradebook. The page-in-a-page
          gradient, centered column, and ← Back were relics of the standalone-
          route era; the breadcrumb and tab band own navigation now. */}
      <div className="p-6">
        <div className="space-y-6">
          <AssignmentsToolbar
            totalCount={assignments.length}
            activeCount={activeCount}
            archivedCount={archivedCount}
            recentlyGradedCount={recentlyGradedCount}
            filter={filter}
            onFilterChange={setFilter}
            selectMode={selectMode}
            canSelect={assignments.length > 0}
            onEnterSelectMode={() => setSelectMode(true)}
            onExitSelectMode={exitSelectMode}
            onCreate={() => setShowCreate(true)}
          />

          <div className="ivy-rule" aria-hidden="true" />

          <section aria-labelledby="assignments-title" className="space-y-3">
            {loading ? (
              <SkeletonRows count={4} rowClassName="h-32" />
            ) : error ? (
              <div
                role="alert"
                className="rounded-xl bg-rose-50 dark:bg-rose-950/40 ring-1 ring-rose-200 dark:ring-rose-900 px-4 py-3 text-sm text-rose-700 dark:text-rose-300"
              >
                {error}
              </div>
            ) : assignments.length === 0 ? (
              <EmptyState
                title="No assignments yet"
                body="Create your first assignment to give students something to work on."
                cta={{ label: "Create assignment", onClick: () => setShowCreate(true) }}
              />
            ) : visible.length === 0 ? (
              <EmptyState
                title={filter === "archived" ? "No archived assignments" : "No active assignments"}
                body={
                  filter === "archived"
                    ? "Anything you archive will show up here."
                    : "All your assignments are archived. Switch to 'All' or 'Archived' to see them."
                }
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {visible.map((a) => (
                  <AssignmentCard
                    key={a.id}
                    assignment={a}
                    onOpenAttempts={() => onOpenAttempts(a)}
                    onEdit={() => setEditTarget(a)}
                    onArchiveCommit={(next) => onArchiveCommit(a, next)}
                    onRenameCommit={(next) => onRenameCommit(a, next)}
                    onDelete={() => setConfirmDelete({ assignment: a })}
                    selectMode={selectMode}
                    selected={selectedIds.has(a.id)}
                    onToggleSelected={() => toggleSelected(a.id)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      <AssignmentFormModal
        open={showCreate}
        mode="create"
        classId={classId}
        teacherId={teacherId}
        onClose={() => setShowCreate(false)}
        onCreated={() => {
          void refresh();
        }}
      />

      {editTarget && (
        <AssignmentFormModal
          open={true}
          mode="edit"
          classId={classId}
          teacherId={teacherId}
          initialAssignment={editTarget}
          onClose={() => setEditTarget(null)}
          onUpdated={() => {
            void refresh();
          }}
        />
      )}

      {selectMode && selectedIds.size > 0 && (
        <BulkActionsBar
          selectedCount={selectedIds.size}
          busy={bulkBusy}
          onArchiveAll={() => {
            void bulkSetArchived(true);
          }}
          onUnarchiveAll={() => {
            void bulkSetArchived(false);
          }}
          onRequestDelete={() => setBulkDeleteOpen(true)}
          onClear={exitSelectMode}
        />
      )}

      {bulkDeleteOpen && (
        <ConfirmDialog
          title={`Delete ${selectedIds.size} assignment${selectedIds.size === 1 ? "" : "s"}?`}
          body={`Delete ${selectedIds.size} assignment${selectedIds.size === 1 ? "" : "s"} and all their attempts? This cannot be undone.`}
          confirmLabel="Delete assignments"
          destructive
          busy={bulkBusy}
          onConfirm={() => {
            void bulkDelete();
          }}
          onCancel={() => setBulkDeleteOpen(false)}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this assignment?"
          body={
            <div className="space-y-2">
              <p>
                <span className="font-semibold">{confirmDelete.assignment.title}</span>{" "}
                will be permanently removed.
              </p>
              <p className="text-rose-700 dark:text-rose-300">
                Any student attempts on this assignment will be deleted too — their
                scores will be lost. This cannot be undone.
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tip: if you want to hide it without losing data, click the
                "Active" badge to archive it instead.
              </p>
            </div>
          }
          confirmLabel="Delete assignment"
          destructive
          busy={actionBusy}
          onConfirm={() => {
            void onDelete(confirmDelete.assignment);
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </>
  );
}
