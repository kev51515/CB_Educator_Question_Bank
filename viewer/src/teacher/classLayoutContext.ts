/**
 * classLayoutContext
 * ==================
 * Shared context for the routed course-detail tabs. ClassLayout owns the
 * fetched course + a `patch()` callback (so a child tab — e.g. Settings —
 * can mutate the course name / archived state and have the header reflect
 * it instantly without a refetch). Tabs pull from this via `useClassContext`.
 */
import { createContext, useContext } from "react";
import type { TeacherClass } from "./useTeacherClasses";

export interface ClassLayoutContextValue {
  cls: TeacherClass;
  /**
   * Apply a partial patch to the cached course. The layout uses this to
   * reflect immediate mutations from child tabs.
   */
  patch: (patch: Partial<TeacherClass>) => void;
  /**
   * Hard refresh of the course row from the server. Tabs call this after
   * server-side mutations that change derived fields (e.g. regen code).
   */
  refresh: () => Promise<void>;
}

export const ClassLayoutContext = createContext<ClassLayoutContextValue | null>(
  null,
);

export function useClassContext(): ClassLayoutContextValue {
  const ctx = useContext(ClassLayoutContext);
  if (!ctx) {
    throw new Error(
      "useClassContext must be used inside a <ClassLayout> route subtree",
    );
  }
  return ctx;
}
