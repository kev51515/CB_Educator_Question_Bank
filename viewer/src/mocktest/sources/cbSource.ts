/**
 * CB (College Board) question source.
 *
 * The CB bank lives under `public/data/`. The index at `public/data/index.json`
 * lists every question with its file path; each per-question JSON has the
 * shape defined in `viewer/src/types.ts` plus a `raw.correct_answer` array
 * holding the canonical letter ("A" | "B" | "C" | "D").
 *
 * Limitations on this first pass:
 *   - We only load `mcq` questions with exactly 4 answer options.
 *   - We map the first four `answerOptions` to A/B/C/D in order; if any
 *     question deviates (3 options, SPR free-response, etc.) it is skipped.
 *   - Stem / choices retain their CB HTML so the renderer can preserve
 *     SVG figures and MathML. `isHtml` is true for every CB question.
 */
import { fetchJson } from "@/lib/fetch";
import type { IndexEntry } from "@/types";
import type { Letter, TestDifficulty, TestQuestion } from "@/mocktest/types";

interface CbAnswerOption {
  id: string;
  content: string;
}

interface CbRawQuestion {
  questionId: string;
  section?: string;
  difficulty?: string;
  domain?: string;
  skill?: string;
  type?: string;
  stimulus?: string;
  stem?: string;
  answerOptions?: CbAnswerOption[];
  keys?: string[];
  raw?: {
    correct_answer?: string[];
  };
}

const LETTERS: readonly Letter[] = ["A", "B", "C", "D"] as const;

function normalizeDifficulty(raw: unknown): TestDifficulty {
  if (raw === "Easy" || raw === "Medium" || raw === "Hard") return raw;
  return "Medium";
}

function pickCorrectLetter(record: CbRawQuestion): Letter | null {
  const fromRaw = record.raw?.correct_answer?.[0];
  if (fromRaw === "A" || fromRaw === "B" || fromRaw === "C" || fromRaw === "D") {
    return fromRaw;
  }
  // Fall back to matching `keys[0]` against `answerOptions` ids.
  const keyId = record.keys?.[0];
  if (!keyId || !record.answerOptions) return null;
  const idx = record.answerOptions.findIndex((opt) => opt.id === keyId);
  if (idx < 0 || idx > 3) return null;
  return LETTERS[idx]!;
}

function adapt(record: CbRawQuestion): TestQuestion | null {
  if (!record || record.type !== "mcq") return null;
  if (!record.answerOptions || record.answerOptions.length !== 4) return null;
  if (typeof record.stem !== "string" || !record.stem.trim()) return null;
  const correctAnswer = pickCorrectLetter(record);
  if (!correctAnswer) return null;
  const choices: Record<Letter, string> = { A: "", B: "", C: "", D: "" };
  for (let i = 0; i < 4; i += 1) {
    const letter = LETTERS[i]!;
    const content = record.answerOptions[i]?.content;
    if (typeof content !== "string") return null;
    choices[letter] = content;
  }
  return {
    id: record.questionId,
    source: "cb",
    domain: record.domain ?? "General",
    skill: record.skill ?? undefined,
    difficulty: normalizeDifficulty(record.difficulty),
    passage: typeof record.stimulus === "string" && record.stimulus.trim() ? record.stimulus : undefined,
    stem: record.stem,
    choices,
    correctAnswer,
    isHtml: true,
  };
}

interface CbIndex {
  entries: IndexEntry[];
}

let indexCache: IndexEntry[] | null = null;

async function loadIndex(): Promise<IndexEntry[]> {
  if (indexCache) return indexCache;
  const raw = await fetchJson<IndexEntry[] | CbIndex>("/data/index.json");
  const entries = Array.isArray(raw) ? raw : raw.entries;
  indexCache = entries.filter((e): e is IndexEntry => !!e && typeof e.path === "string");
  return indexCache;
}

const questionCache = new Map<string, TestQuestion>();

async function loadOne(entry: IndexEntry): Promise<TestQuestion | null> {
  const cached = questionCache.get(entry.id);
  if (cached) return cached;
  try {
    const record = await fetchJson<CbRawQuestion>(`/data/${entry.path}`);
    const adapted = adapt(record);
    if (adapted) questionCache.set(entry.id, adapted);
    return adapted;
  } catch {
    return null;
  }
}

/**
 * Sample `count` CB questions, optionally filtering by difficulty first.
 * The sampling is done at the index level (cheap) and only the selected
 * questions are fetched. Caller is expected to handle the case where fewer
 * questions are returned than requested.
 */
export async function loadCbQuestions(
  count: number,
  difficulty: "Easy" | "Medium" | "Hard" | null,
): Promise<TestQuestion[]> {
  const index = await loadIndex();
  const mcqOnly = index.filter((e) => (e.type ?? "").toLowerCase() === "mcq");
  const pool = difficulty
    ? mcqOnly.filter((e) => e.difficulty === difficulty)
    : mcqOnly;

  // Fisher–Yates shuffle to randomize which entries we attempt first.
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = shuffled[i]!;
    const b = shuffled[j]!;
    shuffled[i] = b;
    shuffled[j] = a;
  }

  // We may need to over-fetch because adapt() can reject malformed entries.
  const target = Math.max(count, 0);
  const out: TestQuestion[] = [];
  for (const entry of shuffled) {
    if (out.length >= target) break;
    const q = await loadOne(entry);
    if (q) out.push(q);
  }
  return out;
}
