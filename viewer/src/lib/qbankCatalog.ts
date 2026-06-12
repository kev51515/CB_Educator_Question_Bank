/**
 * qbankCatalog — the single place that loads the static question-bank catalog
 * and resolves a `qbank_set_uid` to its exported questions-HTML file.
 *
 * Why this module exists: this resolution used to live inline in
 * QBankAssignmentRunner, and the mapping logic was spread across the React
 * runner + the static catalog + the uid string. That fragility let an
 * assignment load the wrong subject's file. As of migration 0220 the
 * authoritative path is stored on the assignment row and the runner reads THAT
 * first; this resolver is now only the fallback for legacy rows that predate the
 * backfill. Keeping it in one tested module (rather than inline) is the
 * modularization half of that fix — one source of truth, easy to delete once no
 * legacy rows remain.
 */
import { qbankSetUidMatches } from "@/lib/qbankSetUid";

export interface QbankCatalogEntry {
  axis: string;
  section: string;
  difficulty: string;
  setId: string;
  label: string;
  topic: string;
  questionCount: number;
  questionsHtml: string;
}

export interface QbankCatalogJson {
  generatedAt: string;
  entries: QbankCatalogEntry[];
}

let catalogPromise: Promise<QbankCatalogJson> | null = null;

/** Fetch `/exports/catalog.json` once and cache the promise for the session. */
export function loadQbankCatalog(): Promise<QbankCatalogJson> {
  if (catalogPromise) return catalogPromise;
  catalogPromise = fetch("/exports/catalog.json")
    .then((res) => {
      if (!res.ok) throw new Error(`catalog.json fetch failed: ${res.status}`);
      return res.json() as Promise<QbankCatalogJson>;
    })
    .catch((err: unknown) => {
      catalogPromise = null; // allow a retry on the next call
      throw err;
    });
  return catalogPromise;
}

/**
 * Resolve a `qbank_set_uid` (axis::section::difficulty::topic::setId) to its
 * exported questions-HTML path. STRICT: only accepts a matched entry whose file
 * sits under the uid's own `by-skill/<section>/<difficulty>/` — so a loose or
 * colliding match can never serve a different subject's set (the guard that
 * stops an R&W "Inferences" set ever loading a Math file). Returns null when no
 * correctly-sectioned match exists, so callers error instead of showing the
 * wrong questions.
 */
export async function resolveQbankQuestionsHtml(
  qbankSetUid: string,
): Promise<string | null> {
  try {
    const catalog = await loadQbankCatalog();
    const parts = qbankSetUid.toLowerCase().split("::");
    const section = parts[1];
    const difficulty = parts[2];
    const expectedDir =
      section && difficulty ? `by-skill/${section}/${difficulty}/` : null;
    for (const entry of catalog.entries) {
      if (!qbankSetUidMatches(entry, qbankSetUid)) continue;
      const html = entry.questionsHtml ?? "";
      if (!expectedDir || html.toLowerCase().includes(expectedDir)) {
        return html;
      }
      // matched the uid but the file is in the wrong section/difficulty — skip.
    }
    return null;
  } catch {
    return null;
  }
}
