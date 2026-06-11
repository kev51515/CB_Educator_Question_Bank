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
import { supabase } from "@/lib/supabase";
import type {
  StudentPortfolioItem,
  StudentPortfolioSubmission,
} from "./useStudentPortfolio";
import { FileDropzone } from "@/components/FileDropzone";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { SmartDatePicker } from "@/components/SmartDatePicker";
import { useToast } from "@/components/Toast";
import { ResponsiveModal } from "@/components";
import {
  STORAGE_BUCKET,
  MAX_FILE_BYTES,
  SIGNED_URL_TTL_SECONDS,
  AUTOSAVE_DEBOUNCE_MS,
  AUTOSAVE_STALE_MS,
  draftKey,
  readDraft,
  writeDraft,
  clearDraft,
  draftHasContent,
  formatRelative,
  getErrorMessage,
  sanitizeFilename,
  looksLikeUrl,
  normalizeUrl,
  settingsNumber,
  isRequired,
  emptyValuePayload,
  type LocalDraft,
  type ValuePayload,
} from "./portfolio-form/helpers";

interface PortfolioSubmissionFormProps {
  open: boolean;
  courseId: string;
  studentId: string;
  item: StudentPortfolioItem;
  existing: StudentPortfolioSubmission | null;
  onClose: () => void;
  onSaved?: () => void;
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

  // ---- Autosave state ----------------------------------------------------
  type AutosaveStatus = "idle" | "typing" | "saved" | "error";
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const [recoverDraft, setRecoverDraft] = useState<LocalDraft | null>(null);
  // Toggle false during real Submit/SaveDraft to prevent autosave double-writes.
  const autosaveEnabledRef = useRef<boolean>(false);
  // Track the latest pending draft so the unmount cleanup can flush it.
  const pendingDraftRef = useRef<LocalDraft | null>(null);
  // Suppress the storage-event listener for our own writes.
  const ownWriteAtRef = useRef<number>(0);

  const key = draftKey(item.id, studentId);

  const toast = useToast();
  const required = isRequired(item);
  const minNum = settingsNumber(item.settings, "min");
  const maxNum = settingsNumber(item.settings, "max");
  const maxChars = item.settings.max_chars;

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

    // ---- Autosave bootstrap on open ------------------------------------
    autosaveEnabledRef.current = false;
    pendingDraftRef.current = null;
    setAutosaveStatus("idle");
    setLastSavedAt(null);
    setRecoverDraft(null);

    const stored = readDraft(key);
    if (stored) {
      const age = Date.now() - new Date(stored.savedAt).getTime();
      if (!Number.isFinite(age) || age > AUTOSAVE_STALE_MS) {
        // Stale → discard silently.
        clearDraft(key);
      } else if (draftHasContent(stored)) {
        // If a server submission exists and is newer than the draft, keep
        // server state and discard the local draft. Otherwise prompt to
        // recover. `existing.updated_at` is reliable here.
        const serverIso = existing?.updated_at ?? null;
        const serverNewer =
          serverIso !== null &&
          new Date(serverIso).getTime() >= new Date(stored.savedAt).getTime();
        if (serverNewer) {
          clearDraft(key);
        } else {
          setRecoverDraft(stored);
        }
      } else {
        clearDraft(key);
      }
    }

    // Defer enabling autosave by a tick so the bootstrap state writes above
    // don't immediately fire the debounced writer.
    const enableId = window.setTimeout(() => {
      autosaveEnabledRef.current = true;
    }, 0);

