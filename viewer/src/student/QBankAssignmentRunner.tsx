/**
 * QBankAssignmentRunner
 * =====================
 * Renders a question-bank-set style assignment inside an iframe pointing at
 * the static export at /exports/{questionsHtml}. The static page boots
 * test-runner.js + assignment-bridge.js (auto-loaded by test-runner when
 * `assignment_id` is present in the query string).
 *
 * Submission flow (bulletproof):
 *   - We generate `clientAttemptId` ONCE per mount and thread it through the
 *     iframe URL. The bridge uses the same id from both its iframe-direct RPC
 *     call AND the parent postMessage payload. The RPC dedups on that id, so
 *     however many channels reach the server, only one row is written.
 *   - When the bridge posts `qbank_submit`, we hand the payload to
 *     `submitWithRetry`, which stages to localStorage first and then retries
 *     with exponential backoff up to 5 times.
 *   - On mount, we sweep `listStagedSubmissions()` for any unsynced work
 *     belonging to THIS assignment and offer a Restore CTA.
 *
 * Path resolution: we look up `assignment.qbank_set_uid` against the public
 * catalog.json (cached for the duration of the route).
 *
 * Same-origin assumption: `/exports/` is served by this LMS host, so
 * `window.parent.postMessage(..., '*')` from the iframe works without CORS.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { assignmentReviewPath } from "@/lib/routes";
import { useToast } from "@/components";
import {
  listStagedSubmissions,
  submitWithRetry,
  unstageSubmission,
  type QBankSubmitInput,
  type QBankSubmitState,
} from "./qbankSubmit";
import type { StudentAssignment } from "./useStudentAssignments";

/**
 * Lane A migration 0042 adds these columns to assignments. Until the
 * StudentAssignment type is widened in useStudentAssignments.ts, read them
 * via this loose extension. The runtime row will carry them.
 */
type QBankAssignmentFields = {
  kind?: string | null;
  qbank_set_uid?: string | null;
  qbank_set_label?: string | null;
};

export type QBankAssignment = StudentAssignment & QBankAssignmentFields;

interface QBankAssignmentRunnerProps {
  assignment: QBankAssignment;
  onExit: () => void;
}

interface CatalogEntry {
  axis: string;
  section: string;
  difficulty: string;
  setId: string;
  label: string;
  topic: string;
  questionCount: number;
  questionsHtml: string;
}

interface CatalogJson {
  generatedAt: string;
  entries: CatalogEntry[];
}

interface QBankSubmitPayload {
  score_percent: number;
  correct_count: number;
  total_questions: number;
  answers: Record<string, string>;
  result_detail: Record<string, unknown>;
  started_at?: string;
}

type Stage =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; iframeSrc: string };

/**
 * Derive a stable lookup key from a catalog entry. Mirrors Lane B's encoding.
 */
