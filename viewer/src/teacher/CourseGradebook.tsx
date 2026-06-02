/**
 * CourseGradebook
 * ===============
 * Grades tab inside ClassLayout. Renders a matrix of enrolled students ×
 * assignments showing score_percent (or "draft" / "—") for each cell, with a
 * per-student Average column on the right. Includes an "Export CSV" action.
 *
 * Reads existing tables: course_memberships, assignments, assignment_attempts.
 * No migration; no writes.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useClassContext } from "./classLayoutContext";
import { Skeleton, SkeletonRows } from "../components/Skeleton";
import { EmptyState } from "../components/EmptyState";
import { useToast } from "../components/Toast";
import {
  courseAssignmentAttemptPath,
  coursePeoplePath,
  courseAssignmentsPath,
  courseStudentProfilePath,
  ROUTES,
} from "../lib/routes";
import {
  type RosterRow,
  type AssignmentRow,
  type AttemptRow,
  type Student,
  type GradebookSortState,
  type SortKey,
  type GradebookFilter,
  getErrorMessage,
  truncateTitle,
  pickCell,
  renderCellText,
  cellToneClass,
  todayStamp,
  formatScoreCell,
  csvEscape,
  readSort,
  writeSort,
  readFilter,
  writeFilter,
  FILTER_LABELS,
} from "./courseGradebookHelpers";

export function CourseGradebook() {
  const { cls } = useClassContext();
  const courseId = cls.id;
  // Prefer the short_code in user-facing URLs (CLAUDE.md §"Short codes").
  const courseShortCode = cls.short_code;
  const navigate = useNavigate();
  const toast = useToast();

  const [students, setStudents] = useState<Student[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [attemptMap, setAttemptMap] = useState<Map<string, AttemptRow>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<GradebookSortState>(() => readSort(courseId));
  const [filter, setFilter] = useState<GradebookFilter>(() => readFilter(courseId));
  // Transient student-name search filter. Not persisted across reloads —
  // sticky/filter persistence lives in Lane 6 controls above.
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(searchQuery), 150);
    return () => window.clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    setSort(readSort(courseId));
    setFilter(readFilter(courseId));
  }, [courseId]);

  useEffect(() => {
    writeSort(courseId, sort);
  }, [courseId, sort]);

  useEffect(() => {
    writeFilter(courseId, filter);
  }, [courseId, filter]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const [rosterRes, asnRes] = await Promise.all([
          supabase
            .from("course_memberships")
            .select(
              "student_id, profiles!course_memberships_student_id_fkey(display_name, email)",
            )
            .eq("course_id", courseId),
          supabase
            .from("assignments")
            .select("id, short_code, title, created_at, due_at")
            .eq("course_id", courseId)
            .eq("archived", false)
            .order("created_at", { ascending: true }),
        ]);

        if (rosterRes.error) {
          if (!cancelled) {
            setError(rosterRes.error.message);
            setLoading(false);
          }
          return;
        }
        if (asnRes.error) {
          if (!cancelled) {
            setError(asnRes.error.message);
            setLoading(false);
          }
          return;
        }

        const rosterRows = (rosterRes.data ?? []) as unknown as RosterRow[];
        const asnRows = (asnRes.data ?? []) as unknown as AssignmentRow[];

        const mappedStudents: Student[] = rosterRows.map((row) => ({
          student_id: row.student_id,
          display_name:
            row.profiles?.display_name ??
            row.profiles?.email ??
            "Unknown student",
          email: row.profiles?.email ?? "",
        }));

        const assignmentIds = asnRows.map((a) => a.id);
        let attempts: AttemptRow[] = [];
        if (assignmentIds.length > 0) {
          // Multi-attempt-aware: read from the assignment_best_attempts view
          // (migration 0020) which already dedupes to the highest-score
          // submitted attempt per (assignment, student). Falls back to the
          // raw table query for the "draft / in-progress" state by joining
          // a second read below.
          // Migration 0057 updated this view to (a) order by COALESCE(
          // score_override, score_percent) so a teacher's override actually
          // wins the "best" pick, and (b) expose `effective_score` directly
          // so we no longer need a second round-trip to fetch overrides.
          // We derive `score_override` by comparing `effective_score` to
          // `score_percent` — when they differ, the override IS the
          // effective_score; when they match, no override was applied.
          const bestRes = await supabase
            .from("assignment_best_attempts")
            .select(
              "attempt_id, assignment_id, student_id, score_percent, effective_score, submitted_at, status",
            )
            .in("assignment_id", assignmentIds);
          if (bestRes.error) {
            if (!cancelled) {
              setError(bestRes.error.message);
              setLoading(false);
            }
            return;
          }
          const bestRows = (bestRes.data ?? []) as unknown as {
            attempt_id: string;
            assignment_id: string;
            student_id: string;
            score_percent: number | null;
            effective_score: number | null;
            submitted_at: string | null;
            status: string | null;
          }[];

          attempts = bestRows.map((r) => {
            const pct =
              r.score_percent === null || r.score_percent === undefined
                ? null
                : Number(r.score_percent);
            const eff =
              r.effective_score === null || r.effective_score === undefined
                ? null
                : Number(r.effective_score);
            // override is present iff effective differs from auto
            const override =
              eff !== null && pct !== null && eff !== pct ? eff : null;
            return {
              id: r.attempt_id,
              assignment_id: r.assignment_id,
              student_id: r.student_id,
              status: r.status,
              score_percent: pct,
              score_override: override,
              submitted_at: r.submitted_at,
            };
          });

          // Pull in-progress rows separately so cells without any submitted
          // attempt still render as "draft" instead of "—". In-progress rows
          // never carry an override (teacher hasn't graded yet), so we don't
          // need to fetch one.
          const inProgRes = await supabase
            .from("assignment_attempts")
            .select("id, assignment_id, student_id, score_percent, submitted_at")
            .in("assignment_id", assignmentIds)
            .is("submitted_at", null);
          if (!inProgRes.error) {
            const inProgRows = (inProgRes.data ?? []) as unknown as {
              id: string;
              assignment_id: string;
              student_id: string;
              score_percent: number | null;
              submitted_at: string | null;
            }[];
            for (const r of inProgRows) {
              const key = `${r.student_id}|${r.assignment_id}`;
              if (!attempts.some((a) => `${a.student_id}|${a.assignment_id}` === key)) {
                attempts.push({
                  id: r.id,
                  assignment_id: r.assignment_id,
                  student_id: r.student_id,
                  status: "in_progress",
                  score_percent: r.score_percent,
                  score_override: null,
                  submitted_at: r.submitted_at,
                });
              }
            }
          }
        }

        // The best-attempts view already dedupes by (assignment, student),
        // so the map is a straight-through. Kept as a Map for the existing
        // downstream consumers.
        const map = new Map<string, AttemptRow>();
        for (const a of attempts) {
          const key = `${a.student_id}|${a.assignment_id}`;
          const existing = map.get(key);
          if (!existing) {
            map.set(key, a);
            continue;
          }
          const existingCell = pickCell(existing);
          const newCell = pickCell(a);
          if (newCell.kind === "score" && existingCell.kind !== "score") {
            map.set(key, a);
          } else if (
            newCell.kind === "score" &&
            existingCell.kind === "score" &&
            (newCell.score ?? 0) > (existingCell.score ?? 0)
          ) {
            map.set(key, a);
          }
        }

        if (cancelled) return;
        setStudents(mappedStudents);
        setAssignments(asnRows);
        setAttemptMap(map);
        setLoading(false);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(getErrorMessage(err, "Failed to load gradebook."));
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [courseId]);

  // Header order: spec says "ordered by created_at desc"
  const orderedAssignments = useMemo<AssignmentRow[]>(() => {
    return [...assignments].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    );
  }, [assignments]);

  const studentAverages = useMemo<Map<string, number | null>>(() => {
    const out = new Map<string, number | null>();
    for (const s of students) {
      let sum = 0;
      let count = 0;
      for (const a of orderedAssignments) {
        const cell = pickCell(attemptMap.get(`${s.student_id}|${a.id}`));
        if (cell.kind === "score") {
          sum += cell.score ?? 0;
          count += 1;
        }
      }
      out.set(s.student_id, count > 0 ? sum / count : null);
    }
    return out;
  }, [students, orderedAssignments, attemptMap]);

  const sortedStudents = useMemo<Student[]>(() => {
    const arr = [...students];
    if (sort.key === "name") {
      arr.sort((a, b) =>
        a.display_name.localeCompare(b.display_name, undefined, {
          sensitivity: "base",
        }),
      );
    } else {
      arr.sort((a, b) => {
        const av = studentAverages.get(a.student_id);
        const bv = studentAverages.get(b.student_id);
        // Push nulls to the end regardless of direction.
        if (av === null || av === undefined) {
          if (bv === null || bv === undefined) return 0;
          return 1;
        }
        if (bv === null || bv === undefined) return -1;
        return av - bv;
      });
    }
    if (sort.dir === "desc") arr.reverse();
    return arr;
  }, [students, sort, studentAverages]);

  /**
   * Apply the "behind" filter pill. A student is kept if they have ≥1
   * assignment matching the active predicate. `all` short-circuits.
   * Computed against `orderedAssignments` + `attemptMap` so it respects
   * any future per-assignment archival/visibility.
   */
  const visibleStudents = useMemo<Student[]>(() => {
    if (filter === "all") return sortedStudents;
    const now = Date.now();
    return sortedStudents.filter((s) => {
      for (const a of orderedAssignments) {
        const attempt = attemptMap.get(`${s.student_id}|${a.id}`);
        const cell = pickCell(attempt);
        if (filter === "missing") {
          // No attempt at all AND assignment is past its due date.
          if (cell.kind === "missing") {
            if (!a.due_at) continue;
            if (new Date(a.due_at).getTime() < now) return true;
          }
        } else if (filter === "late") {
          // Submitted after the due date.
          if (
            cell.kind === "score" &&
            attempt?.submitted_at &&
            a.due_at &&
            new Date(attempt.submitted_at).getTime() >
              new Date(a.due_at).getTime()
          ) {
            return true;
          }
        } else if (filter === "ungraded") {
          // Draft / in-progress with no submitted score.
          if (cell.kind === "draft") return true;
        }
      }
      return false;
    });
  }, [sortedStudents, filter, orderedAssignments, attemptMap]);

  /**
   * Apply the transient name search on top of the sorted students. Empty
   * query is a no-op. Case-insensitive substring match against display_name.
   * Lane 6's `visibleStudents` filter (missing/late/ungraded) feeds this; if
   * Lane 6 hasn't swapped the render yet, we still filter from sortedStudents
   * so the search works regardless of merge order.
   */
  const searchFilteredStudents = useMemo<Student[]>(() => {
    const base = visibleStudents.length > 0 || filter !== "all"
      ? visibleStudents
      : sortedStudents;
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return base;
    return base.filter((s) =>
      s.display_name.toLowerCase().includes(q),
    );
  }, [visibleStudents, sortedStudents, filter, debouncedQuery]);

  const toggleSortKey = useCallback((key: SortKey): void => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "name" ? "asc" : "desc" },
    );
  }, []);

  const onExportCsv = (): void => {
    try {
      // Header: Student | Email | <assignment titles…> | Average
      const headerCells = [
        "Student",
        "Email",
        ...orderedAssignments.map((a) => a.title),
        "Average",
      ];
      const lines: string[] = [headerCells.map(csvEscape).join(",")];
      // Export the VISIBLE rows in the order the table renders them, so the
      // user's current sort + behind-filter + name-search are preserved. If
      // the user has filtered to a non-empty set, only those rows are shipped
      // — this matches the on-screen view.
      for (const s of searchFilteredStudents) {
        const row: string[] = [s.display_name, s.email];
        for (const a of orderedAssignments) {
          const cell = pickCell(attemptMap.get(`${s.student_id}|${a.id}`));
          if (cell.kind === "score") {
            const score = formatScoreCell(cell.score ?? 0);
            // Mark teacher-applied overrides so admins can see at a glance
            // which cells were touched. The numeric prefix stays parseable
            // — a downstream sheet/script that wants just the number can
            // strip everything from the first space.
            row.push(cell.adjusted ? `${score} (override)` : score);
          } else if (cell.kind === "draft") {
            row.push("draft");
          } else {
            row.push("");
          }
        }
        const avg = studentAverages.get(s.student_id);
        row.push(
          avg === null || avg === undefined ? "" : formatScoreCell(avg),
        );
        lines.push(row.map(csvEscape).join(","));
      }
      // CRLF line endings + UTF-8 BOM for Excel friendliness on Windows and
      // for non-ASCII names. Excel sniffs the BOM and opens as UTF-8 instead
      // of guessing (and mangling) the encoding.
      const csv = "﻿" + lines.join("\r\n") + "\r\n";
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Filename uses the course short_code (stable 6-char slug, CLAUDE.md
      // §"Short codes") instead of the mutable course name + ISO date.
      a.download = `gradebook-${courseShortCode}-${todayStamp()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Gradebook exported");
    } catch (err: unknown) {
      toast.error(
        "Couldn't export",
        getErrorMessage(err, "Failed to export gradebook."),
      );
    }
  };

  /**
   * Cell click router.
   *  - If there's an attempt (draft or scored) → jump to the teacher
   *    attempt-detail view as before.
   *  - If the cell is empty (no attempt at all) → jump to Inbox with a
   *    `?compose=<student_id>` hint so Maya can nudge the student in one
   *    click. NOTE (follow-up): the inbox compose surface does not yet
   *    consume this query param. Wire it through `ThreadView` /
   *    `InboxPage` in a follow-up so the compose box auto-opens scoped
   *    to that student.
   */
  const onCellClick = (studentId: string, assignmentId: string): void => {
    const attempt = attemptMap.get(`${studentId}|${assignmentId}`);
    if (attempt) {
      navigate(
        courseAssignmentAttemptPath(courseId, assignmentId, attempt.id),
      );
      return;
    }
    navigate(`${ROUTES.INBOX}?compose=${encodeURIComponent(studentId)}`);
  };

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Gradebook
        </h1>
        <div className="rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
          <Skeleton className="h-8 w-full rounded" />
          <SkeletonRows count={6} rowClassName="h-10" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 p-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Gradebook
        </h1>
        <div
          role="alert"
          className="rounded-md bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-sm text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-900"
        >
          {error}
        </div>
      </div>
    );
  }

  const hasData = students.length > 0 && orderedAssignments.length > 0;

  const sortPillClass = (active: boolean): string =>
    `rounded-full min-h-[40px] md:min-h-0 inline-flex items-center px-3 py-2 md:py-1 text-xs font-medium ring-1 transition ${
      active
        ? "bg-indigo-600 text-white ring-indigo-600 hover:bg-indigo-700"
        : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 ring-slate-200 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
    }`;

  const sortArrow = (key: SortKey): string => {
    if (sort.key !== key) return "";
    return sort.dir === "asc" ? " ↑" : " ↓";
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Gradebook
        </h1>
        <button
          type="button"
          onClick={onExportCsv}
          // Disabled when no students would land in the CSV — either the
          // course has nothing to export, or the current filter/search has
          // narrowed the view to zero rows. Disabling on an empty view is
          // honest: clicking would have produced a header-only file.
          disabled={!hasData || searchFilteredStudents.length === 0}
          title={
            !hasData
              ? "Nothing to export yet"
              : searchFilteredStudents.length === 0
                ? "No students match the current filter"
                : "Download the visible gradebook as CSV"
          }
          aria-label="Export gradebook as CSV"
          // Slate ghost button matching surrounding controls (filter pills,
          // sort buttons). 40px+ tap target via min-h-[40px]. Dark-mode pair
          // mirrors the sortPillClass scheme.
          className="inline-flex items-center gap-2 rounded-lg min-h-[40px] px-4 py-2 text-sm font-medium ring-1 transition bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 ring-slate-200 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-indigo-700 dark:hover:text-indigo-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white dark:disabled:hover:bg-slate-900 disabled:hover:text-slate-700 dark:disabled:hover:text-slate-200"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
            className="h-4 w-4"
          >
            <path
              fillRule="evenodd"
              d="M10 3a.75.75 0 0 1 .75.75v7.69l2.22-2.22a.75.75 0 1 1 1.06 1.06l-3.5 3.5a.75.75 0 0 1-1.06 0l-3.5-3.5a.75.75 0 1 1 1.06-1.06l2.22 2.22V3.75A.75.75 0 0 1 10 3Zm-6.25 11.25a.75.75 0 0 1 .75.75v.75c0 .414.336.75.75.75h9.5a.75.75 0 0 0 .75-.75V15a.75.75 0 0 1 1.5 0v.75A2.25 2.25 0 0 1 14.75 18h-9.5A2.25 2.25 0 0 1 3 15.75V15a.75.75 0 0 1 .75-.75Z"
              clipRule="evenodd"
            />
          </svg>
          Export CSV
        </button>
      </div>

      {!hasData ? (
        <div className="rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900">
          <EmptyState
            title="Nothing to grade yet"
            body={
              students.length === 0
                ? "Add students to this course and they'll show up here once they have an assignment to work on."
                : "Create an assignment and grades will appear here as students submit."
            }
            cta={
              students.length === 0
                ? {
                    label: "Add students",
                    onClick: () => navigate(coursePeoplePath(courseId)),
                  }
                : {
                    label: "Create an assignment",
                    onClick: () =>
                      navigate(courseAssignmentsPath(courseId)),
                  }
            }
          />
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-medium">Sort:</span>
            <button
              type="button"
              onClick={() => toggleSortKey("name")}
              className={sortPillClass(sort.key === "name")}
              aria-pressed={sort.key === "name"}
            >
              Name{sortArrow("name")}
            </button>
            <button
              type="button"
              onClick={() => toggleSortKey("average")}
              className={sortPillClass(sort.key === "average")}
              aria-pressed={sort.key === "average"}
            >
              Average{sortArrow("average")}
            </button>
          </div>
          {/* Behind-filter pills + count chip. Default `All`; persists
              per-course under `gradebook.filter.<courseId>`. The pill
              filter is the "who's behind" lens; Lane 4's search input
              composes on top via `searchFilteredStudents`. */}
          <div
            role="group"
            aria-label="Filter gradebook"
            className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400"
          >
            <span className="font-medium">Filter:</span>
            {(Object.keys(FILTER_LABELS) as GradebookFilter[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                aria-pressed={filter === key}
                className={sortPillClass(filter === key)}
              >
                {FILTER_LABELS[key]}
              </button>
            ))}
            <span className="ml-1 inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
              {visibleStudents.length} of {sortedStudents.length} students
            </span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search students…"
              aria-label="Search students by name"
              className="w-full sm:w-72 rounded-md bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-700 px-3 py-2 min-h-[40px] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            />
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {debouncedQuery.trim()
                ? `${searchFilteredStudents.length} of ${students.length} ${
                    students.length === 1 ? "student" : "students"
                  }`
                : `${students.length} ${
                    students.length === 1 ? "student" : "students"
                  }`}
            </span>
          </div>
          {/*
            Sticky strategy:
              z-30 → corner cell (sticky top + left, layers above both axes)
              z-20 → header row THs (sticky top)
              z-10 → first column TDs (sticky left)
            All sticky surfaces use the same opaque background as the cell
            they replace so scrolled content doesn't bleed through. The
            outer overflow-x-auto container is the scroll context the
            `sticky` positioning resolves against. Sticky classes are
            applied to each TH/TD individually because `<thead>`-level
            sticky doesn't work reliably across browsers for
            `border-collapse` tables.
          */}
          <div className="rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr>
                  <th className="sticky top-0 left-0 z-30 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-left text-sm font-semibold text-slate-700 dark:text-slate-200 border-b border-r border-slate-200 dark:border-slate-800">
                    Student
                  </th>
                  {orderedAssignments.map((a) => (
                    <th
                      key={a.id}
                      className="sticky top-0 z-20 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-left text-sm font-semibold text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-800"
                      title={a.title}
                    >
                      {truncateTitle(a.title)}
                    </th>
                  ))}
                  <th className="sticky top-0 z-20 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-left text-sm font-semibold text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-800">
                    Average
                  </th>
                </tr>
              </thead>
              <tbody>
                {searchFilteredStudents.length === 0 ? (
                  <tr>
                    <td
                      colSpan={orderedAssignments.length + 2}
                      className="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400"
                    >
                      {debouncedQuery.trim()
                        ? `No students match "${debouncedQuery.trim()}".`
                        : "No students match the current filter."}
                    </td>
                  </tr>
                ) : null}
                {searchFilteredStudents.map((s) => {
                  const avg = studentAverages.get(s.student_id);
                  return (
                    <tr
                      key={s.student_id}
                      className="border-t border-slate-200 dark:border-slate-800"
                    >
                      <td className="sticky left-0 z-10 bg-white dark:bg-slate-900 px-3 py-2 text-sm whitespace-nowrap border-r border-slate-200 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() =>
                            navigate(
                              courseStudentProfilePath(
                                courseShortCode,
                                s.student_id,
                              ),
                            )
                          }
                          title="Open student profile"
                          aria-label={`Open profile for ${s.display_name}`}
                          className="inline-flex items-center rounded-md min-h-[40px] md:min-h-0 px-1.5 py-1 text-left text-slate-900 dark:text-slate-100 hover:text-indigo-700 dark:hover:text-indigo-300 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                        >
                          {s.display_name}
                        </button>
                      </td>
                      {orderedAssignments.map((a) => {
                        const cell = pickCell(
                          attemptMap.get(`${s.student_id}|${a.id}`),
                        );
                        // Every cell is now interactive: attempts open the
                        // attempt-detail view; missing cells (—) jump to
                        // the Inbox compose for the student so Maya can
                        // nudge in one click. See `onCellClick`.
                        const titleHint =
                          cell.kind === "missing"
                            ? `Message ${s.display_name}`
                            : cell.adjusted
                              ? "Open attempt · score adjusted by teacher"
                              : "Open attempt";
                        return (
                          <td key={a.id} className="px-3 py-2 text-sm">
                            <button
                              type="button"
                              onClick={() =>
                                onCellClick(s.student_id, a.id)
                              }
                              title={titleHint}
                              aria-label={`${titleHint} — ${a.title}`}
                              className={`relative inline-flex items-center justify-center rounded-md min-h-[40px] md:min-h-0 px-2 py-1.5 md:py-0.5 text-xs font-medium hover:opacity-80 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${cellToneClass(cell)}`}
                            >
                              {renderCellText(cell)}
                              {cell.adjusted && (
                                <span
                                  aria-hidden
                                  className="absolute -top-1 -right-1 inline-block h-2 w-2 rounded-full bg-indigo-500 ring-2 ring-white dark:ring-slate-900"
                                />
                              )}
                            </button>
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                        {avg === null || avg === undefined
                          ? "—"
                          : `${Math.round(avg)}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
