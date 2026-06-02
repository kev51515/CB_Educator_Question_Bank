/**
 * PortfolioSubmissionForm
 * =======================
 * Modal for completing ONE portfolio item. Renders the appropriate input
 * control based on `item.item_type` and offers "Save draft" / "Submit"
 * actions. Backed by a single UPSERT into `portfolio_submissions` keyed by
 * (item_id, student_id).
 *
 * For file items the upload happens against the `portfolio-files` Storage
 * bucket using the canonical path `{course_id}/{student_id}/{uuid}-{name}`.
 * If the DB upsert fails after a successful upload, we best-effort remove the
 * orphaned object before surfacing the error.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import type {
  StudentPortfolioItem,
  StudentPortfolioSubmission,
} from "./useStudentPortfolio";
import { FileDropzone } from "../components/FileDropzone";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { SmartDatePicker } from "../components/SmartDatePicker";
import { useToast } from "../components/Toast";
import { useFocusTrap } from "../hooks";

const STORAGE_BUCKET = "portfolio-files";
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 60 * 60;

interface PortfolioSubmissionFormProps {
  open: boolean;
  courseId: string;
  studentId: string;
  item: StudentPortfolioItem;
  existing: StudentPortfolioSubmission | null;
  onClose: () => void;
  onSaved?: () => void;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/_+/g, "_");
  return cleaned.slice(0, 180) || "file";
}

function looksLikeUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return false;
  try {
    new URL(trimmed);
    return true;
  } catch {
    return /^[\w-]+(\.[\w-]+)+(\/.*)?$/i.test(trimmed);
  }
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/** Extract optional numeric bounds from the loose `settings` object. */
function settingsNumber(
  settings: unknown,
  key: "min" | "max",
): number | null {
  if (!settings || typeof settings !== "object") return null;
  const v = (settings as Record<string, unknown>)[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Required is canonically on item.required; allow a settings.required override too. */
function isRequired(item: StudentPortfolioItem): boolean {
  if (item.required) return true;
  if (item.settings && typeof item.settings === "object") {
    const v = (item.settings as Record<string, unknown>).required;
    if (typeof v === "boolean") return v;
  }
  return false;
}

interface ValuePayload {
  value_text: string | null;
  value_url: string | null;
  value_file_path: string | null;
  value_file_size: number | null;
  value_file_mime: string | null;
  value_number: number | null;
  value_date: string | null;
  value_choice: string | null;
  value_multi_choice: string[] | null;
}

function emptyValuePayload(): ValuePayload {
  return {
    value_text: null,
    value_url: null,
    value_file_path: null,
    value_file_size: null,
    value_file_mime: null,
    value_number: null,
    value_date: null,
    value_choice: null,
    value_multi_choice: null,
  };
}

export function PortfolioSubmissionForm({
  open,
  courseId,
  studentId,
  item,
  existing,
  onClose,
  onSaved,
}: PortfolioSubmissionFormProps) {
  const [textValue, setTextValue] = useState("");
  const [urlValue, setUrlValue] = useState("");
  const [urlTouched, setUrlTouched] = useState(false);
  const [numberValue, setNumberValue] = useState("");
  const [dateValue, setDateValue] = useState("");
  const [choiceValue, setChoiceValue] = useState("");
  const [multiValue, setMultiValue] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [existingFilePath, setExistingFilePath] = useState<string | null>(null);
  const [existingFileName, setExistingFileName] = useState<string | null>(null);
  const [existingFileUrl, setExistingFileUrl] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toast = useToast();
  const required = isRequired(item);
  const minNum = settingsNumber(item.settings, "min");
  const maxNum = settingsNumber(item.settings, "max");
  const maxChars = item.settings.max_chars;

  const panelRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(panelRef, open);
  const firstFieldRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(
    null,
  );

  useEffect(() => {
    if (!open) return;
    setError(null);
    setFile(null);
    setUrlTouched(false);
    setTextValue(existing?.value_text ?? "");
    setUrlValue(existing?.value_url ?? "");
    setNumberValue(
      existing?.value_number !== null && existing?.value_number !== undefined
        ? String(existing.value_number)
        : "",
    );
    setDateValue(existing?.value_date ?? "");
    setChoiceValue(existing?.value_choice ?? "");
    setMultiValue(existing?.value_multi_choice ?? []);
    setExistingFilePath(existing?.value_file_path ?? null);
    setExistingFileName(
      existing?.value_file_path
        ? (existing.value_file_path.split("/").pop() ?? null)
        : null,
    );
    setExistingFileUrl(null);
    const id = window.setTimeout(() => firstFieldRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open, existing]);

  // Sign the existing file URL so the student can download what they previously
  // uploaded. Same TTL pattern as SubmissionDetailDrawer.
  useEffect(() => {
    if (!open) return;
    if (!existingFilePath) {
      setExistingFileUrl(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error: signErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(existingFilePath, SIGNED_URL_TTL_SECONDS);
      if (cancelled) return;
      if (!signErr && data?.signedUrl) {
        setExistingFileUrl(data.signedUrl);
      } else {
        setExistingFileUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, existingFilePath]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, busy]);

  // ---- Live validation ---------------------------------------------------
  // Returns null if valid, or a user-facing message otherwise.
  const fieldError = useMemo((): string | null => {
    switch (item.item_type) {
      case "link": {
        if (urlValue.trim().length === 0) return null;
        return looksLikeUrl(urlValue) ? null : "Please enter a valid URL.";
      }
      case "number": {
        const trimmed = numberValue.trim();
        if (trimmed.length === 0) return null;
        const n = Number(trimmed);
        if (!Number.isFinite(n)) return "Please enter a valid number.";
        if (minNum !== null && n < minNum) return `Must be ≥ ${minNum}.`;
        if (maxNum !== null && n > maxNum) return `Must be ≤ ${maxNum}.`;
        return null;
      }
      case "short_text":
      case "long_text": {
        if (maxChars !== undefined && textValue.length > maxChars) {
          return `Over the ${maxChars}-character limit.`;
        }
        return null;
      }
      default:
        return null;
    }
  }, [item.item_type, urlValue, numberValue, textValue, maxChars, minNum, maxNum]);

  // Whether the form currently passes Submit-time validation (required + field).
  const isValid = useMemo((): boolean => {
    if (fieldError) return false;
    if (!required) return true;
    switch (item.item_type) {
      case "short_text":
      case "long_text":
        return textValue.trim().length > 0;
      case "link":
        return urlValue.trim().length > 0;
      case "number":
        return numberValue.trim().length > 0;
      case "date":
        return dateValue.trim().length > 0;
      case "choice":
        return choiceValue.length > 0;
      case "multi_choice":
        return multiValue.length > 0;
      case "file":
        return file !== null || existingFilePath !== null;
      default:
        return true;
    }
  }, [
    fieldError,
    required,
    item.item_type,
    textValue,
    urlValue,
    numberValue,
    dateValue,
    choiceValue,
    multiValue,
    file,
    existingFilePath,
  ]);

  if (!open) return null;

  const toggleMulti = (option: string): void => {
    setMultiValue((prev) =>
      prev.includes(option) ? prev.filter((v) => v !== option) : [...prev, option],
    );
  };

  const buildValuePayload = async (): Promise<ValuePayload | { error: string }> => {
    const payload = emptyValuePayload();
    switch (item.item_type) {
      case "short_text":
      case "long_text":
        payload.value_text = textValue.trim() || null;
        return payload;
      case "link":
        if (urlValue.trim().length > 0) {
          if (!looksLikeUrl(urlValue)) {
            return { error: "Please enter a valid URL." };
          }
          payload.value_url = normalizeUrl(urlValue);
        }
        return payload;
      case "number": {
        const trimmed = numberValue.trim();
        if (trimmed.length > 0) {
          const n = Number(trimmed);
          if (!Number.isFinite(n)) {
            return { error: "Please enter a valid number." };
          }
          if (minNum !== null && n < minNum) {
            return { error: `Number must be ≥ ${minNum}.` };
          }
          if (maxNum !== null && n > maxNum) {
            return { error: `Number must be ≤ ${maxNum}.` };
          }
          payload.value_number = n;
        }
        return payload;
      }
      case "date":
        payload.value_date = dateValue.trim() || null;
        return payload;
      case "choice":
        payload.value_choice = choiceValue || null;
        return payload;
      case "multi_choice":
        payload.value_multi_choice = multiValue.length > 0 ? multiValue : null;
        return payload;
      case "file": {
        if (file) {
          if (file.size > MAX_FILE_BYTES) {
            return { error: "Files must be 50 MB or smaller." };
          }
          const safe = sanitizeFilename(file.name);
          const path = `${courseId}/${studentId}/${crypto.randomUUID()}-${safe}`;
          const { error: uploadError } = await supabase.storage
            .from(STORAGE_BUCKET)
            .upload(path, file, {
              contentType: file.type || undefined,
              upsert: false,
            });
          if (uploadError) {
            return { error: uploadError.message };
          }
          payload.value_file_path = path;
          payload.value_file_size = file.size;
          payload.value_file_mime = file.type || null;
        } else if (existingFilePath) {
          payload.value_file_path = existingFilePath;
          payload.value_file_size = existing?.value_file_size ?? null;
          payload.value_file_mime = existing?.value_file_mime ?? null;
        }
        return payload;
      }
      default:
        return payload;
    }
  };

  const save = async (target: "draft" | "submitted"): Promise<void> => {
    setError(null);
    setBusy(true);
    try {
      const built = await buildValuePayload();
      if ("error" in built) {
        setError(built.error);
        if (target === "draft") {
          toast.error("Couldn't save draft", built.error);
        } else {
          toast.error("Couldn't submit", built.error);
        }
        return;
      }
      // For submit, basic required check: at least one value column populated
      // when the item is required.
      if (target === "submitted" && required) {
        const hasValue =
          built.value_text !== null ||
          built.value_url !== null ||
          built.value_file_path !== null ||
          built.value_number !== null ||
          built.value_date !== null ||
          built.value_choice !== null ||
          (built.value_multi_choice !== null && built.value_multi_choice.length > 0);
        if (!hasValue) {
          const msg = "This item is required — please fill it in before submitting.";
          setError(msg);
          toast.error("Couldn't submit", msg);
          // If we just uploaded a fresh file we should clean it up to keep
          // storage tidy on a failed submit. Best-effort.
          if (
            item.item_type === "file" &&
            file &&
            built.value_file_path &&
            built.value_file_path !== existingFilePath
          ) {
            void supabase.storage
              .from(STORAGE_BUCKET)
              .remove([built.value_file_path]);
          }
          return;
        }
      }

      const submittedAt =
        target === "submitted"
          ? (existing?.submitted_at ?? new Date().toISOString())
          : null;

      const { error: upsertError } = await supabase
        .from("portfolio_submissions")
        .upsert(
          {
            item_id: item.id,
            student_id: studentId,
            status: target,
            submitted_at: submittedAt,
            ...built,
          },
          { onConflict: "item_id,student_id" },
        );

      if (upsertError) {
        // Best-effort cleanup of a fresh upload that didn't land in DB.
        if (
          item.item_type === "file" &&
          file &&
          built.value_file_path &&
          built.value_file_path !== existingFilePath
        ) {
          void supabase.storage
            .from(STORAGE_BUCKET)
            .remove([built.value_file_path]);
        }
        setError(upsertError.message);
        if (target === "draft") {
          toast.error("Couldn't save draft", upsertError.message);
        } else {
          toast.error("Couldn't submit", upsertError.message);
        }
        return;
      }

      if (target === "draft") {
        toast.success("Draft saved");
      } else {
        toast.success("Submission sent");
      }
      onSaved?.();
      onClose();
    } catch (err: unknown) {
      const msg = getErrorMessage(err, "Failed to save submission.");
      setError(msg);
      if (target === "draft") {
        toast.error("Couldn't save draft", msg);
      } else {
        toast.error("Couldn't submit", msg);
      }
    } finally {
      setBusy(false);
    }
  };

  // ---- Helpers for inline counters / errors ------------------------------
  const renderCharCounter = (current: number): React.ReactNode => {
    if (maxChars === undefined) return null;
    const over = current > maxChars;
    const approaching = !over && current >= Math.floor(maxChars * 0.8);
    const color = over
      ? "text-rose-600 dark:text-rose-400"
      : approaching
        ? "text-amber-600 dark:text-amber-400"
        : "text-slate-400 dark:text-slate-500";
    return (
      <p className={`mt-1 text-xs text-right ${color}`}>
        {current} / {maxChars}
      </p>
    );
  };

  const renderControl = (): React.ReactNode => {
    switch (item.item_type) {
      case "short_text":
        return (
          <>
            <input
              ref={(el) => {
                firstFieldRef.current = el;
              }}
              type="text"
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {renderCharCounter(textValue.length)}
            {fieldError && (
              <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{fieldError}</p>
            )}
          </>
        );
      case "long_text":
        return (
          <div className="mt-1">
            <MarkdownEditor
              value={textValue}
              onChange={setTextValue}
              characterLimit={maxChars}
              minHeight={200}
              placeholder="Write your response…"
            />
            {fieldError && (
              <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{fieldError}</p>
            )}
          </div>
        );
      case "link":
        return (
          <>
            <input
              ref={(el) => {
                firstFieldRef.current = el;
              }}
              type="text"
              value={urlValue}
              onChange={(e) => setUrlValue(e.target.value)}
              onBlur={() => setUrlTouched(true)}
              placeholder="https://…"
              className={`mt-1 w-full rounded-lg border bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 ${
                urlTouched && fieldError
                  ? "border-rose-400 dark:border-rose-700 focus:ring-rose-500"
                  : "border-slate-300 dark:border-slate-700 focus:ring-indigo-500"
              }`}
            />
            {urlTouched && fieldError && (
              <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{fieldError}</p>
            )}
          </>
        );
      case "number":
        return (
          <>
            <input
              ref={(el) => {
                firstFieldRef.current = el;
              }}
              type="number"
              inputMode="decimal"
              value={numberValue}
              onChange={(e) => setNumberValue(e.target.value)}
              min={minNum ?? undefined}
              max={maxNum ?? undefined}
              className={`mt-1 w-full rounded-lg border bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 ${
                fieldError
                  ? "border-rose-400 dark:border-rose-700 focus:ring-rose-500"
                  : "border-slate-300 dark:border-slate-700 focus:ring-indigo-500"
              }`}
            />
            {(minNum !== null || maxNum !== null) && (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {minNum !== null && maxNum !== null
                  ? `Range: ${minNum}–${maxNum}`
                  : minNum !== null
                    ? `Minimum: ${minNum}`
                    : `Maximum: ${maxNum}`}
              </p>
            )}
            {fieldError && (
              <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{fieldError}</p>
            )}
          </>
        );
      case "date": {
        // dateValue stays as YYYY-MM-DD for the payload; SmartDatePicker emits ISO.
        // Bridge with .slice(0, 10) on emit and new Date(`${ymd}T00:00:00`).toISOString() on read.
        const isoFromYmd = dateValue
          ? new Date(`${dateValue}T00:00:00`).toISOString()
          : null;
        return (
          <div className="mt-1">
            <SmartDatePicker
              value={isoFromYmd}
              onChange={(next) => setDateValue(next ? next.slice(0, 10) : "")}
            />
          </div>
        );
      }
      case "choice": {
        const options = item.settings.options ?? [];
        return (
          <div className="mt-1 space-y-2">
            {options.map((opt) => (
              <label key={opt} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="choice"
                  value={opt}
                  checked={choiceValue === opt}
                  onChange={() => setChoiceValue(opt)}
                  className="h-4 w-4"
                />
                <span className="text-sm text-slate-800 dark:text-slate-100">
                  {opt}
                </span>
              </label>
            ))}
          </div>
        );
      }
      case "multi_choice": {
        const options = item.settings.options ?? [];
        return (
          <div className="mt-1 space-y-2">
            {options.map((opt) => (
              <label key={opt} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={multiValue.includes(opt)}
                  onChange={() => toggleMulti(opt)}
                  className="h-4 w-4"
                />
                <span className="text-sm text-slate-800 dark:text-slate-100">
                  {opt}
                </span>
              </label>
            ))}
          </div>
        );
      }
      case "file":
        return (
          <div className="mt-1 space-y-2">
            {existingFileName && !file && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>
                  Current: <span className="font-mono">{existingFileName}</span>
                </span>
                {existingFileUrl && (
                  <a
                    href={existingFileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    Download
                  </a>
                )}
              </div>
            )}
            <FileDropzone
              files={file ? [file] : []}
              onChange={(files) => setFile(files[0] ?? null)}
              maxSize={MAX_FILE_BYTES}
              multiple={false}
            />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Submission for ${item.title}`}
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-slate-200 dark:ring-slate-700 p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="space-y-1">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {item.title}
          </h2>
          {item.prompt && (
            <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
              {item.prompt}
            </p>
          )}
        </header>

        {error && (
          <div
            role="alert"
            className="rounded-md bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-sm text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-900"
          >
            {error}
          </div>
        )}

        <div>
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Your response
            {required && (
              <span
                className="ml-1 text-rose-600 dark:text-rose-400"
                aria-label="required"
                title="Required"
              >
                *
              </span>
            )}
          </span>
          {renderControl()}
        </div>

        {!isValid && fieldError !== null && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Fix errors to submit
          </p>
        )}
        {!isValid && fieldError === null && required && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Fill in the required field to submit
          </p>
        )}

        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              void save("draft");
            }}
            disabled={busy}
            className="flex-1 rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium px-4 py-2.5 text-slate-700 dark:text-slate-200 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save draft"}
          </button>
          <button
            type="button"
            onClick={() => {
              void save("submitted");
            }}
            disabled={busy || !isValid}
            className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-slate-900"
          >
            {busy ? "Submitting…" : "Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}
