/**
 * DuplicateCourseModal
 * ====================
 * Deep-clones a source course into a new course owned by the caller. Wraps
 * the `clone_course` SECURITY DEFINER RPC + a client-side Storage object copy
 * step for kind='file' course materials (the RPC returns the source ids; we
 * download → re-upload → INSERT the new metadata row here).
 *
 * Lifecycle:
 *   1. Form: name + "Clear due dates" + "Save as template" checkbox.
 *   2. On submit: call RPC, get { new_course_id, source_file_material_ids }.
 *   3. If any file materials need copying, iterate them with a progress
 *      counter. Individual failures are collected and surfaced as a warning
 *      after the loop — they do NOT abort the clone.
 *   4. Navigate to the new course.
 *
 * Used from:
 *   - ClassLayout kebab "Duplicate course"
 *   - AllClassesView "Create from template" button (when filter = templates)
 *   - ClassFormModal "Start from template?" link
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { classPath } from "@/lib/routes";
import { useToast } from "@/components/Toast";
import { useFocusTrap } from "@/hooks";

const STORAGE_BUCKET = "course-materials";

export interface DuplicateCourseSource {
  id: string;
  name: string;
}

interface DuplicateCourseModalProps {
  open: boolean;
  source: DuplicateCourseSource | null;
  onClose: () => void;
  /** Called after a successful clone — parent can refresh its list. */
  onDuplicated?: (newCourseId: string) => void;
}

interface CloneRpcResult {
  new_course_id: string;
  source_file_material_ids: string[];
}

interface SourceFileMaterial {
  id: string;
  title: string;
  description: string | null;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  position: number;
}

