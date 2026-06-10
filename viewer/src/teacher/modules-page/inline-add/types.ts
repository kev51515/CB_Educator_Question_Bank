/**
 * modules-page/inline-add/types
 * =============================
 * Shared types/interfaces for the inline "add a row" forms. Extracted
 * verbatim from the pre-split inline-add.tsx — no behavior change.
 */
import { type CourseModule } from "@/teacher/useCourseModules";

export interface InlineCreateModuleRowProps {
  busy: boolean;
  onCommit: (name: string) => Promise<boolean>;
  onCancel: () => void;
}

export interface InlineAddItemRowProps {
  classId: string;
  module: CourseModule;
  usedAssignmentIds: ReadonlySet<string>;
  /** Close the form + refresh module list. */
  onCommitted: () => void;
  /** Refresh the module list but keep the form mounted ("Add and add another"). */
  onCommittedKeepOpen: () => void;
  onCancel: () => void;
}

// Module selection for a Full-Test: the teacher picks WHICH modules to deploy
// to this course (e.g. Reading & Writing only). `FtModule` is the chosen
// test's module list shape.
export interface FtModule {
  position: number;
  section: string;
  label: string;
  time_limit_seconds: number;
  question_count: number;
}
