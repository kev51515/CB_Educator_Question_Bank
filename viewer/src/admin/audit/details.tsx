/**
 * admin/audit/details
 * ===================
 * Renders the `details` JSONB payload of an audit event into a friendly table,
 * with per-action-kind formatters plus the small presentational leaf bits
 * (UuidPill / ScalarText / YesNo / RelativeTime). Extracted verbatim from
 * AdminAuditPage; the page consumes <DetailsCell>.
 */
import { useState, type ReactNode } from "react";
export function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/* -------------------------------------------------------------------------
 * Details formatter registry
 * -------------------------------------------------------------------------
 * Each known `action` has a pure formatter that maps the raw JSONB to an
 * ordered list of {label, value} rows. Formatters MUST defensively narrow
 * (`Record<string, unknown>` + per-field type guards) and return `null` if
 * the payload is unrecognisable — the renderer falls back to the raw JSON
 * view in that case.
 *
 * Payload shapes are sourced from the SQL migrations that emit them; keep
 * this in sync when new triggers / RPCs land:
 *   - 0022, 0028  → role.change, invite.mint, course.delete
 *   - 0027        → assignment.delete, material.delete, announcement.delete
 *   - 0050        → profile.delete (incl. dependent_counts)
 *   - 0056        → assignment_grade
 *   - 0062        → teacher_note_change
 *   - 0063, 0064  → portfolio_import (target_parent_id added in 0064)
 * ----------------------------------------------------------------------- */

export interface DetailRow {
  label: string;
  value: ReactNode;
}

export interface DetailFormatter {
  format: (details: unknown) => DetailRow[] | null;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function getString(rec: Record<string, unknown>, key: string): string | null {
  const v = rec[key];
  return typeof v === "string" ? v : null;
}

export function getNumber(rec: Record<string, unknown>, key: string): number | null {
  const v = rec[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function getBool(rec: Record<string, unknown>, key: string): boolean | null {
  const v = rec[key];
  return typeof v === "boolean" ? v : null;
}

export function getStringArray(
  rec: Record<string, unknown>,
  key: string,
): string[] | null {
  const v = rec[key];
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === "string") out.push(item);
  }
  return out;
}

export const DASH = (
  <span className="text-slate-400 dark:text-slate-500">—</span>
);

/**
 * Render a UUID-like string as a truncated <code>, with a full-value title
 * for hover-disclose. Strings shorter than 16 chars are rendered verbatim
 * (still inside a <code> for visual alignment with neighbouring uuids).
 */
export function UuidPill({ value }: { value: string | null | undefined }): ReactNode {
  if (!value) return DASH;
  const display =
    value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
  return (
    <code
      title={value}
      className="rounded bg-slate-100 dark:bg-slate-800 px-1 py-0.5 text-[10px] font-mono text-slate-700 dark:text-slate-300"
    >
      {display}
    </code>
  );
}

export function ScalarText({
  value,
}: {
  value: string | number | null | undefined;
}): ReactNode {
  if (value === null || value === undefined || value === "") return DASH;
  return <span>{String(value)}</span>;
}

export function YesNo({ value }: { value: boolean | null }): ReactNode {
  if (value === null) return DASH;
  return (
    <span
      className={
        value
          ? "font-medium text-emerald-700 dark:text-emerald-400"
          : "text-slate-500 dark:text-slate-400"
      }
    >
      {value ? "Yes" : "No"}
    </span>
  );
}

/**
 * Render an ISO timestamp as a relative phrase ("3 hours ago") with the
 * absolute ISO value exposed via `title=`. Falls back to the raw string if
 * the input is unparseable.
 */
export function RelativeTime({ iso }: { iso: string | null }): ReactNode {
  if (!iso) return DASH;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return <code className="text-[10px]">{iso}</code>;
  }
  return (
    <time title={date.toISOString()} dateTime={date.toISOString()}>
      {formatRelative(date)}
    </time>
  );
}

export function formatRelative(date: Date): string {
  const diffMs = date.getTime() - Date.now();
  const absSec = Math.abs(diffMs) / 1000;
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["week", 60 * 60 * 24 * 7],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
    ["second", 1],
  ];
  for (const [unit, secs] of units) {
    if (absSec >= secs || unit === "second") {
      const value = Math.round(diffMs / 1000 / secs);
      return rtf.format(value, unit);
    }
  }
  return date.toLocaleString();
}

/* ---------- Formatter implementations ---------- */

