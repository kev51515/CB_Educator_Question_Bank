/**
 * bulk-roster/helpers
 * ===================
 * Pure parsing/classification for the bulk roster import: row types, email
 * regex, paste/CSV parsers, row classifier, tab button class, and status
 * metadata. Extracted verbatim from BulkRosterModal. No JSX.
 */
export type ImportTab = "paste" | "upload";

export type RowStatus = "new" | "enrolled" | "duplicate" | "invalid";

export interface PreviewRow {
  /** 1-based line/row number for the preview's first column. */
  lineNo: number;
  email: string;
  displayName: string | null;
  status: RowStatus;
}

export interface ProfileLookupRow {
  id: string;
}

// Basic email check — same one used at the preview layer. Server still
// has the final say.
export const EMAIL_RE = /^\S+@\S+\.\S+$/;

export function getErrorMessage(error: unknown, fallback: string): string {
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
export function parsePastedRows(raw: string): Array<{ email: string; displayName: string | null }> {
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
export function parseCsvRows(text: string): Array<{ email: string; displayName: string | null }> {
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
export function classifyRows(
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

export function tabBtnClass(active: boolean): string {
  return `flex-1 px-3 py-2 text-sm font-medium border-b-2 motion-safe:transition-colors ${
    active
      ? "border-indigo-600 text-indigo-700 dark:text-indigo-300"
      : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
  }`;
}

export const STATUS_META: Record<
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

