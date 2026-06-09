/**
 * csv — tiny client-side CSV builder + download
 * =============================================
 * Shared by the Review surfaces (cross-class comparison, results heatmap) so the
 * escaping + Blob-download dance lives in exactly one place. RFC-4180 escaping:
 * a field is quoted only when it contains a comma, quote, or newline, and inner
 * quotes are doubled.
 */

type Cell = string | number | null | undefined;

/** Escape + join one row of values into a CSV line. */
export function toCsvRow(values: Cell[]): string {
  return values
    .map((v) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    })
    .join(",");
}

/** Build a CSV string from rows (first row is typically the header). */
export function toCsv(rows: Cell[][]): string {
  return rows.map(toCsvRow).join("\n");
}

/** Trigger a browser download of the given rows as `filename`. No-op in SSR. */
export function downloadCsv(filename: string, rows: Cell[][]): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
