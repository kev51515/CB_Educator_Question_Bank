/**
 * AddMaterialModal
 * ================
 * Two-tab modal for adding course materials. Open it in either mode by
 * setting the `initialTab` prop:
 *   - "file"  → drag-and-drop multi-file uploader, optional shared description
 *   - "link"  → url, title, description
 *
 * File uploads land in the `course-materials` Storage bucket under the path
 * `{course_id}/{uuid}-{sanitized-filename}`. The bucket is private, so the
 * client never needs a public URL — it mints a short-lived signed URL on
 * demand via useMaterials. For each successful upload we INSERT a
 * `course_materials` row with kind='file'. If the metadata insert fails after
 * the upload succeeded we attempt to delete the orphaned object before
 * surfacing the error.
 *
 * Multi-file behaviour: each dropped file uploads sequentially, gets its own
 * row, and gets a title derived from its sanitized filename (extension
 * stripped). Position numbers increment from `nextPosition` so users keep the
 * intended order. Any per-file failure aborts the run; previously-completed
 * uploads remain in the bucket and DB so the user only retries the survivors.
 *
 * No new deps: we use the browser File API, the global `crypto.randomUUID()`,
 * and the shared FileDropzone component.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { FileDropzone } from "@/components/FileDropzone";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { ResponsiveModal, useToast } from "@/components";

export type AddMaterialMode = "file" | "link";

interface AddMaterialModalProps {
  open: boolean;
  /** Which tab is selected when the modal opens. Users can still switch. */
  initialTab: AddMaterialMode;
  courseId: string;
  /** The current user's uploader id (caller). Must match auth.uid() server-side. */
  uploaderId: string;
  /** Next position value to use — caller is responsible for handing one in. */
  nextPosition: number;
  onClose: () => void;
  /** Fired after a successful create so the parent can refresh. */
  onCreated?: () => void;
}

const STORAGE_BUCKET = "course-materials";
const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB
const ACCEPTED_TYPES =
  "application/pdf,image/*,application/zip,application/msword," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document," +
  "application/vnd.openxmlformats-officedocument.presentationml.presentation," +
  "text/plain";

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

/**
 * Strip path separators and characters that storage backends sometimes treat
 * specially, collapse whitespace, and cap length. We keep dots so the
 * extension survives. The leading UUID prefix means we don't need uniqueness
 * here — sanitization is purely to keep paths well-formed.
 */
function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  // Replace anything that isn't a basic safe filename char with `_`.
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/_+/g, "_");
  // Cap length so the full path stays under typical 1024B limits even after
  // the {courseId}/{uuid}- prefix (~50 chars).
  return cleaned.slice(0, 180) || "file";
}

function deriveTitle(filename: string): string {
  const dot = filename.lastIndexOf(".");
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  return stem.replace(/[_-]+/g, " ").trim() || filename;
}

