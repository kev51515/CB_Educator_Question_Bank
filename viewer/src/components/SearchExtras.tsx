import type { IndexEntry } from "@/types";

/** Returns true if entry matches a math expression query. Looks in mathText. */
export function matchesMathExpression(entry: IndexEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  const mt = entry.mathText;
  if (!mt) return false;
  return mt.includes(q);
}

/** Tokenize searchText into words longer than 4 chars for overlap scoring. */
function tokenize(text: string | undefined): Set<string> {
  if (!text) return new Set();
  const out = new Set<string>();
  for (const w of text.split(/[^a-z0-9]+/i)) {
    const lw = w.toLowerCase();
    if (lw.length > 4) out.add(lw);
  }
  return out;
}

/** Returns the N most similar entries to a given entry by skill, difficulty,
 *  and searchText overlap. */
export function findSimilarQuestions(
  target: IndexEntry,
  index: IndexEntry[],
  limit: number = 5,
): IndexEntry[] {
  const targetWords = tokenize(target.searchText);
  const scored: { entry: IndexEntry; score: number }[] = [];
  for (const e of index) {
    if (e.id === target.id) continue;
    let score = 0;
    if (e.skill && e.skill === target.skill) score += 10;
    if (e.domain && e.domain === target.domain) score += 5;
    if (e.difficulty && e.difficulty === target.difficulty) score += 3;
    if (targetWords.size > 0) {
      const otherWords = tokenize(e.searchText);
      for (const w of otherWords) {
        if (targetWords.has(w)) score += 1;
      }
    }
    if (score > 0) scored.push({ entry: e, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.entry);
}

/** Returns entries updated/added within the given time window (in days). */
export function filterByFreshness(
  index: IndexEntry[],
  withinDays: number,
): IndexEntry[] {
  const now = Date.now();
  const windowMs = withinDays * 86400000;
  return index.filter((e) => {
    const d = e.updateDate;
    if (d == null) return false;
    return now - d <= windowMs;
  });
}

interface SimilarQuestionsPanelProps {
  current: IndexEntry | null;
  index: IndexEntry[];
  onPick: (id: string) => void;
}

export function SimilarQuestionsPanel({
  current,
  index,
  onPick,
}: SimilarQuestionsPanelProps): JSX.Element | null {
  if (!current) return null;
  const similar = findSimilarQuestions(current, index, 5);
  if (similar.length === 0) return null;
  return (
    <div className="text-[12px] bg-ink-50 rounded-lg p-3 mt-4">
      <div className="font-semibold mb-2">Similar questions</div>
      <ul className="space-y-1">
        {similar.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onPick(s.id)}
              className="text-left w-full hover:underline"
            >
              <span className="font-medium">#{s.number ?? "?"}</span>
              <span className="mx-1">·</span>
              <span>{s.skill}</span>
              <span className="mx-1">·</span>
              <span>{s.difficulty}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
