/**
 * MyClassesPanel
 * ==============
 * Compact panel listing the courses a student belongs to. Rendered inside
 * AreaSelector. Stays out of the way when the student has no courses yet
 * (shows a soft empty state instead of nothing). Rows are read-only +
 * tappable to open the course: students CANNOT leave a course themselves
 * (too many accidental drops). Enrolment is managed by the teacher — to
 * remove a student, the teacher uses the roster.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useStudentClasses, type StudentClass } from "./useStudentClasses";
import { SkeletonRows } from "@/components/Skeleton";
import { studentCoursePath } from "@/lib/routes";
import { JoinClassModal } from "./JoinClassModal";

type SortKey = "recent" | "oldest" | "name";

const SORT_STORAGE_PREFIX = "student.myClassesPanel.sort:";

interface PersistedSort {
  sort: SortKey;
}

const SORT_OPTIONS: ReadonlyArray<{ key: SortKey; label: string }> = [
  { key: "recent", label: "Most recent" },
  { key: "oldest", label: "Oldest joined" },
  { key: "name", label: "Course name" },
];

function isSortKey(value: unknown): value is SortKey {
  return value === "recent" || value === "oldest" || value === "name";
}

function sortStorageKey(userId: string): string {
  return `${SORT_STORAGE_PREFIX}${userId}`;
}

function readSort(userId: string | null): SortKey {
  if (!userId) return "recent";
  try {
    const raw = localStorage.getItem(sortStorageKey(userId));
    if (!raw) return "recent";
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "sort" in parsed &&
      isSortKey((parsed as PersistedSort).sort)
    ) {
      return (parsed as PersistedSort).sort;
    }
    return "recent";
  } catch {
    return "recent";
  }
}

function writeSort(userId: string | null, sort: SortKey): void {
  if (!userId) return;
  try {
    const payload: PersistedSort = { sort };
    localStorage.setItem(sortStorageKey(userId), JSON.stringify(payload));
  } catch {
    // Quota or disabled storage: silently ignore — sort still works in-session.
  }
}

function sortClasses(classes: StudentClass[], sort: SortKey): StudentClass[] {
  const copy = [...classes];
  if (sort === "name") {
    copy.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    return copy;
  }
  // recent / oldest both operate on joined_at
  copy.sort((a, b) => {
    const aTime = Date.parse(a.joined_at);
    const bTime = Date.parse(b.joined_at);
    const aSafe = Number.isFinite(aTime) ? aTime : 0;
    const bSafe = Number.isFinite(bTime) ? bTime : 0;
    return sort === "oldest" ? aSafe - bSafe : bSafe - aSafe;
  });
  return copy;
}

interface MyClassesPanelProps {
  /**
   * Bump this number to force a refetch after a successful join. The parent
   * doesn't need to know how the panel fetches — just nudge the counter.
   */
  refreshToken?: number;
}

interface ClassRowProps {
  cls: StudentClass;
  onOpen: () => void;
}

function ClassRow({ cls, onOpen }: ClassRowProps) {
  return (
    <li className="rounded-xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 flex items-stretch justify-between gap-1 overflow-hidden">
      <button
        type="button"
        onClick={onOpen}
        className="flex-1 min-w-0 min-h-[40px] text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-inset"
        aria-label={`Open course ${cls.name}`}
      >
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
          {cls.name}
        </p>
        {cls.teacher_display_name && (
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
            {cls.teacher_display_name}
          </p>
        )}
      </button>
      {/* Read-only status. Students can't leave a course themselves — the
          teacher manages enrolment from the roster. */}
      <div className="flex items-center shrink-0 px-4">
        <span className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Enrolled
        </span>
      </div>
    </li>
  );
}

