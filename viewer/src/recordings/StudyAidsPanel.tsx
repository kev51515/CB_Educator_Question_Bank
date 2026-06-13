/**
 * StudyAidsPanel — AI study aids built from a recording: flashcards (click to
 * flip), a markdown study guide, and a key-terms glossary.
 *
 * Owner (canGenerate): a reveal/Generate CTA mirroring QuizDraftPanel; the
 * educator regenerates on demand. Shared students (!canGenerate): read-only —
 * they just see the rendered aids (RLS gates the row).
 *
 * The app has no markdown-renderer dependency, so the study guide is rendered
 * by a tiny inline renderer that handles the structure we prompt Gemini for
 * (`## ` section headings + `- ` bullet lists + paragraphs). No extra import.
 */
import { useState } from "react";
import { Skeleton, useToast } from "@/components";
import { generateStudyAids, useStudyAids } from "./useStudyAids";
import type { Flashcard, GlossaryEntry } from "./studyAids";

/** Minimal markdown → React for `## ` headings, `- ` bullets, and paragraphs. */
function StudyGuideMarkdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: JSX.Element[] = [];
  let bullets: string[] = [];
  let para: string[] = [];

  const flushBullets = (key: string) => {
    if (!bullets.length) return;
    blocks.push(
      <ul key={key} className="ml-4 list-disc space-y-1 text-sm text-slate-700 dark:text-slate-300">
        {bullets.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>,
    );
    bullets = [];
  };
  const flushPara = (key: string) => {
    if (!para.length) return;
    blocks.push(
      <p key={key} className="text-sm text-slate-700 dark:text-slate-300">
        {para.join(" ")}
      </p>,
    );
    para = [];
  };

  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (heading) {
      flushBullets(`ul-${i}`);
      flushPara(`p-${i}`);
      blocks.push(
        <h3
          key={`h-${i}`}
          className="mt-3 text-sm font-semibold text-slate-900 first:mt-0 dark:text-slate-100"
        >
          {heading[1].replace(/\*\*/g, "")}
        </h3>,
      );
    } else if (bullet) {
      flushPara(`p-${i}`);
      bullets.push(bullet[1].replace(/\*\*/g, ""));
    } else if (line.trim() === "") {
      flushBullets(`ul-${i}`);
      flushPara(`p-${i}`);
    } else {
      flushBullets(`ul-${i}`);
      para.push(line.replace(/\*\*/g, ""));
    }
  });
  flushBullets("ul-end");
  flushPara("p-end");

  return <div className="space-y-2">{blocks}</div>;
}

function FlashcardCard({ card, index }: { card: Flashcard; index: number }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setFlipped((f) => !f)}
      aria-pressed={flipped}
      className="flex min-h-[5rem] w-full flex-col items-start gap-1 rounded-lg border border-slate-200 bg-white p-3 text-left transition-colors hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-indigo-600"
    >
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {flipped ? "Answer" : `Card ${index + 1} · tap to flip`}
      </span>
      <span className="text-sm text-slate-800 dark:text-slate-200">
        {flipped ? card.back : card.front}
      </span>
    </button>
  );
}

function GlossaryList({ entries }: { entries: GlossaryEntry[] }) {
  return (
    <dl className="space-y-2">
      {entries.map((g, i) => (
        <div key={i} className="text-sm">
          <dt className="font-medium text-slate-900 dark:text-slate-100">{g.term}</dt>
          <dd className="text-slate-600 dark:text-slate-300">{g.definition}</dd>
        </div>
      ))}
    </dl>
  );
}

function SubHeading({ children }: { children: string }) {
  return (
    <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
      {children}
    </h3>
  );
}

export function StudyAidsPanel({
  recordingId,
  canGenerate,
}: {
  recordingId: string;
  canGenerate: boolean;
}) {
  const { aids, loading, refresh } = useStudyAids(recordingId);
  const toast = useToast();
  const [generating, setGenerating] = useState(false);

  async function handleGenerate() {
    setGenerating(true);
    try {
      await generateStudyAids(recordingId);
      await refresh();
      toast.success("Study aids ready");
    } catch (e) {
      toast.error(`Couldn't generate study aids: ${(e as Error).message}`);
    } finally {
      setGenerating(false);
    }
  }

  const hasAids =
    !!aids &&
    (aids.flashcards.length > 0 ||
      aids.glossary.length > 0 ||
      !!aids.study_guide);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <Skeleton className="mb-3 h-4 w-24" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  // Read-only viewer with nothing to show — render nothing rather than a blank box.
  if (!canGenerate && !hasAids) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Study aids
        </h2>
        {canGenerate && (
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={generating}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {generating ? "Generating…" : hasAids ? "Regenerate" : "Generate study aids"}
          </button>
        )}
      </div>

      {!hasAids ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {canGenerate
            ? "Generate flashcards, a study guide, and a key-terms glossary from this recording — created only when you ask."
            : "No study aids yet."}
        </p>
      ) : (
        <div className="space-y-5">
          {aids!.flashcards.length > 0 && (
            <section>
              <SubHeading>Flashcards</SubHeading>
              <div className="grid gap-2 sm:grid-cols-2">
                {aids!.flashcards.map((c, i) => (
                  <FlashcardCard key={i} card={c} index={i} />
                ))}
              </div>
            </section>
          )}

          {aids!.study_guide && (
            <section>
              <SubHeading>Study guide</SubHeading>
              <StudyGuideMarkdown source={aids!.study_guide} />
            </section>
          )}

          {aids!.glossary.length > 0 && (
            <section>
              <SubHeading>Key terms</SubHeading>
              <GlossaryList entries={aids!.glossary} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
