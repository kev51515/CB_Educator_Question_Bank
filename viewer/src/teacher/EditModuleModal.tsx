/**
 * EditModuleModal
 * ===============
 * Inline edit for an existing course_module — rename, change opens_at, and
 * toggle published. Shape mirrors AddModuleModal so the form fields stay
 * familiar.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { CourseModule } from "./useCourseModules";
import { ResponsiveModal, SmartDatePicker } from "@/components";

interface EditModuleModalProps {
  open: boolean;
  module: CourseModule | null;
  onClose: () => void;
  onUpdated: () => void;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

export function EditModuleModal({
  open,
  module,
  onClose,
  onUpdated,
}: EditModuleModalProps) {
  const [name, setName] = useState("");
  const [opensAt, setOpensAt] = useState<string | null>(null);
  const [published, setPublished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !module) return;
    setName(module.name);
    setOpensAt(module.opens_at);
    setPublished(module.published);
    setError(null);
  }, [open, module]);

  if (!module) return null;

  const onSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Please enter a module name.");
      return;
    }

    setBusy(true);
    try {
      const { error: updateError } = await supabase
        .from("course_modules")
        .update({
          name: trimmed,
          opens_at: opensAt,
          published,
        })
        .eq("id", module.id);

      if (updateError) {
        setError(updateError.message);
        return;
      }
      onUpdated();
      onClose();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to update module."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      title="Edit module"
      size="md"
      footer={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="edit-module-form"
            disabled={busy}
            className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      }
    >
      <form
        id="edit-module-form"
        onSubmit={(e) => {
          void onSubmit(e);
        }}
        className="space-y-4"
      >
        <div className="space-y-1">
          <label
            htmlFor="edit-module-name"
            className="block text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            Name
          </label>
          <input
            id="edit-module-name"
            data-autofocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            required
          />
        </div>

        <SmartDatePicker
          label="Opens at (optional)"
          value={opensAt}
          onChange={setOpensAt}
          allowClear
        />

        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={published}
            onChange={(e) => setPublished(e.target.checked)}
            className="rounded border-slate-300 dark:border-slate-700"
          />
          Published
        </label>

        {error && (
          <div
            role="alert"
            className="rounded-md bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-sm text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-900"
          >
            {error}
          </div>
        )}
      </form>
    </ResponsiveModal>
  );
}
