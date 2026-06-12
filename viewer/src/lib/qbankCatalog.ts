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
import { supabase } from "@/lib/supabase";

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

export type QbankIframeResult =
  | { ok: true; iframeSrc: string }
  | { ok: false; message: string };

/**
 * Resolve a qbank assignment to the static-runner iframe URL the student loads.
 * Encapsulates the whole "which file + start the live attempt + build the URL"
 * flow so QBankAssignmentRunner stays a thin shell:
 *   1. AUTHORITATIVE path first — the stored `qbank_questions_html` (0220).
 *   2. Fallback to resolving `qbank_set_uid` against the catalog (legacy rows).
 *   3. start_qbank_attempt so the teacher Monitor sees the student live (0217),
 *      threading the attempt uuid into the URL for heartbeats. Best-effort.
 */
export async function buildQbankIframeSrc(args: {
  assignmentId: string;
  qbankSetUid: string;
  clientAttemptId: string;
}): Promise<QbankIframeResult> {
  let path: string | null = null;
  let uid = args.qbankSetUid ?? "";

  try {
    const { data } = await supabase
      .from("assignments")
      .select("qbank_questions_html, qbank_set_uid")
      .eq("id", args.assignmentId)
      .maybeSingle();
    if (data) {
      if (typeof data.qbank_questions_html === "string" && data.qbank_questions_html) {
        path = data.qbank_questions_html.replace(/^\/+/, "");
      }
      if (typeof data.qbank_set_uid === "string" && data.qbank_set_uid) uid = data.qbank_set_uid;
    }
  } catch {
    /* fall through to uid resolution */
  }

  if (!path && !uid) {
    return {
      ok: false,
      message:
        "This assignment isn't linked to a question-bank set. Ask your teacher to re-save it.",
    };
  }
  if (!path) path = await resolveQbankQuestionsHtml(uid);
  if (!path) {
    return {
      ok: false,
      message: "Couldn't find the question set for this assignment in the catalog.",
    };
  }

  let attemptUuid: string | null = null;
  try {
    const { data } = await supabase.rpc("start_qbank_attempt", {
      p_assignment_id: args.assignmentId,
      p_client_attempt_id: args.clientAttemptId,
    });
    if (typeof data === "string") attemptUuid = data;
  } catch {
    /* non-fatal: the iframe still runs; the bridge starts its own attempt */
  }

  const url = new URL(`/exports/${path}`, window.location.origin);
  url.searchParams.set("mode", "test");
  url.searchParams.set("assignment_id", args.assignmentId);
  url.searchParams.set("client_attempt_id", args.clientAttemptId);
  // Back-compat: legacy bridge builds read `attempt_id`.
  url.searchParams.set("attempt_id", args.clientAttemptId);
  if (attemptUuid) url.searchParams.set("attempt_uuid", attemptUuid);
  return { ok: true, iframeSrc: url.pathname + url.search };
}