export const formatAssignmentGrade: DetailFormatter = {
  format(details) {
    const rec = asRecord(details);
    if (!rec) return null;
    const feedbackChanged = getBool(rec, "feedback_changed");
    const score = getNumber(rec, "score_override");
    const gradedAt = getString(rec, "graded_at");
    const graderId = getString(rec, "grader_id");

    // Sanity: require at least one expected field to consider this a match.
    if (
      feedbackChanged === null &&
      score === null &&
      gradedAt === null &&
      graderId === null &&
      !("score_override" in rec) &&
      !("graded_at" in rec)
    ) {
      return null;
    }

    let gradedNode: ReactNode;
    if ("graded_at" in rec && gradedAt === null) {
      gradedNode = (
        <span className="text-slate-500 dark:text-slate-400">Cleared</span>
      );
    } else {
      gradedNode = <RelativeTime iso={gradedAt} />;
    }

    return [
      { label: "Feedback changed", value: <YesNo value={feedbackChanged} /> },
      {
        label: "Score override",
        value: <ScalarText value={score} />,
      },
      { label: "Graded at", value: gradedNode },
      { label: "Grader", value: <UuidPill value={graderId} /> },
    ];
  },
};

export const formatTeacherNoteChange: DetailFormatter = {
  format(details) {
    const rec = asRecord(details);
    if (!rec) return null;
    const op = getString(rec, "op");
    const teacher = getString(rec, "teacher_id");
    const student = getString(rec, "student_id");
    const course = getString(rec, "course_id");
    if (!op && !teacher && !student && !course) return null;
    const opLabel = op
      ? op.charAt(0).toUpperCase() + op.slice(1).toLowerCase()
      : null;
    return [
      {
        label: "Operation",
        value: opLabel ? (
          <span className="font-medium">{opLabel}</span>
        ) : (
          DASH
        ),
      },
      { label: "Teacher", value: <UuidPill value={teacher} /> },
      { label: "Student", value: <UuidPill value={student} /> },
      { label: "Course", value: <UuidPill value={course} /> },
    ];
  },
};

export const formatPortfolioImport: DetailFormatter = {
  format(details) {
    const rec = asRecord(details);
    if (!rec) return null;
    const srcTpl = getString(rec, "source_template_id");
    const srcCourse = getString(rec, "source_course_id");
    const tgtCourse = getString(rec, "target_course_id");
    const importedCount = getNumber(rec, "imported_count");
    const roots = getStringArray(rec, "picked_root_ids");
    const targetParent = getString(rec, "target_parent_id");

    if (!srcTpl && !tgtCourse && importedCount === null) return null;

    const rootsNode: ReactNode =
      roots && roots.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {roots.map((id, i) => (
            <UuidPill key={`${id}-${i}`} value={id} />
          ))}
        </div>
      ) : (
        DASH
      );

    return [
      { label: "Source template", value: <UuidPill value={srcTpl} /> },
      { label: "Source course", value: <UuidPill value={srcCourse} /> },
      { label: "Target course", value: <UuidPill value={tgtCourse} /> },
      {
        label: "Items imported",
        value:
          importedCount !== null ? (
            <span className="font-medium">{importedCount}</span>
          ) : (
            DASH
          ),
      },
      {
        label: "Target parent",
        value: targetParent ? (
          <UuidPill value={targetParent} />
        ) : (
          <span className="text-slate-500 dark:text-slate-400">Root</span>
        ),
      },
      { label: "Roots picked", value: rootsNode },
    ];
  },
};