interface ProgressState {
  total: number;
  done: number;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

function filenameFromPath(filePath: string): string {
  // Storage paths are `{course_id}/{uuid}-{filename}`. We split off the last
  // segment and drop the leading uuid- prefix to recover the human filename.
  const segments = filePath.split("/");
  const last = segments[segments.length - 1] ?? "file";
  const dashIdx = last.indexOf("-");
  if (dashIdx >= 0 && dashIdx < last.length - 1) {
    return last.slice(dashIdx + 1);
  }
  return last;
}

/**
 * Copy one storage object + insert a new course_materials row pointing at it.
 * Returns null on success, or an error message string on failure.
 */
async function cloneFileMaterial(
  sourceId: string,
  newCourseId: string,
  uploaderId: string,
): Promise<string | null> {
  // Fetch metadata for the source row. We don't trust the RLS visibility here
  // beyond what the caller already has — staff reads all, so this works for
  // teachers cloning their own course or admins cloning anyone's.
  const { data: src, error: fetchErr } = await supabase
    .from("course_materials")
    .select("id, title, description, file_path, file_size, mime_type, position")
    .eq("id", sourceId)
    .maybeSingle();

  if (fetchErr || !src) {
    return fetchErr?.message ?? "Source file not found";
  }
  const srcRow = src as unknown as SourceFileMaterial;
  if (!srcRow.file_path) return "Source row has no file path";

  // Download from Storage.
  const { data: blob, error: dlErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .download(srcRow.file_path);
  if (dlErr || !blob) {
    return dlErr?.message ?? "Download failed";
  }

  // Build a new path under the new course id. We retain the original filename
  // (recovered from the source path) so the download UX matches.
  const original = filenameFromPath(srcRow.file_path);
  const newPath = `${newCourseId}/${crypto.randomUUID()}-${original}`;

  const { error: upErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(newPath, blob, {
      contentType: srcRow.mime_type ?? blob.type ?? "application/octet-stream",
      upsert: false,
    });
  if (upErr) {
    return upErr.message;
  }

  const { error: insErr } = await supabase.from("course_materials").insert({
    course_id: newCourseId,
    uploader_id: uploaderId,
    kind: "file",
    title: srcRow.title,
    description: srcRow.description,
    file_path: newPath,
    file_size: srcRow.file_size,
    mime_type: srcRow.mime_type,
    position: srcRow.position,
  });
  if (insErr) {
    // Roll back the uploaded object to avoid orphans.
    await supabase.storage.from(STORAGE_BUCKET).remove([newPath]);
    return insErr.message;
  }
  return null;
}

export function DuplicateCourseModal({
  open,
  source,
  onClose,
  onDuplicated,
}: DuplicateCourseModalProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const [name, setName] = useState("");
  const [clearDueDates, setClearDueDates] = useState(false);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(panelRef, open);

  useEffect(() => {
    if (!open) return;
    setName(source ? `${source.name} (copy)` : "");
    setClearDueDates(false);
    setSaveAsTemplate(false);
    setError(null);
    setWarnings([]);
    setProgress(null);
    const id = window.setTimeout(() => nameRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open, source]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, busy]);

  if (!open || !source) return null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setWarnings([]);
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Please enter a course name.");
      return;
    }

    setBusy(true);
    try {
      const { data, error: rpcError } = await supabase.rpc("clone_course", {
        p_source_id: source.id,
        p_new_name: trimmed,
        p_clear_due_dates: clearDueDates,
        p_save_as_template: saveAsTemplate,
      });
      if (rpcError) {
        setError(rpcError.message);
        toast.error("Couldn't duplicate course", rpcError.message);
        return;
      }

      const result = data as unknown as CloneRpcResult | null;
      if (!result?.new_course_id) {
        setError("Clone succeeded but no course id was returned.");
        toast.error("Couldn't duplicate course", "No course id was returned.");
        return;
      }

      // Resolve caller id for the uploader column on file material rows.
      const { data: userData } = await supabase.auth.getUser();
      const uploaderId = userData?.user?.id ?? "";

      const fileIds = Array.isArray(result.source_file_material_ids)
        ? result.source_file_material_ids
        : [];

      const collectedWarnings: string[] = [];
      if (fileIds.length > 0 && uploaderId) {
        setProgress({ total: fileIds.length, done: 0 });
        for (let i = 0; i < fileIds.length; i += 1) {
          const srcId = fileIds[i];
          if (!srcId) continue;
          const failure = await cloneFileMaterial(
            srcId,
            result.new_course_id,
            uploaderId,
          );
          if (failure) {
            collectedWarnings.push(`File ${i + 1}: ${failure}`);
          }
          setProgress({ total: fileIds.length, done: i + 1 });
        }
      }

      onDuplicated?.(result.new_course_id);

      if (collectedWarnings.length > 0) {
        // Surface warnings + give the user a chance to read them before
        // navigating. We auto-close on Done.
        setWarnings(collectedWarnings);
        toast.warning(
          "Course duplicated with warnings",
          `${collectedWarnings.length} file${collectedWarnings.length === 1 ? "" : "s"} didn't copy.`,
        );
        setBusy(false);
        return;
      }

      toast.success("Course duplicated", trimmed);
      onClose();
      navigate(classPath(result.new_course_id));
    } catch (err: unknown) {
      const msg = getErrorMessage(err, "Failed to duplicate course.");
      setError(msg);
      toast.error("Couldn't duplicate course", msg);
    } finally {
      setBusy(false);
    }
  };

  const onDoneWithWarnings = () => {
    const newCourseId = progress ? progress : null;
    void newCourseId;
    // We stored the new course id implicitly via onDuplicated; navigate via
    // the modal close + caller hook. To keep this simple we just close here;
    // the parent has the id from onDuplicated already.
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="duplicate-course-title"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-slate-200 dark:ring-slate-700 p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h2
              id="duplicate-course-title"
              className="text-lg font-semibold text-slate-900 dark:text-slate-100"
            >
              Duplicate course
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Clones <span className="font-medium">{source.name}</span> —
              modules, assignments, link materials, and uploaded files all come
              with. Announcements, roster, and student attempts are not copied.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!busy) onClose();
            }}
            aria-label="Close"
            className="rounded-md inline-flex items-center justify-center min-h-[40px] min-w-[40px] md:min-h-0 md:min-w-0 md:p-1 -mt-1 -mr-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 flex-none"
          >
            ✕
          </button>
        </header>

        {warnings.length > 0 ? (
          <div className="space-y-4">
            <div className="rounded-md bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-800 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-900">
              <p className="font-medium">
                Course duplicated, but some files didn't copy:
              </p>
              <ul className="mt-2 list-disc pl-5 space-y-0.5">
                {warnings.map((w, idx) => (
                  <li key={idx} className="text-xs">
                    {w}
                  </li>
                ))}
              </ul>
            </div>
            <button
              type="button"
              onClick={onDoneWithWarnings}
              className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
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
                New course name
              </span>
              <input
                ref={nameRef}
                data-autofocus
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                disabled={busy}
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
              />
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={clearDueDates}
                onChange={(e) => setClearDueDates(e.target.checked)}
                disabled={busy}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">
                <span className="font-medium">Clear due dates</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  Wipe due dates + opens-at on cloned assignments. Useful for
                  starting a new cohort.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={saveAsTemplate}
                onChange={(e) => setSaveAsTemplate(e.target.checked)}
                disabled={busy}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">
                <span className="font-medium">Save as template</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  Mark the new course as a reusable template (shows in the
                  Templates filter).
                </span>
              </span>
            </label>

            {progress && (
              <div className="rounded-md bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-sm text-slate-700 dark:text-slate-300">
                Copying files… {progress.done} of {progress.total}
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-2.5 transition-colors"
              >
                {busy ? "Duplicating…" : "Duplicate"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
