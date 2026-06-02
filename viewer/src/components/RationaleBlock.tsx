/**
 * RationaleBlock
 * ==============
 * Reveal section that wraps `StepRationale` for the currently-visible
 * question. Rendered only when both `showRationale` is true and the
 * question has rationale content.
 *
 * The font-size variable (`--qfs`) is set on a parent in `Detail`, so this
 * component reads it via `calc()`. Extracted from Detail purely for
 * structural clarity — owns no state.
 */
import type { Question } from "@/types";
import { StepRationale } from "@/components/StepRationale";

interface RationaleBlockProps {
  /** The current question (passed through to `StepRationale`). */
  question: Question;
}

export function RationaleBlock({ question }: RationaleBlockProps) {
  return (
    <section
      className="mt-2 px-6 py-5 rounded-xl border border-ink-200 bg-ink-50 leading-relaxed"
      style={{ fontSize: "calc(var(--qfs) - 1.5px)" }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500 mb-3 flex items-center justify-between">
        <span>Rationale</span>
      </div>
      <StepRationale question={question} fontSizeVar={`calc(var(--qfs) - 1.5px)`} />
    </section>
  );
}
