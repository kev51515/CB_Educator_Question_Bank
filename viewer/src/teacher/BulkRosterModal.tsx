/**
 * BulkRosterModal
 * ===============
 * Bulk-enrol students into a course. Accepts emails either via a paste
 * textarea (one per line, comma- or whitespace-separated) or via a `.csv`
 * upload. CSVs may have one column (email only) or two columns
 * (email, display name).
 *
 * Flow:
 *  1. User pastes/uploads.
 *  2. We parse rows into { email, displayName, lineNo } shapes.
 *  3. A live **preview table** classifies each row as one of:
 *       - "new"        — valid + not in current roster + not a CSV-dup
 *       - "duplicate"  — appears twice or more in the same CSV/paste
 *       - "enrolled"   — email matches an existing roster member (dedup)
 *       - "invalid"    — fails the basic email regex
 *  4. Only "new" rows get imported (serial INSERTs into `course_memberships`
 *     via a profile lookup, exactly as before).
 *  5. Dry-run toggle short-circuits step 4 entirely for "what would happen?".
 *
 * Dedup detection is opt-in via the optional `existingEmails` prop. If the
 * caller passes the current roster's emails (lowercased), we mark matches
 * with the "enrolled" status and skip them at import time. If the caller
 * doesn't supply that list, dedup falls back to "best-effort" — the import
 * loop still catches DB unique violations (`23505` → already enrolled), so
 * we never double-insert.
 *
 * Emails that don't resolve to a profile are reported back so the teacher
 * knows who still needs to sign up via the course join code.
 */
import { useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { FileDropzone } from "../components/FileDropzone";
import { useToast } from "@/components";
import { useFocusTrap } from "../hooks";

export interface BulkRosterReport {
  enrolled: string[];
  alreadyEnrolled: string[];
  notFound: string[];
  failed: { email: string; reason: string }[];
}

interface BulkRosterModalProps {
  courseId: string;
  onClose: () => void;
  onDone: (report: BulkRosterReport) => void;
  /**
   * Optional list of emails already in the course roster (lowercased).
   * When supplied, the preview table flags matches as "Already enrolled"
   * (amber) and skips them at import time. When omitted, the preview
   * still works but treats every valid row as "new"; the import loop
   * will still catch DB-side duplicates via the unique violation guard.
   */
  existingEmails?: string[];
}

type ImportTab = "paste" | "upload";

type RowStatus = "new" | "enrolled" | "duplicate" | "invalid";

interface PreviewRow {
  /** 1-based line/row number for the preview's first column. */
  lineNo: number;
  email: string;
  displayName: string | null;
  status: RowStatus;
}

interface ProfileLookupRow {
  id: string;
}

// Basic email check — same one used at the preview layer. Server still
// has the final say.
const EMAIL_RE = /^\S+@\S+\.\S+$/;

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

/**
 * Pull a flat list of {email, displayName} pairs out of pasted text.
 * Accepts any combination of whitespace, commas, and semicolons as
 * separators. Display name is NOT extracted from paste mode (no reliable
 * way to disambiguate from extra emails). Lowercases emails for dedup
 * matching.
 */
function parsePastedRows(raw: string): Array<{ email: string; displayName: string | null }> {
  const tokens = raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return tokens.map((email) => ({
    email: email.toLowerCase(),
    displayName: null,
  }));
}

/**
 * Extract rows from a CSV blob. Column 1 = email, column 2 (optional)
 * = display name. Skips a leading `email[,name]` header row. Native
 * `split(",")` keeps us free of csv-parser deps; quoted commas aren't
 * supported in v1.
 */
function parseCsvRows(text: string): Array<{ email: string; displayName: string | null }> {
  const lines = text.split(/\r?\n/);
  const rows: Array<{ email: string; displayName: string | null }> = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.trim().length === 0) continue;
    const cells = line.split(",").map((c) => c.trim());
    const firstCell = (cells[0] ?? "").toLowerCase();
    if (firstCell.length === 0) continue;
    // Skip a header row of "email" / "email,name" / etc.
    if (i === 0 && firstCell === "email") continue;
    const displayName = cells[1] && cells[1].length > 0 ? cells[1] : null;
    rows.push({ email: firstCell, displayName });
  }
  return rows;
}

