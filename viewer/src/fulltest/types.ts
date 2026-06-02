/**
 * fulltest — shared types
 * ========================
 * Shapes returned by the proctored full-test RPCs (migration 0048). The
 * question content delivered to the browser intentionally OMITS the answer
 * key (correct_answer / accepted) until the run is submitted; only the review
 * payload (`get_test_result`) includes it.
 */

export type Section = "reading-writing" | "math";
export type QType = "mcq" | "grid";
export type Letter = "A" | "B" | "C" | "D";

export interface ModuleMeta {
  position: number;
  section: Section;
  label: string;
  time_limit_seconds: number;
  question_count: number;
}

export interface StartTestResult {
  run_id: string;
  status: "in_progress" | "submitted" | "abandoned";
  current_module: number;
  started_at: string;
  /** answers already recorded for this run (drafts + graded); drives the resume label */
  answered?: number;
  test: {
    slug: string;
    title: string;
    short_title: string | null;
    total_questions: number;
  };
  modules: ModuleMeta[];
}

/** A question as delivered mid-test — no correct answer. */
export interface TestQuestion {
  id: string;
  ref: string;
  number: number;
  type: QType;
  section: Section;
  passage: string | null;
  passage_alt: string | null;
  stem: string;
  choices: Record<Letter, string> | null;
  figure: string | null;
}

export interface GetModuleResult {
  module: ModuleMeta;
  seconds_remaining: number;
  /** Server-persisted drafts for cross-device resume (chosen only, no key). */
  saved_answers: Record<string, string | null>;
  /** Server-persisted eliminated (struck) choices per question, for resume. */
  saved_eliminations?: Record<string, Letter[]>;
  questions: TestQuestion[];
}

export interface SubmitModuleResult {
  finished: boolean;
  next_module?: number;
  answered?: number;
  score?: number;
  total?: number;
  run_id?: string;
  timed_out?: boolean;
}

/** A question in the post-submission review — includes the key. */
export interface ResultQuestion {
  id: string;
  ref: string;
  number: number;
  type: QType;
  section: Section;
  module_position: number;
  stem: string;
  choices: Record<Letter, string> | null;
  figure: string | null;
  passage: string | null;
  passage_alt: string | null;
  your_answer: string | null;
  correct_answer: string | null;
  accepted: string[] | null;
  is_correct: boolean | null;
  /** Choices the student crossed out during the test. */
  eliminated: Letter[];
}

export interface ModuleTiming {
  elapsed_seconds: number | null;
  limit_seconds: number | null;
  timed_out: boolean;
  answered: number;
}

export interface TestResult {
  run_id: string;
  score: number;
  total: number;
  duration_seconds: number;
  section_scores: Record<string, { correct: number; total: number }> | null;
  /** Per-module timing keyed by position ("1".."4"). */
  module_timing?: Record<string, ModuleTiming>;
  questions: ResultQuestion[];
}

/** A catalog row (from the public `tests` table). */
export interface TestCatalogEntry {
  slug: string;
  ordinal: number;
  title: string;
  short_title: string | null;
  total_questions: number;
}