export function MyClassesPanel({ refreshToken }: MyClassesPanelProps) {
  const { classes, loading, error, refresh } = useStudentClasses();
  const [userId, setUserId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("recent");
  const [showJoinModal, setShowJoinModal] = useState(false);
  const hydratedRef = useRef(false);
  const navigate = useNavigate();

  // Why: react only to the refresh token, not to the `refresh` callback's
  // identity. The hook's own initial fetch handles the first load.
  useEffect(() => {
    if (refreshToken === undefined) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  // Resolve user id once to scope the sort preference per account.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (cancelled) return;
        const uid = data.user?.id ?? null;
        setUserId(uid);
        setSort(readSort(uid));
        hydratedRef.current = true;
      } catch {
        if (!cancelled) hydratedRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist sort changes after hydration so we don't stomp the saved value on mount.
  useEffect(() => {
    if (!hydratedRef.current) return;
    writeSort(userId, sort);
  }, [userId, sort]);

  const sortedClasses = useMemo(() => sortClasses(classes, sort), [classes, sort]);

  return (
    <>
      <section
        aria-labelledby="my-classes-title"
        className="rounded-2xl bg-white/60 dark:bg-slate-900/40 ring-1 ring-slate-200 dark:ring-slate-800 p-5"
      >
        <header className="mb-3 flex items-center justify-between gap-3">
          <h3
            id="my-classes-title"
            className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
          >
            My courses
          </h3>
          <div className="flex items-center gap-3">
            {classes.length > 0 && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {classes.length} enrolled
              </span>
            )}
            {!loading && !error && classes.length > 0 && (
              <SortDropdown sort={sort} onChange={setSort} />
            )}
          </div>
        </header>

        {loading ? (
          <SkeletonRows count={4} />
        ) : error ? (
          <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        ) : classes.length === 0 ? (
          <EmptyClassesState onJoin={() => setShowJoinModal(true)} />
        ) : (
          <ul className="space-y-2">
            {sortedClasses.map((cls) => (
              <ClassRow
                key={cls.id}
                cls={cls}
                onOpen={() => navigate(studentCoursePath(cls.short_code ?? cls.id))}
              />
            ))}
          </ul>
        )}
      </section>

      <JoinClassModal
        open={showJoinModal}
        onClose={() => setShowJoinModal(false)}
        onJoined={() => {
          setShowJoinModal(false);
          void refresh();
        }}
      />
    </>
  );
}

interface SortDropdownProps {
  sort: SortKey;
  onChange: (next: SortKey) => void;
}

function SortDropdown({ sort, onChange }: SortDropdownProps) {
  return (
    <label className="relative flex items-center text-xs">
      <span className="sr-only">Sort classes</span>
      <select
        aria-label="Sort classes"
        value={sort}
        onChange={(e) => {
          const next = e.target.value;
          if (isSortKey(next)) onChange(next);
        }}
        className="appearance-none rounded-md bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-700 pl-2 pr-7 py-1.5 min-h-[40px] text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 motion-safe:transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.key} value={opt.key}>
            {opt.label}
          </option>
        ))}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className="pointer-events-none absolute right-2 h-4 w-4 text-slate-500 dark:text-slate-400"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
          clipRule="evenodd"
        />
      </svg>
    </label>
  );
}

interface EmptyClassesStateProps {
  onJoin: () => void;
}

function EmptyClassesState({ onJoin }: EmptyClassesStateProps) {
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-slate-900/60 ring-1 ring-dashed ring-slate-200 dark:ring-slate-700 px-5 py-8 text-center">
      <div
        aria-hidden="true"
        className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
        >
          <path d="M3 7l9-4 9 4-9 4-9-4z" />
          <path d="M3 7v6l9 4 9-4V7" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        No classes yet
      </p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Join a class with the code your teacher gave you.
      </p>
      <button
        type="button"
        onClick={onJoin}
        className="mt-4 inline-flex items-center justify-center min-h-[40px] rounded-lg bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 motion-safe:transition-colors"
      >
        Join class
      </button>
    </div>
  );
}
