import { useEffect, useMemo, useState } from "react";
import type { Question } from "@/types";

interface StepRationaleProps {
  question: Question;
  fontSizeVar?: string; // e.g. "14px"
}

const MIN_STEPS = 1;
const MAX_STEPS = 8;

/**
 * Parse a rationale HTML string into 1..8 ordered step strings.
 * Strategy:
 *   1. Split on </p> when paragraphs are present.
 *   2. If only one paragraph results, fall back to sentence-style splitting
 *      on a period followed by whitespace and a capital letter.
 *   3. Clamp results to [MIN_STEPS, MAX_STEPS].
 */
function parseSteps(rationale: string): string[] {
  const trimmed = (rationale ?? "").trim();
  if (!trimmed) return [];

  // First try paragraph-based split.
  let parts: string[] = [];
  if (/<\/p>/i.test(trimmed)) {
    parts = trimmed
      .split(/<\/p>/i)
      .map((p) => {
        const inner = p.trim();
        if (!inner) return "";
        // Re-close the paragraph for valid HTML rendering. The closing
        // </p> was consumed by split.
        return `${inner}</p>`;
      })
      .filter((p) => {
        // Strip tags to check whether anything renders.
        const text = p.replace(/<[^>]+>/g, "").trim();
        return text.length > 0;
      });
  }

  // If paragraph split produced ≤1 chunk, try sentence split on the
  // text content. We only apply this fallback when the rationale has
  // essentially one paragraph or is plain text.
  if (parts.length <= 1) {
    // Sentence split: ". " followed by a capital letter (or "! ", "? ").
    // Use a lookbehind for the punctuation so the period stays attached.
    const sentences = trimmed
      .split(/(?<=[.!?])\s+(?=[A-Z])/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (sentences.length > 1) {
      parts = sentences;
    } else {
      parts = [trimmed];
    }
  }

  // Clamp to [MIN_STEPS, MAX_STEPS]. If we have too many, merge the
  // overflow into the final step so no content is lost.
  if (parts.length > MAX_STEPS) {
    const head = parts.slice(0, MAX_STEPS - 1);
    const tail = parts.slice(MAX_STEPS - 1).join(" ");
    parts = [...head, tail];
  }
  if (parts.length < MIN_STEPS) {
    return [];
  }
  return parts;
}

export function StepRationale(props: StepRationaleProps): JSX.Element | null {
  const { question, fontSizeVar } = props;

  const steps = useMemo(
    () => parseSteps(question.rationale ?? ""),
    [question.rationale],
  );

  const [revealedCount, setRevealedCount] = useState<number>(0);

  // Reset when the question changes.
  useEffect(() => {
    setRevealedCount(0);
  }, [question.questionId]);

  if (steps.length === 0) {
    return null;
  }

  const total = steps.length;
  const allRevealed = revealedCount >= total;
  const noneRevealed = revealedCount === 0;

  const fontSize = fontSizeVar ?? "13.5px";

  return (
    <div className="mt-3" style={{ fontSize }}>
      {/* Top controls */}
      <div className="flex items-center gap-3 mb-2">
        <button
          type="button"
          onClick={() => setRevealedCount(total)}
          disabled={allRevealed}
          className="text-[12px] px-2.5 py-1 rounded-md bg-ink-100 text-ink-700 hover:bg-ink-200 disabled:opacity-40 disabled:cursor-not-allowed focus-ring"
        >
          Reveal all
        </button>
        <button
          type="button"
          onClick={() => setRevealedCount(0)}
          disabled={noneRevealed}
          className="text-[12px] px-2.5 py-1 rounded-md bg-ink-50 text-ink-600 hover:bg-ink-100 disabled:opacity-40 disabled:cursor-not-allowed focus-ring"
        >
          Hide all
        </button>
        <span className="text-[11px] text-ink-500">
          {revealedCount} / {total} revealed
        </span>
      </div>

      <ol className="list-none p-0 m-0">
        {steps.map((stepHtml, i) => {
          const stepNum = i + 1;
          const isRevealed = i < revealedCount;
          return (
            <li
              key={i}
              className="border border-ink-200 rounded-lg p-3 mb-2 bg-ink-50/50 text-[13.5px] leading-relaxed transition-opacity duration-300 ease-in-out"
              style={{ opacity: isRevealed ? 1 : 1 }}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                  Step {stepNum}
                </div>
                {!isRevealed && (
                  <button
                    type="button"
                    onClick={() =>
                      setRevealedCount((n) => Math.max(n, stepNum))
                    }
                    className="text-[11.5px] px-2 py-0.5 rounded-md bg-accent-50 text-accent-700 hover:bg-accent-100 focus-ring"
                  >
                    Reveal
                  </button>
                )}
              </div>
              {isRevealed ? (
                <div
                  className="q-html step-fade-in"
                  style={{
                    animation: "stepFadeIn 200ms ease-in",
                  }}
                  dangerouslySetInnerHTML={{ __html: stepHtml }}
                />
              ) : (
                <div className="text-ink-400 italic text-[12.5px]">
                  Hidden — click Reveal to show this step.
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
