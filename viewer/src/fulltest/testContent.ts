/**
 * fulltest/testContent — shared staff test-content loader
 * =======================================================
 * Both the educator Preview (TestPreviewRunner) and Review (TestReviewPage)
 * render the whole test, with the answer key, by reading it directly from
 * tests → test_modules → test_questions (0048 RLS: is_staff). This module is
 * the single home for that query, its row→model mapping, and the shared types
 * — so a schema change touches one place, not two.
 */
import { supabase } from "@/lib/supabase";
import type { Letter, Section, TestQuestion } from "./types";

/** Per-choice rationale (0120): which word is wrong + why; the correct choice
 *  may carry just a `reason` (why it's right). All keys optional. */
export type ChoiceRationale = Partial<Record<Letter, { wrong?: string; reason: string }>>;

/** A question with its answer key, for staff Preview/Review surfaces. */
export interface TestContentQuestion extends TestQuestion {
  correct_answer: string | null;
  accepted: string[] | null;
  rationale: ChoiceRationale | null;
}
export interface TestContentModule {
  position: number;
  label: string;
  section: Section;
  questions: TestContentQuestion[];
}
export interface TestContent {
  slug: string;
  title: string;
  total_questions: number;
  modules: TestContentModule[];
}

interface RawQuestion {
  id: string;
  ref: string;
  number: number;
  position: number;
  type: "mcq" | "grid";
  passage: string | null;
  passage_alt: string | null;
  stem: string;
  choices: Record<Letter, string> | null;
  figure: string | null;
  correct_answer: string | null;
  accepted: string[] | null;
  rationale: ChoiceRationale | null;
}
interface RawModule {
  position: number;
  label: string;
  section: Section;
  test_questions: RawQuestion[];
}
interface RawTest {
  slug: string;
  title: string;
  total_questions: number;
  test_modules: RawModule[];
}

const SELECT =
  "slug,title,total_questions,test_modules(position,label,section,test_questions(id,ref,number,position,type,passage,passage_alt,stem,choices,figure,correct_answer,accepted,rationale))";

/** The canonical answer text for a question (grid folds in `accepted`). */
export function answerKeyText(q: TestContentQuestion): string {
  if (q.type === "grid") {
    const main = q.correct_answer ?? q.accepted?.[0] ?? "—";
    const extra =
      q.accepted && q.accepted.length > 1 ? ` (accepts: ${q.accepted.join(", ")})` : "";
    return `${main}${extra}`;
  }
  return q.correct_answer ?? "—";
}

/** The single value to mark as correct on a question (grid → first accepted). */
export function correctValue(q: TestContentQuestion): string | null {
  return q.correct_answer ?? q.accepted?.[0] ?? null;
}

/** Fetch + normalise a whole test (modules and questions sorted by position).
 *  Throws on error / not found. */
export async function fetchTestContent(slug: string): Promise<TestContent> {
  const { data, error } = await supabase
    .from("tests")
    .select(SELECT)
    .eq("slug", slug)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Test not found.");
  const raw = data as unknown as RawTest;
  const modules: TestContentModule[] = [...(raw.test_modules ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((m) => ({
      position: m.position,
      label: m.label,
      section: m.section,
      questions: [...(m.test_questions ?? [])]
        .sort((a, b) => a.position - b.position)
        .map((q) => ({
          id: q.id,
          ref: q.ref,
          number: q.number,
          type: q.type,
          section: m.section,
          passage: q.passage,
          passage_alt: q.passage_alt,
          stem: q.stem,
          choices: q.choices,
          figure: q.figure,
          correct_answer: q.correct_answer,
          accepted: q.accepted,
          rationale: q.rationale ?? null,
        })),
    }));
  return {
    slug: raw.slug,
    title: raw.title,
    total_questions: raw.total_questions,
    modules,
  };
}
