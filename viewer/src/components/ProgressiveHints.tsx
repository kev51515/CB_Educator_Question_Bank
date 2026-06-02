import { useEffect, useMemo, useState } from "react";
import type { Question } from "@/types";

interface ProgressiveHintsProps {
  question: Question;
}

/**
 * Split the rationale into progressive hint chunks.
 * Prefers paragraph splits when the rationale contains HTML <p> tags;
 * falls back to sentence splits otherwise.
 * Each returned string is non-empty and trimmed.
 */
function splitRationale(rationale: string): string[] {
  if (!rationale) return [];
  const trimmed = rationale.trim();
  if (!trimmed) return [];

  // Prefer paragraph splits when HTML paragraph tags are present.
  if (/<\/p>/i.test(trimmed)) {
    const parts = trimmed
      .split(/<\/p>/i)
      .map((p) => {
        // Re-close the paragraph for valid HTML rendering.
        const inner = p.trim();
        if (!inner) return "";
        // Strip a leading <p ...> if present so we can re-wrap cleanly.
        return inner.endsWith(">") ? `${inner}</p>` : `${inner}</p>`;
      })
      .filter((p) => {
        // Filter out empty paragraphs (e.g., "<p></p>" or "<p>  </p>").
        const text = p.replace(/<[^>]+>/g, "").trim();
        return text.length > 0;
      });
    if (parts.length > 0) return parts;
  }

  // Fallback: sentence-based split on ". " preserving the period.
  const sentences = trimmed
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return sentences.length > 0 ? sentences : [trimmed];
}

export function ProgressiveHints({ question }: ProgressiveHintsProps): JSX.Element {
  const hints = useMemo(() => splitRationale(question.rationale ?? ""), [question.rationale]);
  const [revealed, setRevealed] = useState<number>(0);

  // Reset when the question changes.
  useEffect(() => {
    setRevealed(0);
  }, [question.questionId]);

  if (hints.length === 0) {
    return <></>;
  }

  const total = hints.length;
  const shown = hints.slice(0, revealed);
  const canReveal = revealed < total;
  const allRevealed = revealed >= total;

  return (
    <div className="mt-3">
      {shown.length > 0 && (
        <ol className="list-none p-0 m-0">
          {shown.map((hint, i) => (
            <li
              key={i}
              className="bg-amber-50 border border-amber-200 text-ink-700 p-3 rounded-lg mb-2 text-[13px]"
            >
              <div className="text-[11px] font-medium text-amber-700 mb-1 uppercase tracking-wide">
                Hint {i + 1}
                {i === total - 1 && total > 1 ? " (final)" : ""}
              </div>
              <div
                className="leading-relaxed"
                dangerouslySetInnerHTML={{ __html: hint }}
              />
            </li>
          ))}
        </ol>
      )}

      <div className="flex items-center gap-3 mt-1">
        {canReveal && (
          <button
            type="button"
            onClick={() => setRevealed((n) => Math.min(total, n + 1))}
            className="text-[12px] px-2.5 py-1 rounded-md bg-amber-100 text-amber-800 hover:bg-amber-200 focus-ring"
          >
            {revealed === 0 ? "Show hint 1" : `Show hint ${revealed + 1} of ${total}`}
          </button>
        )}
        {allRevealed && total > 1 && (
          <span className="text-[11.5px] text-ink-500">All hints shown</span>
        )}
        {revealed > 0 && (
          <button
            type="button"
            onClick={() => setRevealed(0)}
            className="text-[11.5px] text-ink-500 hover:text-ink-700 underline underline-offset-2 focus-ring"
          >
            Reset hints
          </button>
        )}
      </div>
    </div>
  );
}
