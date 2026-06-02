/**
 * Mock-test shared types.
 *
 * `TestQuestion` is the unified shape both question sources (CB and SAT) are
 * adapted to. The test UI only knows about this shape — sources do the
 * mapping. Difficulty is the SAT canonical set; CB difficulties map directly.
 */

export type Letter = "A" | "B" | "C" | "D";

export type TestDifficulty = "Easy" | "Medium" | "Hard";

export type TestSourceId = "cb" | "sat" | "mixed";

/**
 * `passageHtml` / `stemHtml` / `choices[letter]` may contain HTML (CB source);
 * when `isHtml` is false, treat them as plain text. Mixing renderers in one
 * component is what `isHtml` is for.
 */
export interface TestQuestion {
  id: string;
  source: "cb" | "sat";
  domain: string;
  skill?: string;
  difficulty: TestDifficulty;
  /** Optional stimulus / reading passage. */
  passage?: string;
  /** Question stem. */
  stem: string;
  choices: Record<Letter, string>;
  correctAnswer: Letter;
  /** Optional human-readable rationale for the correct answer. */
  correctRationale?: string;
  /** Optional per-wrong-letter rationale (sat only). */
  wrongRationales?: Partial<Record<Letter, string>>;
  /** When true, passage/stem/choices should be rendered as HTML. */
  isHtml: boolean;
}

export interface TestConfig {
  sourceId: TestSourceId;
  questionCount: number;
  /** 0 = untimed. */
  timeLimitMinutes: number;
  difficultyMix: "easy" | "medium" | "hard" | "any";
}

export interface TestSession {
  /** Unique session id (uuid-ish). */
  id: string;
  startedAt: number;
  config: TestConfig;
  questions: TestQuestion[];
  /** Per-question selected letter (null when unanswered). */
  answers: Record<string, Letter | null>;
  /** Flagged question ids (stored as an array so the session JSON-serializes). */
  flagged: string[];
  currentIndex: number;
  submittedAt: number | null;
}

export interface DomainBreakdown {
  domain: string;
  total: number;
  correct: number;
}

export interface SkillBreakdown {
  skill: string;
  total: number;
  correct: number;
}

export interface DifficultyBreakdown {
  difficulty: TestDifficulty;
  total: number;
  correct: number;
}

export interface TestResult {
  totalQuestions: number;
  correctCount: number;
  scorePercent: number;
  byDomain: DomainBreakdown[];
  bySkill: SkillBreakdown[];
  byDifficulty: DifficultyBreakdown[];
  durationSeconds: number;
}
