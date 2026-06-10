/**
 * FileDropzone
 * ============
 * Controlled multi-file dropzone with native HTML5 drag-and-drop. No deps.
 *
 * The parent owns the `files` array — this component is purely controlled, so
 * upload state, retries, and persistence are all parent concerns. We do the
 * lightweight client-side filtering (size cap, MIME `accept` filter) here so
 * the parent gets a known-good list, plus per-row inline errors for items the
 * user dragged in but that we refused to accept.
 *
 * The `accept` matcher mirrors the semantics of the HTML `<input accept="">`
 * attribute: comma-separated entries, each either a concrete MIME (`image/png`),
 * a wildcard family (`image/*`), or an extension (`.pdf`).
 *
 * Progress, if supplied via `progress`, is keyed by `file.name` and rendered
 * as a thin bar under the row. Callers that upload multiple files with the
 * same filename should disambiguate before calling — name collisions will
 * collapse onto a single progress value.
 */
import { useCallback, useId, useRef, useState } from "react";
import type { ChangeEvent, DragEvent as ReactDragEvent, ReactElement } from "react";

export interface FileDropzoneProps {
  files: File[];
  onChange: (files: File[]) => void;
  /** Comma-separated MIME types and/or extensions, e.g. "application/pdf,image/*,.zip". */
  accept?: string;
  /** Per-file byte cap. Defaults to 50 MB. */
  maxSize?: number;
  /** When false, dropping a new file replaces the current selection. */
  multiple?: boolean;
  disabled?: boolean;
  /** Optional upload progress per filename, range 0–100. */
  progress?: Record<string, number>;
}