function catalogKey(entry: CatalogEntry): string {
  const topicSlug = entry.topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${entry.axis}-${entry.section}-${entry.difficulty}-${topicSlug}-${entry.setId}`;
}

let catalogPromise: Promise<CatalogJson> | null = null;
function loadCatalog(): Promise<CatalogJson> {
  if (catalogPromise) return catalogPromise;
  catalogPromise = fetch("/exports/catalog.json")
    .then((res) => {
      if (!res.ok) throw new Error(`catalog.json fetch failed: ${res.status}`);
      return res.json() as Promise<CatalogJson>;
    })
    .catch((err: unknown) => {
      catalogPromise = null;
      throw err;
    });
  return catalogPromise;
}

async function resolveQuestionsHtml(
  qbankSetUid: string,
): Promise<string | null> {
  try {
    const catalog = await loadCatalog();
    const lower = qbankSetUid.toLowerCase();
    for (const entry of catalog.entries) {
      if (catalogKey(entry) === lower) return entry.questionsHtml;
    }
    return null;
  } catch {
    return null;
  }
}

function makeClientAttemptId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function QBankAssignmentRunner({
  assignment,
  onExit,
}: QBankAssignmentRunnerProps) {
  const [stage, setStage] = useState<Stage>({ kind: "loading" });
  const [submitState, setSubmitState] = useState<QBankSubmitState>({
    kind: "idle",
  });
  const [staged, setStaged] = useState<QBankSubmitInput | null>(null);
  const navigate = useNavigate();
  const toast = useToast();

  // Stable for the entire iframe lifetime so the bridge + retry loop + recovery
  // path all share the same dedup key. Never regenerate mid-test.
  const clientAttemptIdRef = useRef<string>(makeClientAttemptId());
  // Latest payload we received from the bridge, so the Retry button can resend.
  const lastPayloadRef = useRef<QBankSubmitPayload | null>(null);

  const title = useMemo(
    () => assignment.qbank_set_label ?? assignment.title,
    [assignment],
  );

  const bootstrap = useCallback(async (): Promise<void> => {
    setStage({ kind: "loading" });
    const uid = assignment.qbank_set_uid ?? "";
    if (!uid) {
      setStage({
        kind: "error",
        message:
          "This assignment isn't linked to a question-bank set. Ask your teacher to re-save it.",
      });
      return;
    }
    const path = await resolveQuestionsHtml(uid);
    if (!path) {
      setStage({
        kind: "error",
        message:
          "Couldn't find the question set for this assignment in the catalog.",
      });
      return;
    }
    const url = new URL(`/exports/${path}`, window.location.origin);
    url.searchParams.set("mode", "test");
    url.searchParams.set("assignment_id", assignment.id);
    url.searchParams.set("client_attempt_id", clientAttemptIdRef.current);
    // Back-compat: legacy bridge builds read `attempt_id`.
    url.searchParams.set("attempt_id", clientAttemptIdRef.current);
    setStage({
      kind: "ready",
      iframeSrc: url.pathname + url.search,
    });
  }, [assignment]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // On mount, look for any staged-but-not-confirmed submission for THIS
  // assignment. If found, surface a Restore banner so the student can re-fire
  // the submit (the RPC is idempotent on client_attempt_id).
  useEffect(() => {
    const found = listStagedSubmissions().find(
      (s) => s.assignmentId === assignment.id,
    );
    if (found) setStaged(found);
    // We only want this on mount per assignment id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignment.id]);

  const runSubmit = useCallback(
    async (input: QBankSubmitInput): Promise<void> => {
      try {
        const { attemptId } = await submitWithRetry(
          supabase,
          input,
          setSubmitState,
        );
        toast.success("Submitted", "Your test was saved.");
        navigate(assignmentReviewPath(assignment.id, attemptId), {
          replace: true,
        });
      } catch {
        // submitWithRetry already pushed an error state; toast is enough here.
        toast.error("Couldn't submit", "We saved your answers locally.");
      }
    },
    [assignment.id, navigate, toast],
  );

  // Listen for the bridge's submit message. Same-origin guarantee means we
  // can trust the data; we still validate the shape defensively.
  useEffect(() => {
    function onMessage(ev: MessageEvent): void {
      if (ev.origin !== window.location.origin) return;
      const data = ev.data as
        | { type?: string; payload?: unknown; client_attempt_id?: string }
        | null;
      if (!data) return;

      // Iframe-direct path already succeeded: short-circuit the parent retry.
      if (data.type === "qbank_submit_done") {
        const incoming = data as { attempt_id?: string | null };
        const attemptId =
          (typeof incoming.attempt_id === "string" && incoming.attempt_id) ||
          clientAttemptIdRef.current;
        unstageSubmission(clientAttemptIdRef.current);
        setSubmitState({ kind: "success", attemptId });
        navigate(assignmentReviewPath(assignment.id, attemptId), {
          replace: true,
        });
        return;
      }

      if (data.type !== "qbank_submit" || !data.payload) return;
      const payload = data.payload as QBankSubmitPayload;
      lastPayloadRef.current = payload;
      void runSubmit({
        assignmentId: assignment.id,
        clientAttemptId: clientAttemptIdRef.current,
        payload: payload as unknown as Record<string, unknown>,
      });
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [assignment.id, navigate, runSubmit]);

  const handleRetry = useCallback((): void => {
    const payload = lastPayloadRef.current;
    if (!payload) {
      // Edge case: lost the in-memory payload (component remount mid-error).
      // Restore from staging if present.
      const found = listStagedSubmissions().find(
        (s) => s.clientAttemptId === clientAttemptIdRef.current,
      );
      if (!found) {
        toast.error("Nothing to retry", "Please retake the test.");
        return;
      }
      void runSubmit(found);
      return;
    }
    void runSubmit({
      assignmentId: assignment.id,
      clientAttemptId: clientAttemptIdRef.current,
      payload: payload as unknown as Record<string, unknown>,
    });
  }, [assignment.id, runSubmit, toast]);

  const handleDownloadAnswers = useCallback((): void => {
    const payload = lastPayloadRef.current;
    if (!payload) {
      toast.info("Nothing to download yet.");
      return;
    }
    try {
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `qbank-attempt-${clientAttemptIdRef.current}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Download failed.";
      toast.error("Couldn't download", message);
    }
  }, [toast]);

  const handleRestoreStaged = useCallback((): void => {
    if (!staged) return;
    setStaged(null);
    void runSubmit(staged);
  }, [staged, runSubmit]);

  const handleDismissStaged = useCallback((): void => {
    if (!staged) return;
    unstageSubmission(staged.clientAttemptId);
    setStaged(null);
  }, [staged]);

  if (stage.kind === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-sm text-slate-500 dark:text-slate-400">
        Preparing your question set…
      </div>
    );
  }

  if (stage.kind === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
        <div className="max-w-md w-full rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-6 space-y-4 text-center">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Couldn't start this assignment
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {stage.message}
          </p>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => void bootstrap()}
              className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={onExit}
              className="rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 text-sm font-medium px-4 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // stage.kind === "ready"
  return (
    <div className="h-screen w-screen flex flex-col bg-slate-50 dark:bg-slate-950">
      <header className="flex items-center justify-between gap-3 px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Taking
          </div>
          <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
            {title}
          </div>
        </div>
        <button
          type="button"
          onClick={onExit}
          className="min-h-11 inline-flex items-center rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 text-sm font-medium px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          Back
        </button>
      </header>

      {staged && submitState.kind === "idle" && (
        <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900 text-sm flex items-center justify-between gap-3">
          <span className="text-amber-900 dark:text-amber-100">
            Found unsynced answers from before.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRestoreStaged}
              className="min-h-11 inline-flex items-center rounded-md bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium px-3 py-1.5"
            >
              Restore
            </button>
            <button
              type="button"
              onClick={handleDismissStaged}
              className="min-h-11 inline-flex items-center rounded-md ring-1 ring-amber-300 dark:ring-amber-800 text-xs font-medium px-3 py-1.5 text-amber-900 dark:text-amber-100 hover:bg-amber-100 dark:hover:bg-amber-900/40"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {submitState.kind === "submitting" && (
        <div className="px-4 py-2 bg-indigo-50 dark:bg-indigo-950/40 border-b border-indigo-200 dark:border-indigo-900 text-sm text-indigo-900 dark:text-indigo-100">
          Submitting your test… (try {submitState.attempt} of 5)
        </div>
      )}

      {submitState.kind === "success" && (
        <div className="px-4 py-2 bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-200 dark:border-emerald-900 text-sm text-emerald-900 dark:text-emerald-100">
          ✓ Submitted. Redirecting…
        </div>
      )}

      {submitState.kind === "error" && (
        <div className="px-4 py-2 bg-rose-50 dark:bg-rose-950/40 border-b border-rose-200 dark:border-rose-900 text-sm flex items-center justify-between gap-3">
          <span className="text-rose-900 dark:text-rose-100">
            {submitState.message}
          </span>
          {submitState.canRetry && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRetry}
                className="min-h-11 inline-flex items-center rounded-md bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium px-3 py-1.5"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={handleDownloadAnswers}
                className="min-h-11 inline-flex items-center rounded-md ring-1 ring-rose-300 dark:ring-rose-800 text-xs font-medium px-3 py-1.5 text-rose-900 dark:text-rose-100 hover:bg-rose-100 dark:hover:bg-rose-900/40"
              >
                Download answers
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex-1 p-2">
        <div className="h-full w-full rounded-xl overflow-hidden ring-1 ring-slate-200 dark:ring-slate-800 bg-white">
          <iframe
            title={title}
            src={stage.iframeSrc}
            className="block h-full w-full border-0"
            // Same-origin so postMessage works; no need for sandbox.
          />
        </div>
      </div>
    </div>
  );
}