    return () => {
      window.clearTimeout(enableId);
      autosaveEnabledRef.current = false;
    };
  }, [open, existing, key]);

  // ---- Autosave: debounced write -----------------------------------------
  useEffect(() => {
    if (!open) return;
    if (!autosaveEnabledRef.current) return;
    if (busy) return;
    if (recoverDraft) return; // Don't autosave while the recover banner is up.

    const draft: LocalDraft = {
      savedAt: new Date().toISOString(),
      textValue,
      urlValue,
      numberValue,
      dateValue,
      choiceValue,
      multiValue,
    };

    if (!draftHasContent(draft)) {
      // Nothing meaningful to persist; also clean any prior empty record.
      pendingDraftRef.current = null;
      return;
    }

    pendingDraftRef.current = draft;
    setAutosaveStatus("typing");

    const id = window.setTimeout(() => {
      // Stamp at the moment of actual write so "Saved {relative}" is accurate.
      const toWrite: LocalDraft = {
        ...draft,
        savedAt: new Date().toISOString(),
      };
      ownWriteAtRef.current = Date.now();
      const ok = writeDraft(key, toWrite);
      if (ok) {
        pendingDraftRef.current = null;
        setLastSavedAt(toWrite.savedAt);
        setAutosaveStatus("saved");
      } else {
        setAutosaveStatus("error");
      }
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(id);
    };
  }, [
    open,
    busy,
    recoverDraft,
    key,
    textValue,
    urlValue,
    numberValue,
    dateValue,
    choiceValue,
    multiValue,
  ]);

  // ---- Autosave: flush on unmount / close --------------------------------
  // If a save is still pending (user typed within the last debounce window)
  // when the form unmounts or closes, write it through synchronously so we
  // don't lose the last keystrokes.
  useEffect(() => {
    if (!open) return;
    return () => {
      const pending = pendingDraftRef.current;
      if (pending && draftHasContent(pending)) {
        ownWriteAtRef.current = Date.now();
        writeDraft(key, {
          ...pending,
          savedAt: new Date().toISOString(),
        });
      }
      pendingDraftRef.current = null;
    };
  }, [open, key]);

  // ---- Autosave: tick the "saved {relative}" label every 15s -------------
  useEffect(() => {
    if (!open) return;
    if (autosaveStatus !== "saved") return;
    const id = window.setInterval(() => setNowTick(Date.now()), 15000);
    return () => window.clearInterval(id);
  }, [open, autosaveStatus, lastSavedAt]);

  // ---- Autosave: cross-tab sync via the storage event --------------------
  useEffect(() => {
    if (!open) return;
    const onStorage = (e: StorageEvent): void => {
      if (e.key !== key) return;
      // Ignore the echo of our own write.
      if (Date.now() - ownWriteAtRef.current < 250) return;
      if (e.newValue === null) {
        // Another tab discarded — leave local state alone but reset indicator.
        setAutosaveStatus("idle");
        setLastSavedAt(null);
        return;
      }
      const incoming = readDraft(key);
      if (!incoming) return;
      // Last-write-wins: adopt the other tab's content.
      setTextValue(incoming.textValue);
      setUrlValue(incoming.urlValue);
      setNumberValue(incoming.numberValue);
      setDateValue(incoming.dateValue);
      setChoiceValue(incoming.choiceValue);
      setMultiValue(incoming.multiValue);
      setLastSavedAt(incoming.savedAt);
      setAutosaveStatus("saved");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [open, key]);

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

  const handleRestoreDraft = (): void => {
    if (!recoverDraft) return;
    setTextValue(recoverDraft.textValue);
    setUrlValue(recoverDraft.urlValue);
    setNumberValue(recoverDraft.numberValue);
    setDateValue(recoverDraft.dateValue);
    setChoiceValue(recoverDraft.choiceValue);
    setMultiValue(recoverDraft.multiValue);
    setLastSavedAt(recoverDraft.savedAt);
    setAutosaveStatus("saved");
    setRecoverDraft(null);
    // Allow the debounced writer to resume now that the user has confirmed.
    autosaveEnabledRef.current = true;
  };

  const handleDiscardDraft = (): void => {
    ownWriteAtRef.current = Date.now();
    clearDraft(key);
    setRecoverDraft(null);
    setLastSavedAt(null);
    setAutosaveStatus("idle");
    autosaveEnabledRef.current = true;
  };

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
    // Pause autosave during the network write so we don't race with the
    // success-path cleanup below.
    autosaveEnabledRef.current = false;
    pendingDraftRef.current = null;
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
      // Success → server is now the source of truth; clear the local draft.
      ownWriteAtRef.current = Date.now();
      clearDraft(key);
      setLastSavedAt(null);
      setAutosaveStatus("idle");
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
      // Failure → keep the local draft so the student can retry without
      // losing their work, and re-enable autosave for future edits.
      autosaveEnabledRef.current = true;
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
              data-autofocus
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
              data-autofocus
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
              data-autofocus
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
    <ResponsiveModal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      dismissible={!busy}
      title={item.title}
      subtitle={
        item.prompt ? (
          <span className="whitespace-pre-wrap">{item.prompt}</span>
        ) : undefined
      }
      size="lg"
      footer={
        <div className="flex items-center gap-2">
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
      }
    >
      <div className="space-y-4">
        {error && (
          <div
            role="alert"
            className="rounded-md bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-sm text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-900"
          >
            {error}
          </div>
        )}

        {recoverDraft && (
          <div
            role="status"
            className="rounded-md bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-900 dark:text-amber-200 ring-1 ring-amber-200 dark:ring-amber-900/60"
          >
            <p>
              We found an unsaved draft from{" "}
              <span className="font-medium">
                {formatRelative(recoverDraft.savedAt, nowTick)}
              </span>
              . Restore it?
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={handleRestoreDraft}
                className="min-h-[40px] rounded-md bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
              >
                Restore
              </button>
              <button
                type="button"
                onClick={handleDiscardDraft}
                className="min-h-[40px] rounded-md ring-1 ring-amber-300 dark:ring-amber-700 bg-white dark:bg-slate-900 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-amber-800 dark:text-amber-200 text-sm font-medium px-3 py-2"
              >
                Discard
              </button>
            </div>
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

        <p
          aria-live="polite"
          className="text-xs italic text-slate-500 dark:text-slate-400 motion-safe:transition-opacity"
        >
          {autosaveStatus === "typing" && "Saving…"}
          {autosaveStatus === "saved" &&
            lastSavedAt &&
            `Draft saved ${formatRelative(lastSavedAt, nowTick)}`}
          {autosaveStatus === "error" && (
            <span className="text-rose-600 dark:text-rose-400">
              Couldn&apos;t save draft — try again later
            </span>
          )}
          {autosaveStatus === "idle" && " "}
        </p>

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
      </div>
    </ResponsiveModal>
  );
}