export const formatProfileDelete: DetailFormatter = {
  format(details) {
    const rec = asRecord(details);
    if (!rec) return null;
    const email = getString(rec, "email");
    const role = getString(rec, "role");
    const counts = asRecord(rec.dependent_counts);

    if (!email && !role && !counts) return null;

    const countRows: Array<{ key: string; n: number }> = [];
    if (counts) {
      for (const [key, raw] of Object.entries(counts)) {
        if (typeof raw === "number" && Number.isFinite(raw)) {
          countRows.push({ key, n: raw });
        }
      }
      countRows.sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
    }

    const countsNode: ReactNode =
      countRows.length > 0 ? (
        <table className="text-[11px] border-collapse">
          <tbody>
            {countRows.map(({ key, n }) => (
              <tr key={key}>
                <td className="pr-3 py-0.5 text-slate-500 dark:text-slate-400">
                  {key}
                </td>
                <td
                  className={
                    n > 0
                      ? "font-medium text-slate-800 dark:text-slate-200"
                      : "text-slate-400 dark:text-slate-500"
                  }
                >
                  {n}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        DASH
      );

    return [
      { label: "Email", value: <ScalarText value={email} /> },
      { label: "Role", value: <ScalarText value={role} /> },
      { label: "Dependent rows", value: countsNode },
    ];
  },
};

export const formatRoleChange: DetailFormatter = {
  format(details) {
    const rec = asRecord(details);
    if (!rec) return null;
    const from = getString(rec, "from");
    const to = getString(rec, "to");
    const email = getString(rec, "email");
    if (!from && !to && !email) return null;
    return [
      { label: "From", value: <ScalarText value={from} /> },
      { label: "To", value: <ScalarText value={to} /> },
      { label: "Email", value: <ScalarText value={email} /> },
    ];
  },
};

export const formatInviteMint: DetailFormatter = {
  format(details) {
    const rec = asRecord(details);
    if (!rec) return null;
    const note = getString(rec, "note");
    const maxUses = getNumber(rec, "max_uses");
    const expiresAt = getString(rec, "expires_at");
    if (!note && maxUses === null && !expiresAt) return null;
    return [
      { label: "Note", value: <ScalarText value={note} /> },
      { label: "Max uses", value: <ScalarText value={maxUses} /> },
      { label: "Expires at", value: <RelativeTime iso={expiresAt} /> },
    ];
  },
};

export const formatCourseDelete: DetailFormatter = {
  format(details) {
    const rec = asRecord(details);
    if (!rec) return null;
    const name = getString(rec, "name");
    const teacher = getString(rec, "teacher_id");
    if (!name && !teacher) return null;
    return [
      { label: "Name", value: <ScalarText value={name} /> },
      { label: "Teacher", value: <UuidPill value={teacher} /> },
    ];
  },
};

export const formatAssignmentDelete: DetailFormatter = {
  format(details) {
    const rec = asRecord(details);
    if (!rec) return null;
    const title = getString(rec, "title");
    const course = getString(rec, "course_id");
    if (!title && !course) return null;
    return [
      { label: "Title", value: <ScalarText value={title} /> },
      { label: "Course", value: <UuidPill value={course} /> },
    ];
  },
};

export const formatMaterialDelete: DetailFormatter = {
  format(details) {
    const rec = asRecord(details);
    if (!rec) return null;
    const title = getString(rec, "title");
    const kind = getString(rec, "kind");
    const course = getString(rec, "course_id");
    if (!title && !kind && !course) return null;
    return [
      { label: "Title", value: <ScalarText value={title} /> },
      { label: "Kind", value: <ScalarText value={kind} /> },
      { label: "Course", value: <UuidPill value={course} /> },
    ];
  },
};

export const formatAnnouncementDelete: DetailFormatter = {
  format(details) {
    const rec = asRecord(details);
    if (!rec) return null;
    const title = getString(rec, "title");
    const course = getString(rec, "course_id");
    if (!title && !course) return null;
    return [
      { label: "Title", value: <ScalarText value={title} /> },
      { label: "Course", value: <UuidPill value={course} /> },
    ];
  },
};

export const FORMATTERS: Record<string, DetailFormatter> = {
  "role.change": formatRoleChange,
  "invite.mint": formatInviteMint,
  "profile.delete": formatProfileDelete,
  "course.delete": formatCourseDelete,
  "assignment.delete": formatAssignmentDelete,
  "material.delete": formatMaterialDelete,
  "announcement.delete": formatAnnouncementDelete,
  assignment_grade: formatAssignmentGrade,
  teacher_note_change: formatTeacherNoteChange,
  portfolio_import: formatPortfolioImport,
};

/**
 * DetailsCell — renders the per-action smart view when available, with a
 * "View raw JSON" toggle that flips to a pretty-printed `<pre>` for forensic
 * inspection. Falls back to raw JSON outright when no formatter matches or
 * the formatter rejects the payload shape.
 */
export function DetailsCell({
  action,
  details,
}: {
  action: string;
  details: unknown;
}): ReactNode {
  const [showRaw, setShowRaw] = useState(false);

  if (details === null || details === undefined) {
    return DASH;
  }

  const formatter = FORMATTERS[action];
  const rows = formatter ? formatter.format(details) : null;
  const recognised = rows !== null && rows.length > 0;

  if (!recognised) {
    // Unknown / unparseable payload — keep the original <details>/<pre> shape.
    return (
      <details>
        <summary className="cursor-pointer text-indigo-600 dark:text-indigo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded">
          view
        </summary>
        <pre className="mt-1 max-w-md whitespace-pre-wrap break-words rounded bg-slate-100 dark:bg-slate-800 p-2 text-[11px] leading-snug">
          {safeStringify(details)}
        </pre>
      </details>
    );
  }

  return (
    <div className="space-y-1.5 max-w-md">
      {showRaw ? (
        <pre className="whitespace-pre-wrap break-words rounded bg-slate-100 dark:bg-slate-800 p-2 text-[11px] leading-snug">
          {safeStringify(details)}
        </pre>
      ) : (
        <table className="text-xs">
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.label}-${i}`} className="align-top">
                <td className="pr-3 py-0.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  {r.label}
                </td>
                <td className="py-0.5 text-slate-800 dark:text-slate-200">
                  {r.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button
        type="button"
        onClick={() => setShowRaw((v) => !v)}
        className="inline-flex items-center min-h-[40px] -my-2 text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
      >
        {showRaw ? "Hide raw JSON" : "View raw JSON"}
      </button>
    </div>
  );
}

/**
 * localStorage key for persisting the active course filter so an admin
 * auditing a single course doesn't have to re-pick it on every visit.
 * Stores the courses.id (uuid) as a plain string, or empty string for "All".
 */
