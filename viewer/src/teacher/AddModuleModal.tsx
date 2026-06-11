/**
 * AddModuleModal
 * ==============
 * Create a new course_module for a course. The form collects:
 *   - name (required)
 *   - opens_at (optional release date)
 *   - published (checkbox)
 *
 * On submit we compute position = max(position) + 1 client-side from the
 * already-loaded modules list passed in via props. There's a tiny race
 * window (two staff create simultaneously) but the cost is two modules
 * sharing a position — the reorder UI fixes it on the next drag.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ResponsiveModal, SmartDatePicker } from "@/components";

interface AddModuleModalProps {
  open: boolean;
  classId: string;
  /** Max existing position; we insert at maxPosition + 1. */
  maxPosition: number;
  onClose: () => void;
  onCreated: () => void;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

export function AddModuleModal({
  open,
  classId,
  maxPosition,
  onClose,
  onCreated,
}: AddModuleModalProps) {
  const [name, setName] = useState("");
  const [opensAt, setOpensAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setOpensAt(null);
    setError(null);
  }, [open]);

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
      const { error: insertError } = await supabase
        .from("course_modules")
        .insert({
          course_id: classId,
          name: trimmed,
          position: maxPosition + 1,
          published: false,
          opens_at: opensAt,
        });

      if (insertError) {
        setError(insertError.message);
        return;
      }
      onCreated();
      onClose();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to create module."));
    } finally {
      setBusy(false);
    }
  };

  const footer = (
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
        form="add-module-form"
        disabled={busy}
        className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {busy ? "Creating…" : "Create module"}
      </button>
    </div>
  );

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      title="Add module"
      subtitle="A module groups assignments, headers, and links into a section."
      size="md"
      footer={footer}
    >
      <form
        id="add-module-form"
        onSubmit={(e) => {
          void onSubmit(e);
        }}
        className="space-y-4"
      >
        <div className="space-y-1">
          <label
            htmlFor="module-name"
            className="block text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            Name
          </label>
          <input
            id="module-name"
            data-autofocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Day 1"
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
