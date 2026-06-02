/**
 * BulkRosterModal
 * ===============
 * Bulk-enrol students into a course. Accepts emails either via a paste
 * textarea (one per line, comma- or whitespace-separated) or via a `.csv`
 * upload (first column of each row is treated as the email).
 *
 * For each email we look up the matching `profiles` row, then INSERT a
 * `course_memberships` row. We process serially because Supabase's free
 * tier is sensitive to bursts; the modal renders live progress so the
 * teacher can see the import advance.
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
}

type ImportTab = "paste" | "upload";

interface ProfileLookupRow {
  id: string;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

/**
 * Pull a flat list of emails out of pasted text. Accepts any combination of
 * whitespace, commas, and semicolons as separators, lowercases, and dedupes.
 */
function parsePastedEmails(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\s,;]+/)
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0 && s.includes("@")),
    ),
  );
}

/**
 * Extract emails from a CSV blob. Takes the first column of each non-empty
 * line (after stripping a possible "email" header row). Native split keeps
 * us free of csv-parser deps; this is intentionally minimal — fancy CSVs
 * (quoted commas, escaping) aren't supported in v1.
 */
function parseCsvEmails(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const emails: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const firstCell = line.split(",")[0]?.trim().toLowerCase() ?? "";
    if (firstCell.length === 0) continue;
    if (i === 0 && firstCell === "email") continue;
    if (!firstCell.includes("@")) continue;
    emails.push(firstCell);
  }
  return Array.from(new Set(emails));
}

function tabBtnClass(active: boolean): string {
  return `flex-1 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
    active
      ? "border-indigo-600 text-indigo-700 dark:text-indigo-300"
      : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
  }`;
}

export function BulkRosterModal({
  courseId,
  onClose,
  onDone,
}: BulkRosterModalProps) {
  const [tab, setTab] = useState<ImportTab>("paste");
  const [pasted, setPasted] = useState<string>("");
  const [csvEmails, setCsvEmails] = useState<string[]>([]);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [csvFiles, setCsvFiles] = useState<File[]>([]);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });
  const [report, setReport] = useState<BulkRosterReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const panelRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(panelRef, true);

  const emails = useMemo<string[]>(() => {
    return tab === "paste" ? parsePastedEmails(pasted) : csvEmails;
  }, [tab, pasted, csvEmails]);

  const onCsvFilesChange = async (files: File[]): Promise<void> => {
    setCsvError(null);
    setCsvFiles(files);
    const file = files[0];
    if (!file) {
      setCsvEmails([]);
      setCsvFileName(null);
      return;
    }
    try {
      const text = await file.text();
      const parsed = parseCsvEmails(text);
      setCsvEmails(parsed);
      setCsvFileName(file.name);
      if (parsed.length === 0) {
        setCsvError("No email addresses found in this file.");
      }
    } catch (err: unknown) {
      setCsvError(getErrorMessage(err, "Failed to read CSV file."));
      setCsvEmails([]);
      setCsvFileName(file.name);
    }
  };

  const onImport = async (): Promise<void> => {
    if (emails.length === 0) {
      setError("Add at least one email address.");
      return;
    }
    setBusy(true);
    setError(null);
    setReport(null);
    setProgress({ done: 0, total: emails.length });

    const enrolled: string[] = [];
    const alreadyEnrolled: string[] = [];
    const notFound: string[] = [];
    const failed: { email: string; reason: string }[] = [];

    try {
      // Serial processing keeps us under Supabase's per-second rate caps on
      // the free tier. The loop is intentionally not batched so the progress
      // counter stays meaningful for the teacher.
      for (const email of emails) {
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
            // teacher knows it wasn't a hard failure.
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
      if (enrolled.length > 0) {
        toast.success(
          `Imported ${enrolled.length} student${enrolled.length === 1 ? "" : "s"}`,
          `Already: ${alreadyEnrolled.length} · Not found: ${notFound.length} · Failed: ${failed.length}`,
        );
        onDone(finalReport);
      }
    } catch (err: unknown) {
      toast.error("Couldn't save", getErrorMessage(err, "Failed to bulk import."));
    } finally {
      setBusy(false);
    }
  };

  const importDisabled = busy || emails.length === 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Bulk add students"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={busy ? undefined : onClose}
    >
      <div
        ref={panelRef}
        className="w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-slate-200 dark:ring-slate-700 p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Bulk add students
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Paste emails or upload a CSV. We'll enroll any students who already
              have an account; the rest need to sign up via the join code first.
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
              rows={10}
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder={"alice@example.com\nbob@example.com\n…"}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Detected {emails.length} email{emails.length === 1 ? "" : "s"}.
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
                {csvFileName}: {emails.length} email
                {emails.length === 1 ? "" : "s"} detected.
              </p>
            )}
            {csvError && (
              <p className="text-xs text-rose-600 dark:text-rose-400">
                {csvError}
              </p>
            )}
            <p className="text-xs text-slate-500 dark:text-slate-400">
              First column of each row is treated as the email address. A
              header row of "email" is skipped automatically.
            </p>
          </div>
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
                className="h-full bg-indigo-600 transition-all"
                style={{
                  width: `${
                    progress.total === 0
                      ? 0
                      : Math.round((progress.done / progress.total) * 100)
                  }%`,
                }}
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Processed {progress.done} of {progress.total}
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
                  These emails had no account yet — share the join code so
                  they can sign up:
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
            className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {report ? "Close" : "Cancel"}
          </button>
          {!report && (
            <button
              type="button"
              onClick={() => {
                void onImport();
              }}
              disabled={importDisabled}
              className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-2.5 text-sm"
            >
              {busy ? "Importing…" : "Import"}
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
