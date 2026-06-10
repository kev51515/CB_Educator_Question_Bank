/**
 * modules-page/inline-add/practicetest-hooks
 * ==========================================
 * Practice-Test picker state hook for InlineAddItemRow — the teacher PICKS
 * from their cross-course mocktest library (via useTeacherMockTests) rather
 * than configuring source/preset/time/questions at assign-time. Holds the
 * filter + keyboard-nav state and the derived filtered library. Extracted
 * verbatim from the pre-split inline-add.tsx — no behavior change.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  useTeacherMockTests,
  type TeacherMockTest,
} from "@/teacher/useTeacherMockTests";
import {
  readPtLibraryLastFilter,
  writePtLibraryLastFilter,
  type PracticeTestSourceFilter,
} from "../persistence";

export interface PracticeTestSelection {
  ptLibrary: TeacherMockTest[];
  ptLibraryLoading: boolean;
  ptLibraryError: string | null;
  ptTemplateId: string;
  setPtTemplateId: (id: string) => void;
  ptDueAt: string | null;
  setPtDueAt: (v: string | null) => void;
  ptQuery: string;
  setPtQuery: (v: string) => void;
  ptSourceFilter: PracticeTestSourceFilter;
  setPtSourceFilter: (v: PracticeTestSourceFilter) => void;
  ptCourseFilter: string | "all";
  setPtCourseFilter: (v: string | "all") => void;
  ptHighlightIdx: number;
  setPtHighlightIdx: React.Dispatch<React.SetStateAction<number>>;
  ptListRef: React.MutableRefObject<HTMLDivElement | null>;
  ptLibraryCourses: TeacherMockTest["course"][];
  filteredPtLibrary: TeacherMockTest[];
  ptSourceLabel: Record<Exclude<PracticeTestSourceFilter, "all">, string>;
}

export function usePracticeTestSelection(
  profileId: string | null,
): PracticeTestSelection {
  const {
    mockTests: ptLibrary,
    loading: ptLibraryLoading,
    error: ptLibraryError,
  } = useTeacherMockTests(profileId);

  // Practice Test picker state — teacher PICKS from their cross-course
  // mocktest library rather than configuring source/preset/time/questions
  // at assign-time.
  const initialPtFilter = readPtLibraryLastFilter();
  const [ptTemplateId, setPtTemplateId] = useState<string>("");
  const [ptDueAt, setPtDueAt] = useState<string | null>(null);
  const [ptQuery, setPtQuery] = useState<string>("");
  const [ptSourceFilter, setPtSourceFilter] = useState<PracticeTestSourceFilter>(
    initialPtFilter.source,
  );
  const [ptCourseFilter, setPtCourseFilter] = useState<string | "all">(
    initialPtFilter.courseId,
  );
  const [ptHighlightIdx, setPtHighlightIdx] = useState<number>(0);
  const ptListRef = useRef<HTMLDivElement | null>(null);

  // Persist Practice Test library filter selections.
  useEffect(() => {
    writePtLibraryLastFilter({ source: ptSourceFilter, courseId: ptCourseFilter });
  }, [ptSourceFilter, ptCourseFilter]);

  // Distinct courses present in the Practice Test library — used to populate
  // the Course filter pill row. Sorted by name for predictable order.
  const ptLibraryCourses = useMemo(() => {
    const seen = new Map<string, TeacherMockTest["course"]>();
    for (const test of ptLibrary) {
      if (!seen.has(test.course.id)) seen.set(test.course.id, test.course);
    }
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [ptLibrary]);

  // Filter the library by source + course + free-text query. Defensive on
  // archived rows: hide them from the picker — assigning an archived test
  // would surprise the teacher. They remain visible in /question-bank.
  const filteredPtLibrary = useMemo(() => {
    const q = ptQuery.trim().toLowerCase();
    return ptLibrary.filter((t) => {
      if (t.archived) return false;
      if (ptSourceFilter !== "all" && t.source_id !== ptSourceFilter) return false;
      if (ptCourseFilter !== "all" && t.course.id !== ptCourseFilter) return false;
      if (!q) return true;
      const hay = `${t.title} ${t.course.name} ${t.source_id}`.toLowerCase();
      return hay.includes(q);
    });
  }, [ptLibrary, ptSourceFilter, ptCourseFilter, ptQuery]);

  // Reset highlighted row when the filter narrows.
  useEffect(() => {
    setPtHighlightIdx(0);
  }, [ptQuery, ptSourceFilter, ptCourseFilter]);

  const ptSourceLabel: Record<Exclude<PracticeTestSourceFilter, "all">, string> = {
    cb: "CB",
    sat: "SAT",
    mixed: "Mixed",
  };

  return {
    ptLibrary,
    ptLibraryLoading,
    ptLibraryError,
    ptTemplateId,
    setPtTemplateId,
    ptDueAt,
    setPtDueAt,
    ptQuery,
    setPtQuery,
    ptSourceFilter,
    setPtSourceFilter,
    ptCourseFilter,
    setPtCourseFilter,
    ptHighlightIdx,
    setPtHighlightIdx,
    ptListRef,
    ptLibraryCourses,
    filteredPtLibrary,
    ptSourceLabel,
  };
}