/** Loose URL validation — fails closed for obvious junk but doesn't require a scheme. */
function looksLikeUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return false;
  try {
    // If it parses with a scheme, it's good.
    // eslint-disable-next-line no-new
    new URL(trimmed);
    return true;
  } catch {
    // Allow "example.com/foo" — fall through to a lenient regex.
    return /^[\w-]+(\.[\w-]+)+(\/.*)?$/i.test(trimmed);
  }
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function AddMaterialModal({
  open,
  initialTab,
  courseId,
  uploaderId,
  nextPosition,
  onClose,
  onCreated,
}: AddMaterialModalProps) {
  const [tab, setTab] = useState<AddMaterialMode>(initialTab);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  // File-tab state
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<Record<string, number>>({});

  // Link-tab state
  const [url, setUrl] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setTitle("");
    setDescription("");
    setFiles([]);
    setProgress({});
    setUrl("");
    setError(null);
  }, [open, initialTab]);

  const onFilesChange = (next: File[]): void => {
    setFiles(next);
    // Default title to the first file's derived name when the title field is
    // still untouched — preserves the original single-file UX nicety.
    if (next.length > 0 && title.trim().length === 0) {
      setTitle(deriveTitle(next[0].name));
    }
  };

  const uploadOne = async (
    file: File,
    rowTitle: string,
    position: number,
  ): Promise<void> => {
    const safeName = sanitizeFilename(file.name);
    const path = `${courseId}/${crypto.randomUUID()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      });
    if (uploadError) {
      throw new Error(uploadError.message);
    }
    // Storage write done — mark halfway. The DB insert is the second half.
    setProgress((p) => ({ ...p, [file.name]: 50 }));

    const { error: insertError } = await supabase
      .from("course_materials")
      .insert({
        course_id: courseId,
        uploader_id: uploaderId,
        kind: "file",
        title: rowTitle,
        description: description.trim() || null,
        file_path: path,
        file_size: file.size,
        mime_type: file.type || null,
        position,
      });

    if (insertError) {
      // Best-effort cleanup of the orphaned object.
      void supabase.storage.from(STORAGE_BUCKET).remove([path]);
      throw new Error(insertError.message);
    }
    setProgress((p) => ({ ...p, [file.name]: 100 }));
  };

  const submitFiles = async (): Promise<void> => {
    if (files.length === 0) {
      setError("Please choose at least one file to upload.");
      return;
    }
    for (const f of files) {
      if (f.size > MAX_FILE_BYTES) {
        setError(`"${f.name}" exceeds the 50 MB limit.`);
        return;
      }
    }
    const trimmedTitle = title.trim();

    setBusy(true);
    try {
      // For a single file we honour the explicit title; for multiple files we
      // derive each title from its filename so rows are distinguishable.
      const isBatch = files.length > 1;
      if (!isBatch && !trimmedTitle) {
        setError("Please enter a title.");
        setBusy(false);
        return;
      }
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const rowTitle = isBatch ? deriveTitle(f.name) : trimmedTitle;
        // eslint-disable-next-line no-await-in-loop -- sequential preserves ordering
        await uploadOne(f, rowTitle, nextPosition + i);
      }

      toast.success(
        files.length > 1 ? `Files uploaded (${files.length})` : "File uploaded",
      );
      onCreated?.();
      onClose();
    } catch (err: unknown) {
      toast.error("Couldn't save", getErrorMessage(err, "Failed to upload material."));
    } finally {
      setBusy(false);
    }
  };

  const submitLink = async (): Promise<void> => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Please enter a title.");
      return;
    }
    if (!looksLikeUrl(url)) {
      setError("Please enter a valid URL.");
      return;
    }
    setBusy(true);
    try {
      const { error: insertError } = await supabase
        .from("course_materials")
        .insert({
          course_id: courseId,
          uploader_id: uploaderId,
          kind: "link",
          title: trimmedTitle,
          description: description.trim() || null,
          url: normalizeUrl(url),
          position: nextPosition,
        });
      if (insertError) {
        toast.error("Couldn't save", insertError.message);
        return;
      }
      toast.success("Link added");
      onCreated?.();
      onClose();
    } catch (err: unknown) {
      toast.error("Couldn't save", getErrorMessage(err, "Failed to add link."));
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    setError(null);
    if (tab === "file") void submitFiles();
    else void submitLink();
  };

  const tabBtnClass = (active: boolean): string =>
    `flex-1 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
      active
        ? "border-indigo-600 text-indigo-700 dark:text-indigo-300"
        : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
    }`;

  const isBatch = tab === "file" && files.length > 1;

  const footer = (
    <div className="flex items-center gap-2 w-full">
      <button
        type="button"
        onClick={onClose}
        disabled={busy}
        className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
      >
        Cancel
      </button>
      <button
        type="submit"
        form="add-material-form"
        disabled={busy}
        className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-2.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-slate-900"
      >
        {busy
          ? tab === "file"
            ? "Uploading…"
            : "Saving…"
          : tab === "file"
            ? files.length > 1
              ? `Upload ${files.length} files`
              : "Upload"
            : "Add link"}
      </button>
    </div>
  );

  return (
    <ResponsiveModal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      dismissible={!busy}
      title="Add to materials"
      subtitle="Upload files or paste a link. Students see them in the Materials tab."
      size="lg"
      footer={footer}
    >
      <div className="space-y-4">
        <div
          role="tablist"
          aria-label="Material type"
          className="flex border-b border-slate-200 dark:border-slate-700 -mb-px"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "file"}
            onClick={() => {
              setTab("file");
              setError(null);
            }}
            className={tabBtnClass(tab === "file")}
          >
            Upload file
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "link"}
            onClick={() => {
              setTab("link");
              setError(null);
            }}
            className={tabBtnClass(tab === "link")}
          >
            Add link
          </button>
        </div>

        <form id="add-material-form" onSubmit={onSubmit} className="space-y-4">
          {error && (
            <div
              role="alert"
              className="rounded-md bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-sm text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-900"
            >
              {error}
            </div>
          )}

          {tab === "file" ? (
            <div className="space-y-1">
              <span className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Files
              </span>
              <FileDropzone
                files={files}
                onChange={onFilesChange}
                accept={ACCEPTED_TYPES}
                maxSize={MAX_FILE_BYTES}
                multiple
                disabled={busy}
                progress={progress}
              />
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                Up to 50 MB per file. PDFs, images, ZIP, Word, PowerPoint, plain text.
              </span>
            </div>
          ) : (
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                URL
              </span>
              <input
                type="text"
                data-autofocus
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/notes"
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
          )}

          {!isBatch && (
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
                placeholder={tab === "file" ? "e.g. Week 1 reading" : "e.g. AP score release"}
              />
            </label>
          )}

          {isBatch && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Each file becomes its own row; titles are derived from filenames.
            </p>
          )}

          <div className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Description{" "}
              <span className="text-slate-500 dark:text-slate-400 font-normal">(optional)</span>
            </span>
            <div className="mt-1">
              <MarkdownEditor
                value={description}
                onChange={setDescription}
                placeholder={
                  isBatch
                    ? "Shared notes applied to every file."
                    : "Optional notes for students."
                }
                minHeight={120}
                characterLimit={1000}
                disabled={busy}
              />
            </div>
          </div>
        </form>
      </div>
    </ResponsiveModal>
  );
}
