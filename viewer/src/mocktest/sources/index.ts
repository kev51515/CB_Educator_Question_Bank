/**
 * Source dispatcher. Builds the question list for a `TestConfig`.
 *
 * `mixed` interleaves CB and SAT samples roughly evenly. If one source has
 * fewer questions than requested, the other source fills the gap.
 */
import type { TestConfig, TestDifficulty, TestQuestion } from "../types";
import { loadCbQuestions } from "./cbSource";
import { loadSatQuestions } from "./satSource";

function shuffleInPlace<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = items[i]!;
    const b = items[j]!;
    items[i] = b;
    items[j] = a;
  }
  return items;
}

function difficultyFilter(mix: TestConfig["difficultyMix"]): TestDifficulty | null {
  if (mix === "easy") return "Easy";
  if (mix === "medium") return "Medium";
  if (mix === "hard") return "Hard";
  return null;
}

async function sampleSat(count: number, difficulty: TestDifficulty | null): Promise<TestQuestion[]> {
  const all = await loadSatQuestions();
  const pool = difficulty ? all.filter((q) => q.difficulty === difficulty) : [...all];
  shuffleInPlace(pool);
  return pool.slice(0, count);
}

async function sampleCb(count: number, difficulty: TestDifficulty | null): Promise<TestQuestion[]> {
  return loadCbQuestions(count, difficulty);
}

/**
 * Sample for a single source with an "any" fallback. If the filtered pool
 * doesn't yield enough questions to satisfy `want`, we top up from the
 * unfiltered pool so the student gets a full-length test rather than a
 * silently truncated one. This is the explicit fallback documented at the
 * top of this file: better to mix in off-difficulty questions than to ship
 * fewer questions than the teacher configured.
 */
async function sampleSourceWithFallback(
  sourceId: "sat" | "cb",
  want: number,
  difficulty: TestDifficulty | null,
): Promise<TestQuestion[]> {
  const sampler = sourceId === "sat" ? sampleSat : sampleCb;
  const primary = await sampler(want, difficulty);
  if (primary.length >= want || difficulty === null) return primary;
  // Not enough questions matching the requested difficulty — fall back to
  // "any" and top up with off-difficulty questions, dedup-ed by id.
  const filler = await sampler(want, null);
  const taken = new Set(primary.map((q) => q.id));
  const combined = [...primary];
  for (const q of filler) {
    if (combined.length >= want) break;
    if (!taken.has(q.id)) {
      combined.push(q);
      taken.add(q.id);
    }
  }
  return combined;
}

export async function loadSource(config: TestConfig): Promise<TestQuestion[]> {
  const difficulty = difficultyFilter(config.difficultyMix);
  const want = Math.max(0, config.questionCount);
  if (config.sourceId === "sat") {
    return sampleSourceWithFallback("sat", want, difficulty);
  }
  if (config.sourceId === "cb") {
    return sampleSourceWithFallback("cb", want, difficulty);
  }
  // mixed: split roughly evenly, then refill from the other side if short.
  const half = Math.ceil(want / 2);
  const [satHalf, cbHalf] = await Promise.all([
    sampleSat(half, difficulty),
    sampleCb(want - half, difficulty),
  ]);
  let combined = [...satHalf, ...cbHalf];
  if (combined.length < want) {
    // Try to backfill from whichever side delivered fewer.
    const missing = want - combined.length;
    const taken = new Set(combined.map((q) => q.id));
    if (satHalf.length < half) {
      const extra = await sampleCb(missing, difficulty);
      combined = combined.concat(extra.filter((q) => !taken.has(q.id)));
    } else {
      const extra = await sampleSat(missing, difficulty);
      combined = combined.concat(extra.filter((q) => !taken.has(q.id)));
    }
  }
  // Final fallback for the mixed path: if the difficulty filter still left
  // us short, top up from the unfiltered pools rather than returning fewer
  // questions than the teacher asked for.
  if (combined.length < want && difficulty !== null) {
    const missing = want - combined.length;
    const taken = new Set(combined.map((q) => q.id));
    const [satAny, cbAny] = await Promise.all([
      sampleSat(missing, null),
      sampleCb(missing, null),
    ]);
    for (const q of [...satAny, ...cbAny]) {
      if (combined.length >= want) break;
      if (!taken.has(q.id)) {
        combined.push(q);
        taken.add(q.id);
      }
    }
  }
  shuffleInPlace(combined);
  return combined.slice(0, want);
}
