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
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { SmartDatePicker } from "@/components";
import { useFocusTrap } from "@/hooks";

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
  const nameRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(panelRef, open);

  useEffect(() => {
    if (!open) return;
    setName("");
    setOpensAt(null);
    setError(null);
    const id = window.setTimeout(() => nameRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-module-title"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-slate-200 dark:ring-slate-700 p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h2
              id="add-module-title"
              className="text-lg font-semibold text-slate-900 dark:text-slate-100"
            >
              Add module
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              A module groups assignments, headers, and links into a section.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md inline-flex items-center justify-center min-h-[40px] min-w-[40px] md:min-h-0 md:min-w-0 md:p-1 -mt-1 -mr-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 flex-none"
          >
            ✕
          </button>
        </header>

        <form
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
              ref={nameRef}
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

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {busy ? "Creating…" : "Create module"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