/**
 * Classify each parsed row against the roster + the rest of the CSV.
 * Order matters: invalid > duplicate > enrolled > new.
 */
function classifyRows(
  raw: Array<{ email: string; displayName: string | null }>,
  existingSet: Set<string>,
): PreviewRow[] {
  const seen = new Set<string>();
  return raw.map((row, idx) => {
    const status: RowStatus = !EMAIL_RE.test(row.email)
      ? "invalid"
      : seen.has(row.email)
        ? "duplicate"
        : existingSet.has(row.email)
          ? "enrolled"
          : "new";
    if (status !== "invalid") seen.add(row.email);
    return {
      lineNo: idx + 1,
      email: row.email,
      displayName: row.displayName,
      status,
    };
  });
}

function tabBtnClass(active: boolean): string {
  return `flex-1 px-3 py-2 text-sm font-medium border-b-2 motion-safe:transition-colors ${
    active
      ? "border-indigo-600 text-indigo-700 dark:text-indigo-300"
      : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
  }`;
}

const STATUS_META: Record<
  RowStatus,
  { label: string; tooltip: string; rowClass: string; pillClass: string }
> = {
  new: {
    label: "New",
    tooltip: "Will be enrolled when you click Import.",
    rowClass: "bg-white dark:bg-slate-900",
    pillClass:
      "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 ring-slate-200 dark:ring-slate-700",
  },
  enrolled: {
    label: "Already in roster",
    tooltip: "This email is already enrolled in this course — skipped.",
    rowClass: "bg-amber-50/60 dark:bg-amber-950/30",
    pillClass:
      "bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 ring-amber-200 dark:ring-amber-800",
  },
  duplicate: {
    label: "Duplicate in CSV",
    tooltip: "This email appears earlier in the file — skipped.",
    rowClass: "bg-amber-50/60 dark:bg-amber-950/30",
    pillClass:
      "bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 ring-amber-200 dark:ring-amber-800",
  },
  invalid: {
    label: "Invalid email",
    tooltip: "This doesn't look like a valid email — skipped.",
    rowClass: "bg-rose-50/60 dark:bg-rose-950/30",
    pillClass:
      "bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200 ring-rose-200 dark:ring-rose-800",
  },
};