const DEFAULT_MAX_SIZE = 50 * 1024 * 1024;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function iconFor(mime: string): ReactElement {
  const svgProps = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (mime === "application/pdf") {
    // Document
    return (
      <svg {...svgProps}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    );
  }
  if (mime.startsWith("image/")) {
    // Image
    return (
      <svg {...svgProps}>
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
    );
  }
  // Generic package/file
  return (
    <svg {...svgProps}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

/**
 * Mirror the HTML `<input accept>` matching rules. Empty/undefined accept
 * means "accept anything".
 */
function matchesAccept(file: File, accept: string | undefined): boolean {
  if (!accept) return true;
  const tokens = accept
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return true;
  const mime = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  for (const token of tokens) {
    if (token.startsWith(".")) {
      if (name.endsWith(token)) return true;
    } else if (token.endsWith("/*")) {
      const family = token.slice(0, -1); // keep trailing "/"
      if (mime.startsWith(family)) return true;
    } else if (mime === token) {
      return true;
    }
  }
  return false;
}

interface RejectedFile {
  file: File;
  reason: string;
}

interface FileDropzoneState {
  isDragOver: boolean;
  rejected: RejectedFile[];
}

export function FileDropzone({
  files,
  onChange,
  accept,
  maxSize = DEFAULT_MAX_SIZE,
  multiple = true,
  disabled = false,
  progress,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const inputId = useId();
  const [state, setState] = useState<FileDropzoneState>({
    isDragOver: false,
    rejected: [],
  });
  // Track nested dragenter/leave so we don't flicker when the cursor crosses
  // child elements within the drop area.
  const dragDepthRef = useRef(0);

  const partition = useCallback(
    (incoming: File[]): { accepted: File[]; rejected: RejectedFile[] } => {
      const accepted: File[] = [];
      const rejected: RejectedFile[] = [];
      for (const f of incoming) {
        if (!matchesAccept(f, accept)) {
          rejected.push({ file: f, reason: "Unsupported file type." });
          continue;
        }
        if (f.size > maxSize) {
          rejected.push({
            file: f,
            reason: `Too large (max ${formatSize(maxSize)}).`,
          });
          continue;
        }
        accepted.push(f);
      }
      return { accepted, rejected };
    },
    [accept, maxSize],
  );

  const ingest = useCallback(
    (incoming: File[]): void => {
      if (disabled) return;
      const { accepted, rejected } = partition(incoming);
      if (accepted.length > 0) {
        if (!multiple) {
          onChange([accepted[0]]);
        } else {
          // De-dupe by name+size+lastModified — same heuristic Finder uses.
          const seen = new Set(
            files.map((f) => `${f.name}|${f.size}|${f.lastModified}`),
          );
          const fresh = accepted.filter(
            (f) => !seen.has(`${f.name}|${f.size}|${f.lastModified}`),
          );
          onChange([...files, ...fresh]);
        }
      }
      setState((s) => ({ ...s, rejected }));
    },
    [disabled, partition, multiple, onChange, files],
  );

  const onDragEnter = useCallback(
    (e: ReactDragEvent<HTMLElement>): void => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      dragDepthRef.current += 1;
      setState((s) => ({ ...s, isDragOver: true }));
    },
    [disabled],
  );

  const onDragOver = useCallback(
    (e: ReactDragEvent<HTMLElement>): void => {
      if (disabled) return;
      // preventDefault is mandatory for the drop event to fire.
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    },
    [disabled],
  );

  const onDragLeave = useCallback(
    (e: ReactDragEvent<HTMLElement>): void => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setState((s) => ({ ...s, isDragOver: false }));
      }
    },
    [disabled],
  );

  const onDrop = useCallback(
    (e: ReactDragEvent<HTMLElement>): void => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      dragDepthRef.current = 0;
      setState((s) => ({ ...s, isDragOver: false }));
      const list = e.dataTransfer?.files;
      if (!list || list.length === 0) return;
      ingest(Array.from(list));
    },
    [disabled, ingest],
  );

  const onInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>): void => {
      const list = e.target.files;
      if (!list || list.length === 0) return;
      ingest(Array.from(list));
      // Reset so picking the same file twice in a row still fires onChange.
      e.target.value = "";
    },
    [ingest],
  );

  const removeAt = useCallback(
    (idx: number): void => {
      const next = files.slice();
      next.splice(idx, 1);
      onChange(next);
    },
    [files, onChange],
  );

  const openPicker = useCallback((): void => {
    if (disabled) return;
    inputRef.current?.click();
  }, [disabled]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>): void => {
      if (disabled) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openPicker();
      }
    },
    [disabled, openPicker],
  );

  const dropAreaClass = [
    "relative flex flex-col items-center justify-center gap-2",
    "rounded-xl border-2 border-dashed",
    "px-6 py-8 text-center transition-colors cursor-pointer select-none",
    state.isDragOver
      ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30"
      : "border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 hover:border-slate-400 dark:hover:border-slate-600",
    disabled ? "opacity-60 cursor-not-allowed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-label="File drop area"
        className={`${dropAreaClass} focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950`}
        onClick={openPicker}
        onKeyDown={onKeyDown}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={
            state.isDragOver
              ? "text-indigo-600 dark:text-indigo-300"
              : "text-slate-400 dark:text-slate-500"
          }
          aria-hidden="true"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
          {state.isDragOver ? "Drop to add" : "Drag files here"}
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400">
          or{" "}
          <span className="text-indigo-600 dark:text-indigo-300 underline">
            click to browse
          </span>
        </div>
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          className="sr-only"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          onChange={onInputChange}
          // Stop the click bubbling back to the role=button parent, which
          // would re-open the picker in some browsers.
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {files.length > 0 && (
        <ul className="space-y-1.5" aria-label="Selected files">
          {files.map((f, idx) => {
            const pct = progress?.[f.name];
            const showProgress = typeof pct === "number" && pct > 0 && pct < 100;
            return (
              <li
                key={`${f.name}-${f.size}-${f.lastModified}-${idx}`}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex items-center justify-center text-slate-500 dark:text-slate-400"
                    aria-hidden="true"
                  >
                    {iconFor(f.type)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-slate-800 dark:text-slate-100">
                      {f.name}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {formatSize(f.size)}
                      {typeof pct === "number" && pct >= 100 ? " · uploaded" : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeAt(idx)}
                    disabled={disabled}
                    aria-label={`Remove ${f.name}`}
                    className="rounded-md px-2 py-1 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
                  >
                    ×
                  </button>
                </div>
                {showProgress && (
                  <div
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={pct}
                    className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
                  >
                    <div
                      className="h-full bg-indigo-500 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {state.rejected.length > 0 && (
        <ul className="space-y-1" aria-label="Rejected files">
          {state.rejected.map((r, idx) => (
            <li
              key={`rej-${r.file.name}-${idx}`}
              className="text-xs text-rose-600 dark:text-rose-400"
            >
              <span className="font-medium">{r.file.name}</span>: {r.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
