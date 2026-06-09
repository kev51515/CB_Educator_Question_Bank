/**
 * PrintSet
 * ========
 * Off-screen print container. Rendered in the DOM only during the
 * print workflow; under `@media print` (see index.css), everything *except*
 * `.print-set-container` is hidden, so this becomes the visible page.
 *
 * Layout:
 *   - One `<article>` per question (stimulus, stem, choices/SPR slot, note)
 *   - Final page: tabulated answer key (number / skill / answer letter)
 */
import type { Question } from "@/types";

const CHOICE_LETTERS = ["A", "B", "C", "D", "E"];

interface PrintSetProps {
  /** Questions to render in print order. */
  questions: Question[];
  /** Map of questionId → per-skill display number. `null` if unavailable. */
  numbers: Record<string, number | null>;
  /** Map of questionId → user note text. Notes appear directly below their question. */
  notes: Record<string, string>;
}

export function PrintSet({ questions, numbers, notes }: PrintSetProps) {
  return (
    <div className="print-set-container">
      <div className="print-set-title">
        OmniLMS — {questions.length} question{questions.length === 1 ? "" : "s"}
      </div>

      {questions.map((q, i) => (
        <PrintQuestion key={q.questionId} q={q} index={i} num={numbers[q.questionId]} note={notes[q.questionId]} />
      ))}

      <hr className="print-key-sep" />
      <h2 className="print-key-title">Answer Key</h2>
      <table className="print-key">
        <tbody>
          {questions.map((q) => (
            <AnswerKeyRow key={q.questionId} q={q} num={numbers[q.questionId]} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- helpers ----------

interface PrintQuestionProps {
  q: Question;
  index: number;
  num: number | null | undefined;
  note: string | undefined;
}

function PrintQuestion({ q, index, num, note }: PrintQuestionProps) {
  return (
    <article className="print-q">
      <header className="print-q-head">
        <span className="print-q-num">{num != null ? `#${num}` : `Question ${index + 1}`}</span>
        <span className="print-q-meta">
          {[q.section, q.difficulty, q.domain, q.skill].filter(Boolean).join(" · ")}
        </span>
      </header>
      {q.stimulus && (
        <div className="print-stimulus" dangerouslySetInnerHTML={{ __html: q.stimulus }} />
      )}
      <div className="print-stem" dangerouslySetInnerHTML={{ __html: q.stem }} />
      {q.type === "mcq" && q.answerOptions && (
        <ol className="print-choices">
          {q.answerOptions.map((o, j) => (
            <li key={o.id}>
              <span className="print-choice-letter">{CHOICE_LETTERS[j] ?? "?"}.</span>
              <span dangerouslySetInnerHTML={{ __html: o.content }} />
            </li>
          ))}
        </ol>
      )}
      {q.type === "spr" && (
        <div className="print-spr">Student-produced response: __________________</div>
      )}
      {note && <div className="print-note">Note: {note}</div>}
    </article>
  );
}

function AnswerKeyRow({ q, num }: { q: Question; num: number | null | undefined }) {
  let answer = "—";
  if (q.type === "mcq" && q.answerOptions && q.keys?.length) {
    const idx = q.answerOptions.findIndex((o) => o.id === q.keys?.[0]);
    if (idx >= 0) answer = CHOICE_LETTERS[idx] ?? "?";
  } else if (q.type === "spr" && q.keys?.length) {
    answer = q.keys[0];
  }
  return (
    <tr>
      <td>{num != null ? `#${num}` : q.questionId}</td>
      <td>{q.skill}</td>
      <td className="print-key-ans">{answer}</td>
    </tr>
  );
}
