/**
 * ClassSettings
 * =============
 * Settings tab inside ClassLayout. Surfaces course-level admin actions
 * that used to live behind the kebab menu in the old ClassDetailView:
 *
 *   - Rename / edit description (opens ClassFormModal in edit mode)
 *   - Archive / unarchive
 *   - Regenerate join code
 *   - Delete course (with type-the-name confirmation)
 *
 * These are also available from the kebab in the ClassLayout header for
 * one-click access, but the settings tab is the canonical home — and the
 * only place where the destructive "Delete" action with name-confirm
 * lives in a more discoverable form.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useProfile } from "../lib/profile";
import { useClassContext } from "./classLayoutContext";
import { ClassFormModal, type EditableClass } from "./ClassFormModal";
import { ConfirmDialog } from "./ConfirmDialog";
import { ROUTES } from "../lib/routes";

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

export function ClassSettings() {
  const { cls, patch } = useClassContext();
  const { profile } = useProfile();
  const navigate = useNavigate();

  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const onRegenerate = async (): Promise<void> => {
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

  const onDelete = async (): Promise<void> => {
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
      // Cascade clears memberships + assignments + attempts. Navigate up.
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

  return (
    <>
      <div className="space-y-6">
        {actionError && (
          <div
            role="alert"
            className="rounded-md bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-sm text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-900"
          >
            {actionError}
          </div>
        )}

        <SettingsRow
          title="Course details"
          description="Update the course name or description."
          action={
            <button
              type="button"
              onClick={() => setShowEdit(true)}
              className="rounded-md bg-indigo-50 dark:bg-indigo-950/40 ring-1 ring-indigo-200 dark:ring-indigo-900 px-3 py-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40"
            >
              Edit
            </button>
          }
        >
          <p className="text-sm text-slate-700 dark:text-slate-200 font-medium">
            {cls.name}
          </p>
          {cls.description ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {cls.description}
            </p>
          ) : (
            <p className="text-xs text-slate-400 dark:text-slate-500 italic">
              No description.
            </p>
          )}
        </SettingsRow>

        <SettingsRow
          title="Archive status"
          description={
            cls.archived
              ? "This course is archived. Students still have access, but it's hidden in your default list."
              : "Active courses appear at the top of your console."
          }
          action={
            <button
              type="button"
              disabled={actionBusy}
              onClick={() => {
                void onToggleArchive();
              }}
              className="rounded-md bg-white dark:bg-slate-800 ring-1 ring-slate-300 dark:ring-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
            >
              {cls.archived ? "Unarchive" : "Archive"}
            </button>
          }
        >
          <p className="text-sm text-slate-700 dark:text-slate-200 font-medium">
            {cls.archived ? "Archived" : "Active"}
          </p>
        </SettingsRow>

        <SettingsRow
          title="Join code"
          description="Regenerating invalidates the old code. Already-enrolled students keep their access."
          action={
            <button
              type="button"
              onClick={() => setConfirmRegen(true)}
              className="rounded-md bg-white dark:bg-slate-800 ring-1 ring-slate-300 dark:ring-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              Regenerate
            </button>
          }
        >
          <p className="text-sm font-mono tracking-widest text-slate-900 dark:text-slate-100">
            {cls.join_code}
          </p>
        </SettingsRow>

        <SettingsRow
          title="Delete course"
          description="Permanently remove the course, its roster, and every assignment + attempt attached to it. This cannot be undone."
          tone="danger"
          action={
            <button
              type="button"
              onClick={() => {
                setDeleteConfirmText("");
                setConfirmDelete(true);
              }}
              className="rounded-md bg-rose-50 dark:bg-rose-950/40 ring-1 ring-rose-200 dark:ring-rose-900 px-3 py-1.5 text-xs font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/40"
            >
              Delete course…
            </button>
          }
        >
          <p className="text-xs text-rose-600 dark:text-rose-400">
            You'll be asked to type the course name to confirm.
          </p>
        </SettingsRow>
      </div>

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
            void onDelete();
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}

interface SettingsRowProps {
  title: string;
  description: string;
  action: React.ReactNode;
  tone?: "default" | "danger";
  children?: React.ReactNode;
}

function SettingsRow({
  title,
  description,
  action,
  tone = "default",
  children,
}: SettingsRowProps) {
  return (
    <section
      className={`rounded-2xl ring-1 px-5 py-4 flex items-center justify-between gap-4 ${
        tone === "danger"
          ? "bg-rose-50/40 dark:bg-rose-950/20 ring-rose-200 dark:ring-rose-900"
          : "bg-white/80 dark:bg-slate-900/60 ring-slate-200 dark:ring-slate-800"
      }`}
    >
      <div className="min-w-0 space-y-1">
        <h3
          className={`text-sm font-semibold ${
            tone === "danger"
              ? "text-rose-700 dark:text-rose-300"
              : "text-slate-900 dark:text-slate-100"
          }`}
        >
          {title}
        </h3>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          {description}
        </p>
        {children}
      </div>
      <div className="shrink-0">{action}</div>
    </section>
  );
}
