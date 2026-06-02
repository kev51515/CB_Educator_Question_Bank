/**
 * SAT question source.
 *
 * Loads the prepacked SAT JSON shipped in `public/data/sat-questions.json`
 * (originally from the sibling `sat_questions` project) and adapts each
 * record into the unified `TestQuestion` shape used by the mock-test UI.
 */
import { fetchJson } from "../../lib/fetch";
import type { Letter, TestDifficulty, TestQuestion } from "../types";

interface SatRawChoices {
  A?: string;
  B?: string;
  C?: string;
  D?: string;
}

interface SatRawWrongRationale {
  text?: string;
}

interface SatRawQuestion {
  id: string;
  domain?: string;
  skill?: string;
  difficulty?: string;
  passage?: string;
  passage2?: string;
  stem: string;
  choices: SatRawChoices;
  correctAnswer: string;
  correctRationale?: string;
  wrongRationales?: Partial<Record<Letter, SatRawWrongRationale | string>>;
}

const LETTERS: readonly Letter[] = ["A", "B", "C", "D"] as const;

function isLetter(value: unknown): value is Letter {
  return value === "A" || value === "B" || value === "C" || value === "D";
}

function normalizeDifficulty(raw: unknown): TestDifficulty {
  if (raw === "Easy" || raw === "Medium" || raw === "Hard") return raw;
  return "Medium";
}

function normalizeWrongRationales(
  raw: SatRawQuestion["wrongRationales"],
): Partial<Record<Letter, string>> | undefined {
  if (!raw) return undefined;
  const out: Partial<Record<Letter, string>> = {};
  for (const letter of LETTERS) {
    const entry = raw[letter];
    if (!entry) continue;
    if (typeof entry === "string") {
      out[letter] = entry;
    } else if (typeof entry.text === "string") {
      out[letter] = entry.text;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

function adapt(record: SatRawQuestion): TestQuestion | null {
  if (!record || typeof record !== "object") return null;
  if (!record.id || !record.stem || !record.choices) return null;
  if (!isLetter(record.correctAnswer)) return null;
  const choices: Record<Letter, string> = { A: "", B: "", C: "", D: "" };
  for (const letter of LETTERS) {
    const text = record.choices[letter];
    if (typeof text !== "string" || !text.trim()) return null;
    choices[letter] = text;
  }
  return {
    id: record.id,
    source: "sat",
    domain: record.domain ?? "General",
    skill: record.skill ?? undefined,
    difficulty: normalizeDifficulty(record.difficulty),
    passage: typeof record.passage === "string" && record.passage.trim() ? record.passage : undefined,
    stem: record.stem,
    choices,
    correctAnswer: record.correctAnswer,
    correctRationale: record.correctRationale ?? undefined,
    wrongRationales: normalizeWrongRationales(record.wrongRationales),
    isHtml: false,
  };
}

let cache: TestQuestion[] | null = null;

export async function loadSatQuestions(): Promise<TestQuestion[]> {
  if (cache) return cache;
  const raw = await fetchJson<SatRawQuestion[]>("/data/sat-questions.json");
  const adapted: TestQuestion[] = [];
  for (const item of raw) {
    const q = adapt(item);
    if (q) adapted.push(q);
  }
  cache = adapted;
  return adapted;
}
