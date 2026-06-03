/**
 * CourseSettings
 * ==============
 * Dedicated /courses/:courseId/settings page (Canvas-aligned). Replaces the
 * legacy modal-only edit surface for in-course admin. The ClassFormModal
 * stays around for "create new course" + quick-edit from the course list —
 * but inside a course, this is the canonical settings home.
 *
 * Sections (each its own card):
 *   1. Course identity     — inline rename, MarkdownEditor description,
 *                            short_code with copy-to-clipboard
 *   2. Join code           — display + copy + Regenerate (RPC)
 *   3. Status              — one-click Active/Archived badge toggle
 *   4. Template flag       — one-click is_template toggle
 *   5. Danger zone         — Delete course (type-the-name confirmation)
 *
 * Mounted inside ClassLayout so `useClassContext()` provides {cls, patch}.
 * All mutations are optimistic via useOptimistic — UI flips instantly, then
 * reconciles against the server. Failures toast + rollback.
 */
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useToast, MarkdownEditor, useOptimistic } from "@/components";
import { useClassContext } from "./classLayoutContext";
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

export function CourseSettings() {
  const { cls, patch } = useClassContext();
  const navigate = useNavigate();
  const toast = useToast();

  // Identity edit state — local drafts; commit on blur (name) or explicit Save (description).
  const [nameDraft, setNameDraft] = useState(cls.name);
  const [nameEditing, setNameEditing] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState(cls.description ?? "");
  const [descriptionDirty, setDescriptionDirty] = useState(false);
  const [descriptionBusy, setDescriptionBusy] = useState(false);

  // Re-sync drafts when `cls` updates externally (realtime patch from another
  // tab, or refresh after a peer write). Don't clobber the active editor.
  useEffect(() => {
    if (!nameEditing) setNameDraft(cls.name);
  }, [cls.name, nameEditing]);
  useEffect(() => {
    if (!descriptionDirty) setDescriptionDraft(cls.description ?? "");
  }, [cls.description, descriptionDirty]);

  // Optimistic flags — use the project's @/components useOptimistic (NOT
  // React 19's) so failures roll back the displayed value AND fire a toast.
  // The component flips the badge locally first, then commits via the RPC.
  const [optimisticArchived, applyArchived] = useOptimistic<boolean>(cls.archived);
  const [optimisticTemplate, applyTemplate] = useOptimistic<boolean>(cls.is_template);

  // Confirm dialogs
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  // In-flight gates for the optimistic badge toggles. Rapid double-clicks
  // would otherwise fire two writes to `courses`; if the second commit lands
  // first, the first commit's rollback resets the badge to the wrong state.
  const [archiveToggling, startArchiveToggle] = useTransition();
  const [templateToggling, startTemplateToggle] = useTransition();

  // ---------- mutations ----------

  const saveName = async (): Promise<void> => {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setNameDraft(cls.name);
      setNameEditing(false);
      toast.error("Course name can't be empty");
      return;
    }
    if (trimmed === cls.name) {
      setNameEditing(false);
      return;
    }
    setNameEditing(false);
    const previous = cls.name;
    patch({ name: trimmed });
    const { error: updError } = await supabase
      .from("courses")
      .update({ name: trimmed })
      .eq("id", cls.id);
    if (updError) {
      patch({ name: previous });
      setNameDraft(previous);
      toast.error("Couldn't rename course", updError.message);
      return;
    }
    toast.success("Course renamed");
  };

  const saveDescription = async (): Promise<void> => {
    if (!descriptionDirty) return;
    const next = descriptionDraft.trim() || null;
    const previous = cls.description;
    setDescriptionBusy(true);
    patch({ description: next });
    const { error: updError } = await supabase
      .from("courses")
      .update({ description: next })
      .eq("id", cls.id);
    setDescriptionBusy(false);
    if (updError) {
      patch({ description: previous });
      setDescriptionDraft(previous ?? "");
      toast.error("Couldn't save description", updError.message);
      return;
    }
    setDescriptionDirty(false);
    toast.success("Description saved");
  };

  const copyToClipboard = async (text: string, label: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Couldn't copy", "Clipboard access blocked.");
    }
  };

  const onRegenerate = async (): Promise<void> => {
    setActionBusy(true);
    try {
      const { data, error: rpcError } = await supabase.rpc(
        "regenerate_course_join_code",
        { p_course_id: cls.id },
      );
      if (rpcError) {
        toast.error("Couldn't regenerate join code", rpcError.message);
        return;
      }
      const rows = (data ?? []) as unknown as RegeneratedClassRow[];
      const fresh = rows[0];
      if (fresh?.join_code) {
        patch({ join_code: fresh.join_code });
        toast.success("New join code generated");
      }
      setConfirmRegen(false);
    } catch (err: unknown) {
      toast.error(
        "Couldn't regenerate join code",
        getErrorMessage(err, "Failed to regenerate join code."),
      );
    } finally {
      setActionBusy(false);
    }
  };

  const toggleArchived = (): Promise<boolean> => {
    const next = !cls.archived;
    return applyArchived({
      optimistic: () => next,
      commit: async () => {
        const { error: updError } = await supabase
          .from("courses")
          .update({ archived: next })
          .eq("id", cls.id);
        if (updError) throw new Error(updError.message);
        patch({ archived: next });
      },
      successMessage: next ? "Course archived" : "Course reactivated",
    });
  };

  const toggleTemplate = (): Promise<boolean> => {
    const next = !cls.is_template;
    return applyTemplate({
      optimistic: () => next,
      commit: async () => {
        const { error: updError } = await supabase
          .from("courses")
          .update({ is_template: next })
          .eq("id", cls.id);
        if (updError) throw new Error(updError.message);
        patch({ is_template: next });
      },
      successMessage: next ? "Marked as template" : "Template flag removed",
    });
  };

  const onDelete = async (): Promise<void> => {
    setActionBusy(true);
    try {
      const { error: delError } = await supabase
        .from("courses")
        .delete()
        .eq("id", cls.id);
      if (delError) {
        toast.error("Couldn't delete course", delError.message);
        return;
      }
      toast.success("Course deleted");
      navigate(ROUTES.CLASSES);
    } catch (err: unknown) {
      toast.error(
        "Couldn't delete course",
        getErrorMessage(err, "Failed to delete course."),
      );
    } finally {
      setActionBusy(false);
    }
  };

  // ---------- render ----------

  return (
    <>
      <div className="space-y-6">
        {/* 1. Course identity */}
        <SettingsCard
          title="Course identity"
          description="Name, description, and the stable short code used in the URL."
        >
          {/* Inline rename */}
          <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Name
            </label>
            {nameEditing ? (
              <input
                type="text"
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={() => {
                  void saveName();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void saveName();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setNameDraft(cls.name);
                    setNameEditing(false);
                  }
                }}
                maxLength={120}
                aria-label="Course name"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setNameDraft(cls.name);
                  setNameEditing(true);
                }}
                className="group inline-flex items-center gap-2 rounded-md px-2 py-1 -mx-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
                title="Click to rename"
                aria-label="Rename course"
              >
                <span className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {cls.name}
                </span>
                <span
                  aria-hidden
                  className="text-xs text-slate-400 opacity-0 group-hover:opacity-100"
                >
                  ✎
                </span>
              </button>
            )}
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Click to rename — Enter saves, Esc cancels.
            </p>
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Description
            </label>
            <MarkdownEditor
              value={descriptionDraft}
              onChange={(html) => {
                setDescriptionDraft(html);
                // Clear dirty if user has manually reverted to the saved value
                // (otherwise Save stays enabled and clicking it is a no-op).
                setDescriptionDirty(html !== (cls.description ?? ""));
              }}
              placeholder="What's this course for?"
              minHeight={120}
              characterLimit={500}
            />
            <div className="flex items-center justify-end gap-2 pt-1">
              {descriptionDirty && (
                <button
                  type="button"
                  onClick={() => {
                    setDescriptionDraft(cls.description ?? "");
                    setDescriptionDirty(false);
                  }}
                  className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Discard
                </button>
              )}
              <button
                type="button"
                disabled={!descriptionDirty || descriptionBusy}
                onClick={() => {
                  void saveDescription();
                }}
                className="rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {descriptionBusy ? "Saving…" : "Save description"}
              </button>
            </div>
          </div>

          {/* Short code (read-only + copy) */}
          <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Short code
            </label>
            <div className="flex items-center gap-2">
              <code className="rounded-md bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-sm font-mono font-semibold tracking-wider text-slate-800 dark:text-slate-100">
                {cls.short_code}
              </code>
              <button
                type="button"
                onClick={() => {
                  void copyToClipboard(cls.short_code, "Short code");
                }}
                aria-label="Copy short code"
                className="rounded-md ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                Copy
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Stable, URL-safe identifier. Not editable.
            </p>
          </div>
        </SettingsCard>

        {/* 2. Join code */}
        <SettingsCard
          title="Join code"
          description="Students enter this code to enroll. Regenerating invalidates the old code; already-enrolled students keep their access."
        >
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-md bg-emerald-50 dark:bg-emerald-950/40 ring-1 ring-emerald-200 dark:ring-emerald-900 px-3 py-1.5 text-base font-mono font-semibold tracking-widest text-emerald-800 dark:text-emerald-200">
              {cls.join_code}
            </code>
            <button
              type="button"
              onClick={() => {
                void copyToClipboard(cls.join_code, "Join code");
              }}
              aria-label="Copy join code"
              className="rounded-md ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              Copy
            </button>
            <button
              type="button"
              onClick={() => setConfirmRegen(true)}
              className="rounded-md ring-1 ring-amber-300 dark:ring-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-1.5 text-xs font-medium text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40"
            >
              Regenerate
            </button>
          </div>
        </SettingsCard>

        {/* 3. Status */}
        <SettingsCard
          title="Status"
          description={
            optimisticArchived
              ? "Archived. Hidden from your default list; existing students retain access."
              : "Active courses appear at the top of your console."
          }
        >
          <button
            type="button"
            // Gate on in-flight transition so a double-click can't race two
            // writes and leave the badge stuck on the wrong value.
            disabled={archiveToggling}
            onClick={() => startArchiveToggle(() => { void toggleArchived(); })}
            aria-label={
              optimisticArchived ? "Reactivate course" : "Archive course"
            }
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ring-1 transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
              optimisticArchived
                ? "bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200 ring-amber-200 dark:ring-amber-900 hover:bg-amber-200 dark:hover:bg-amber-900/60"
                : "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 ring-emerald-200 dark:ring-emerald-900 hover:bg-emerald-200 dark:hover:bg-emerald-900/60"
            }`}
          >
            <span
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full ${
                optimisticArchived ? "bg-amber-500" : "bg-emerald-500"
              }`}
            />
            {optimisticArchived ? "Archived" : "Active"}
          </button>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Click the badge to toggle.
          </p>
        </SettingsCard>

        {/* 4. Template flag */}
        <SettingsCard
          title="Course template"
          description="Templates can be duplicated as a starting point for new courses. They behave like normal courses otherwise."
        >
          <label className="inline-flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={optimisticTemplate}
              // Same race guard as the archive toggle above — block re-entry
              // while the previous commit is still in flight.
              disabled={templateToggling}
              onChange={() => startTemplateToggle(() => { void toggleTemplate(); })}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed"
            />
            <span className="text-sm text-slate-700 dark:text-slate-200">
              <span className="font-medium">Use as template</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                {optimisticTemplate
                  ? "This course shows up in the template picker when creating a new course."
                  : "Toggle on to expose this course in the template picker."}
              </span>
            </span>
          </label>
        </SettingsCard>

        {/* 5. Danger zone */}
        <section className="rounded-2xl ring-1 bg-rose-50/40 dark:bg-rose-950/20 ring-rose-200 dark:ring-rose-900 px-5 py-5 space-y-4">
          <header className="space-y-1">
            <h3 className="text-sm font-semibold text-rose-700 dark:text-rose-300">
              Danger zone
            </h3>
            <p className="text-xs text-rose-700/80 dark:text-rose-300/80">
              Irreversible actions. Proceed with care.
            </p>
          </header>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                Delete this course
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Removes the course, its roster, and every assignment + attempt
                attached to it. You'll be asked to type the course name to
                confirm.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setDeleteConfirmText("");
                setConfirmDelete(true);
              }}
              className="shrink-0 rounded-md bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold px-3 py-1.5"
            >
              Delete course…
            </button>
          </div>
        </section>
      </div>

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
                autoFocus
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    deleteConfirmText.trim() === cls.name &&
                    !actionBusy
                  ) {
                    e.preventDefault();
                    void onDelete();
                  }
                }}
                aria-label={`Type course name to confirm deletion: ${cls.name}`}
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

interface SettingsCardProps {
  title: string;
  description: string;
  children: ReactNode;
}

function SettingsCard({ title, description, children }: SettingsCardProps) {
  return (
    <section className="rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white/80 dark:bg-slate-900/60 px-5 py-5 space-y-4">
      <header className="space-y-1">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {title}
        </h3>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          {description}
        </p>
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
