import { useEffect, useRef, useState } from "react";
import { type CourseMaterial } from "./useMaterials";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { useFocusTrap } from "../hooks";

interface EditModalProps {
  material: CourseMaterial;
  busy: boolean;
  error: string | null;
  onSave: (title: string, description: string | null) => void;
  onCancel: () => void;
}

export function EditMaterialModal({
  material,
  busy,
  error,
  onSave,
  onCancel,
}: EditModalProps) {
  const [title, setTitle] = useState(material.title);
  const [description, setDescription] = useState(material.description ?? "");
  const titleRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(panelRef, true);

  useEffect(() => {
    const id = window.setTimeout(() => titleRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  const submit = (e: React.FormEvent): void => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    const trimmedDescription = description.trim();
    onSave(trimmedTitle, trimmedDescription || null);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit material"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        ref={panelRef}
        className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-slate-200 dark:ring-slate-700 p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Edit material
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Update the title or description.{" "}
              {material.kind === "file"
                ? "To replace the file, delete and re-upload."
                : "To change the URL, delete and re-add."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!busy) onCancel();
            }}
            aria-label="Close"
            className="rounded-md inline-flex items-center justify-center min-h-[40px] min-w-[40px] md:min-h-0 md:min-w-0 md:p-1 -mt-1 -mr-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 flex-none"
          >
            ✕
          </button>
        </header>

        <form onSubmit={submit} className="space-y-4">
          {error && (
            <div
              role="alert"
              className="rounded-md bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-sm text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-900"
            >
              {error}
            </div>
          )}

          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Title
            </span>
            <input
              ref={titleRef}
              data-autofocus
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Description{" "}
              <span className="text-slate-500 dark:text-slate-400 font-normal">(optional)</span>
            </span>
            <div className="mt-1">
              <MarkdownEditor
                value={description}
                onChange={setDescription}
                minHeight={120}
                characterLimit={500}
              />
            </div>
          </label>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || title.trim().length === 0}
              className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-2.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-slate-900"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
