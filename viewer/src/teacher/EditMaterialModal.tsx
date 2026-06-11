import { useState } from "react";
import { type CourseMaterial } from "./useMaterials";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { ResponsiveModal } from "@/components";

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

  const submit = (e: React.FormEvent): void => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    const trimmedDescription = description.trim();
    onSave(trimmedTitle, trimmedDescription || null);
  };

  return (
    <ResponsiveModal
      open={true}
      onClose={() => {
        if (!busy) onCancel();
      }}
      title="Edit material"
      subtitle={
        <>
          Update the title or description.{" "}
          {material.kind === "file"
            ? "To replace the file, delete and re-upload."
            : "To change the URL, delete and re-add."}
        </>
      }
      size="lg"
      dismissible={!busy}
      footer={
        <div className="flex items-center gap-2">
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
            form="edit-material-form"
            disabled={busy || title.trim().length === 0}
            className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-2.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-slate-900"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      }
    >
      <form id="edit-material-form" onSubmit={submit} className="space-y-4">
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
      </form>
    </ResponsiveModal>
  );
}