export function BulkRosterModal({
  courseId,
  onClose,
  onDone,
  existingEmails,
}: BulkRosterModalProps) {
  const [tab, setTab] = useState<ImportTab>("paste");
  const [pasted, setPasted] = useState<string>("");
  const [csvRaw, setCsvRaw] = useState<Array<{ email: string; displayName: string | null }>>([]);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [csvFiles, setCsvFiles] = useState<File[]>([]);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [dryRun, setDryRun] = useState<boolean>(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });
  const [report, setReport] = useState<BulkRosterReport | null>(null);
  // Emails that hit a failure in the last run — used to highlight them
  // in the preview table after a partial failure so the teacher can see
  // exactly which rows need retry.
  const [failedEmails, setFailedEmails] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const panelRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(panelRef, true);

  // Lowercase set of the existing roster, memoised so we don't rebuild
  // on every keystroke. `existingEmails` may be undefined (caller opted
  // out of dedup) — treat that as an empty set.
  const existingSet = useMemo<Set<string>>(() => {
    if (!existingEmails) return new Set();
    return new Set(existingEmails.map((e) => e.trim().toLowerCase()));
  }, [existingEmails]);

  const rawRows = useMemo<Array<{ email: string; displayName: string | null }>>(() => {
    return tab === "paste" ? parsePastedRows(pasted) : csvRaw;
  }, [tab, pasted, csvRaw]);

  const previewRows = useMemo<PreviewRow[]>(
    () => classifyRows(rawRows, existingSet),
    [rawRows, existingSet],
  );

  const counts = useMemo(() => {
    const c = { new: 0, enrolled: 0, invalid: 0, duplicate: 0 };
    for (const row of previewRows) c[row.status] += 1;
    return c;
  }, [previewRows]);

  // The list of emails we'll actually try to import — "new" rows only.
  const importableEmails = useMemo<string[]>(
    () => previewRows.filter((r) => r.status === "new").map((r) => r.email),
    [previewRows],
  );

  const onCsvFilesChange = async (files: File[]): Promise<void> => {
    setCsvError(null);
    setCsvFiles(files);
    const file = files[0];
    if (!file) {
      setCsvRaw([]);
      setCsvFileName(null);
      return;
    }
    try {
      const text = await file.text();
      const parsed = parseCsvRows(text);
      setCsvRaw(parsed);
      setCsvFileName(file.name);
      if (parsed.length === 0) {
        setCsvError("No rows found in this file.");
      }
    } catch (err: unknown) {
      setCsvError(getErrorMessage(err, "Failed to read CSV file."));
      setCsvRaw([]);
      setCsvFileName(file.name);
    }
  };

  const onImport = async (): Promise<void> => {
    if (importableEmails.length === 0) {
      setError("No new rows to import.");
      return;
    }
    setBusy(true);
    setError(null);
    setReport(null);
    setFailedEmails(new Set());
    setProgress({ done: 0, total: importableEmails.length });

    const enrolled: string[] = [];
    const alreadyEnrolled: string[] = [];
    const notFound: string[] = [];
    const failed: { email: string; reason: string }[] = [];

    try {
      // Serial processing keeps us under Supabase's per-second rate caps
      // on the free tier. The loop is intentionally not batched so the
      // progress counter stays meaningful for the teacher.
      for (const email of importableEmails) {
        try {
          const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("id")
            .eq("email", email)
            .maybeSingle();

          if (profileError) {
            failed.push({ email, reason: profileError.message });
            continue;
          }

          const found = profile as ProfileLookupRow | null;
          if (!found) {
            notFound.push(email);
            continue;
          }

          const { error: insertError } = await supabase
            .from("course_memberships")
            .insert({ course_id: courseId, student_id: found.id });

          if (!insertError) {
            enrolled.push(email);
          } else if (insertError.code === "23505") {
            // Unique violation on (course_id, student_id) — student is
            // already in this course. Surface that distinctly so the
            // teacher knows it wasn't a hard failure. This catches the
            // case where dedup wasn't supplied OR the roster changed
            // between modal open + import.
            alreadyEnrolled.push(email);
          } else {
            failed.push({ email, reason: insertError.message });
          }
        } catch (err: unknown) {
          failed.push({
            email,
            reason: getErrorMessage(err, "Unexpected error."),
          });
        } finally {
          setProgress((prev) => ({ done: prev.done + 1, total: prev.total }));
        }
      }

      const finalReport: BulkRosterReport = {
        enrolled,
        alreadyEnrolled,
        notFound,
        failed,
      };
      setReport(finalReport);
      setFailedEmails(new Set(failed.map((f) => f.email)));

      if (failed.length === 0 && enrolled.length > 0) {
        // Pure-success path: toast + auto-close so the teacher returns
        // to the People page and sees the new rows.
        toast.success(
          `Imported ${enrolled.length} student${enrolled.length === 1 ? "" : "s"}`,
          notFound.length > 0
            ? `${notFound.length} email${notFound.length === 1 ? " has" : "s have"} no account yet — share the join code.`
            : undefined,
        );
        onDone(finalReport);
      } else if (enrolled.length > 0 && failed.length > 0) {
        // Partial failure — surface counts, keep the modal open so the
        // teacher can see which rows failed (highlighted in rose).
        toast.warning(
          `Imported ${enrolled.length}, failed ${failed.length}`,
          "Failed rows are highlighted below.",
        );
        onDone(finalReport);
      } else if (enrolled.length === 0 && failed.length > 0) {
        // Full failure — error toast, keep modal open.
        toast.error(
          "Import failed",
          `${failed.length} row${failed.length === 1 ? "" : "s"} couldn't be enrolled.`,
        );
      } else {
        // Edge: nothing enrolled, nothing failed (everything was
        // not-found / already-enrolled). Still let the caller refresh.
        toast.info(
          "Nothing to import",
          `Already: ${alreadyEnrolled.length} · Not found: ${notFound.length}`,
        );
        onDone(finalReport);
      }
    } catch (err: unknown) {
      toast.error("Couldn't save", getErrorMessage(err, "Failed to bulk import."));
    } finally {
      setBusy(false);
    }
  };

  const importDisabled = busy || importableEmails.length === 0 || dryRun;

  const importLabel = busy
    ? `Importing… (${progress.done} / ${progress.total})`
    : importableEmails.length === 0
      ? "Import"
      : `Import ${importableEmails.length} new student${importableEmails.length === 1 ? "" : "s"}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-roster-title"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={busy ? undefined : onClose}
    >
      <div
        ref={panelRef}
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-slate-200 dark:ring-slate-700 p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="bulk-roster-title"
              className="text-lg font-semibold text-slate-900 dark:text-slate-100"
            >
              Bulk add students
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Paste emails or upload a CSV. We&apos;ll enroll any students who
              already have an account; the rest need to sign up via the join
              code first.
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

        <div
          role="tablist"
          aria-label="Bulk import source"
          className="flex border-b border-slate-200 dark:border-slate-700 -mb-px"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "paste"}
            onClick={() => {
              setTab("paste");
              setError(null);
            }}
            className={tabBtnClass(tab === "paste")}
          >
            Paste
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "upload"}
            onClick={() => {
              setTab("upload");
              setError(null);
            }}
            className={tabBtnClass(tab === "upload")}
          >
            Upload CSV
          </button>
        </div>

        {tab === "paste" ? (
          <div className="space-y-2">
            <textarea
              rows={6}
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder={"alice@example.com\nbob@example.com\n…"}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Detected {rawRows.length} row{rawRows.length === 1 ? "" : "s"}.
              Separate emails with whitespace, commas, or semicolons.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <span className="block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              CSV file
            </span>
            <FileDropzone
              files={csvFiles}
              onChange={(f) => {
                void onCsvFilesChange(f);
              }}
              accept=".csv,text/csv"
              multiple={false}
              disabled={busy}
            />
            {csvFileName && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {csvFileName}: {rawRows.length} row
                {rawRows.length === 1 ? "" : "s"} detected.
              </p>
            )}
            {csvError && (
              <p className="text-xs text-rose-600 dark:text-rose-400">
                {csvError}
              </p>
            )}
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Column 1: email (required). Column 2: display name (optional).
              A header row of <span className="font-mono">email</span> is
              skipped automatically.
            </p>
          </div>
        )}

        {/* Preview table */}
        {previewRows.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Preview
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                <span className="text-emerald-700 dark:text-emerald-300 font-medium">
                  {counts.new} new
                </span>
                {" · "}
                <span className="text-amber-700 dark:text-amber-300">
                  {counts.enrolled} already enrolled
                </span>
                {" · "}
                <span className="text-rose-700 dark:text-rose-300">
                  {counts.invalid} invalid
                </span>
                {" · "}
                <span className="text-amber-700 dark:text-amber-300">
                  {counts.duplicate} duplicate{counts.duplicate === 1 ? "" : "s"}
                </span>
              </p>
            </div>
            <div className="max-h-72 overflow-y-auto rounded-lg ring-1 ring-slate-200 dark:ring-slate-700">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs uppercase tracking-wide">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left w-12">
                      #
                    </th>
                    <th scope="col" className="px-3 py-2 text-left">
                      Email
                    </th>
                    <th scope="col" className="px-3 py-2 text-left">
                      Display name
                    </th>
                    <th scope="col" className="px-3 py-2 text-left w-44">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.slice(0, 50).map((row) => {
                    const meta = STATUS_META[row.status];
                    const isFailedRow = failedEmails.has(row.email);
                    return (
                      <tr
                        key={`${row.lineNo}-${row.email}`}
                        title={meta.tooltip}
                        className={`border-t border-slate-100 dark:border-slate-800 even:bg-slate-50/50 dark:even:bg-slate-800/30 ${
                          isFailedRow
                            ? "bg-rose-50 dark:bg-rose-950/40"
                            : meta.rowClass
                        }`}
                      >
                        <td className="px-3 py-2 text-slate-500 dark:text-slate-400 tabular-nums">
                          {row.lineNo}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-800 dark:text-slate-100 break-all">
                          {row.email || (
                            <span className="italic text-slate-400">
                              (empty)
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                          {row.displayName ?? (
                            <span className="text-slate-400 dark:text-slate-500">
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${meta.pillClass}`}
                          >
                            {isFailedRow ? "Failed last run" : meta.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {previewRows.length > 50 && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Showing first 50 of {previewRows.length} rows. All rows will be
                processed.
              </p>
            )}
          </div>
        )}

        {previewRows.length === 0 && (tab === "upload" ? csvFileName : pasted.trim().length > 0) && (
          <div className="rounded-md bg-slate-50 dark:bg-slate-800/60 px-3 py-4 text-center text-sm text-slate-500 dark:text-slate-400">
            No rows found.
          </div>
        )}

        {/* Dry-run toggle */}
        {previewRows.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 select-none cursor-pointer">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              disabled={busy}
              className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
            />
            <span>
              <span className="font-medium">Dry run</span>
              <span className="text-slate-500 dark:text-slate-400">
                {" "}
                — show what would happen without importing
              </span>
            </span>
          </label>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-md bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-sm text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-900"
          >
            {error}
          </div>
        )}

        {busy && progress.total > 0 && (
          <div className="space-y-1">
            <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-indigo-600 motion-safe:transition-all"
                style={{
                  width: `${
                    progress.total === 0
                      ? 0
                      : Math.round((progress.done / progress.total) * 100)
                  }%`,
                }}
              />
            </div>
            <p
              className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2"
              aria-live="polite"
            >
              <span
                className="inline-block h-3 w-3 rounded-full border-2 border-indigo-500 border-t-transparent motion-safe:animate-spin"
                aria-hidden="true"
              />
              Importing… ({progress.done} / {progress.total})
            </p>
          </div>
        )}

        {report && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <StatCard
                label="Enrolled"
                count={report.enrolled.length}
                tone="emerald"
              />
              <StatCard
                label="Already"
                count={report.alreadyEnrolled.length}
                tone="slate"
              />
              <StatCard
                label="Not found"
                count={report.notFound.length}
                tone="amber"
              />
              <StatCard
                label="Failed"
                count={report.failed.length}
                tone="rose"
              />
            </div>
            {report.notFound.length > 0 && (
              <div className="rounded-md bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-amber-800 dark:text-amber-200 ring-1 ring-amber-200 dark:ring-amber-900 text-sm">
                <p className="font-medium">
                  These emails had no account yet — share the join code so they
                  can sign up:
                </p>
                <p className="mt-1 text-xs font-mono break-all">
                  {report.notFound.join(", ")}
                </p>
              </div>
            )}
            {report.failed.length > 0 && (
              <div className="rounded-md bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-900 text-sm">
                <p className="font-medium">Failed:</p>
                <ul className="mt-1 text-xs space-y-0.5">
                  {report.failed.map((f) => (
                    <li key={f.email}>
                      <span className="font-mono">{f.email}</span>: {f.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed min-h-[40px]"
          >
            {report || dryRun ? "Close" : "Cancel"}
          </button>
          {!report && !dryRun && (
            <button
              type="button"
              onClick={() => {
                void onImport();
              }}
              disabled={importDisabled}
              aria-label={`Import ${importableEmails.length} new students`}
              title={
                importableEmails.length === 0
                  ? "No new rows to import. Add emails above."
                  : undefined
              }
              className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-2.5 text-sm min-h-[40px]"
            >
              {importLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  count: number;
  tone: "emerald" | "slate" | "amber" | "rose";
}

function StatCard({ label, count, tone }: StatCardProps) {
  const toneClasses: Record<StatCardProps["tone"], string> = {
    emerald:
      "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 ring-emerald-200 dark:ring-emerald-900",
    slate:
      "bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 ring-slate-200 dark:ring-slate-700",
    amber:
      "bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 ring-amber-200 dark:ring-amber-900",
    rose: "bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 ring-rose-200 dark:ring-rose-900",
  };
  return (
    <div
      className={`rounded-lg ring-1 px-3 py-2 ${toneClasses[tone]}`}
      aria-label={`${label}: ${count}`}
    >
      <p className="text-[10px] uppercase tracking-wide font-semibold opacity-75">
        {label}
      </p>
      <p className="text-xl font-semibold tabular-nums">{count}</p>
    </div>
  );
}
