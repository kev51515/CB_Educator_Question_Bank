/**
 * CourseMaterialsList
 * ===================
 * Compact read-only materials list for a single course. Reusable from any
 * student-side surface that knows the course id — pass it as a prop (no URL
 * params required) so the same component can render inside a course
 * dashboard, a sidebar, or a future bottom-of-page section.
 *
 * Each row is a single anchor:
 *   - kind='file' → href = signed download URL (mints via useStudentMaterials)
 *   - kind='link' → href = the canonical URL the teacher saved
 *
 * Files open with `download` + new tab; links open in a new tab with
 * `rel=noopener noreferrer` so the student's session isn't accessible from
 * the destination.
 */
import { useStudentMaterials, type StudentMaterial } from "./useStudentMaterials";
import { SkeletonRows } from "../components/Skeleton";

interface CourseMaterialsListProps {
  courseId: string;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  const rounded = n >= 10 || i === 0 ? Math.round(n) : Math.round(n * 10) / 10;
  return `${rounded} ${units[i]}`;
}

interface RowProps {
  material: StudentMaterial;
}

function MaterialRow({ material }: RowProps) {
  const isFile = material.kind === "file";
  const href = isFile ? material.download_url : material.url;
  const disabled = !href;

  const hostname = (raw: string | null): string => {
    if (!raw) return "";
    try {
      return new URL(raw).hostname;
    } catch {
      return "";
    }
  };
  const meta = isFile ? formatBytes(material.file_size) : hostname(material.url);

  const body = (
    <>
      <span
        aria-hidden
        className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-100 dark:ring-indigo-900"
      >
        {isFile ? "📄" : "🔗"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
          {material.title}
        </span>
        {material.description && (
          <span className="mt-0.5 block text-xs text-slate-600 dark:text-slate-400 line-clamp-2 whitespace-pre-wrap">
            {material.description}
          </span>
        )}
        {meta && (
          <span className="mt-0.5 block text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {meta}
          </span>
        )}
      </span>
    </>
  );

  if (disabled || !href) {
    return (
      <li
        aria-disabled="true"
        className="flex items-start gap-3 rounded-xl bg-white/60 dark:bg-slate-900/40 ring-1 ring-slate-200 dark:ring-slate-800 px-3 py-2.5 opacity-60"
        title="Link unavailable"
      >
        {body}
      </li>
    );
  }

  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        download={isFile ? material.title : undefined}
        className="flex items-start gap-3 rounded-xl bg-white/85 dark:bg-slate-900/70 ring-1 ring-slate-200 dark:ring-slate-800 px-3 py-2.5 shadow-sm hover:ring-indigo-300 dark:hover:ring-indigo-700 hover:bg-white dark:hover:bg-slate-900 transition-colors"
      >
        {body}
      </a>
    </li>
  );
}

export function CourseMaterialsList({ courseId }: CourseMaterialsListProps) {
  const { materials, loading, error } = useStudentMaterials(courseId);

  return (
    <section aria-labelledby="course-materials-title" className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2
          id="course-materials-title"
          className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
        >
          Materials
        </h2>
        {materials.length > 0 && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {materials.length} {materials.length === 1 ? "item" : "items"}
          </span>
        )}
      </div>

      {loading ? (
        <div className="py-2">
          <SkeletonRows count={4} />
        </div>
      ) : error ? (
        <div
          role="alert"
          className="rounded-xl bg-rose-50 dark:bg-rose-950/40 ring-1 ring-rose-200 dark:ring-rose-900 px-4 py-3 text-sm text-rose-700 dark:text-rose-300"
        >
          {error}
        </div>
      ) : materials.length === 0 ? (
        <div className="rounded-2xl bg-white/70 dark:bg-slate-900/50 ring-1 ring-dashed ring-slate-300 dark:ring-slate-700 px-6 py-6 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No materials posted yet.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {materials.map((m) => (
            <MaterialRow key={m.id} material={m} />
          ))}
        </ul>
      )}
    </section>
  );
}
