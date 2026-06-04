/**
 * QuestionPassage — renders the optional stimulus/passage for a question with
 * a collapse/expand toggle. Resets to "expanded" when the question changes.
 */
import { useEffect, useState } from "react";
import type { TestQuestion } from "@/mocktest/types";
import { RichText } from "./RichText";

interface QuestionPassageProps {
  question: TestQuestion;
}

export function QuestionPassage({ question }: QuestionPassageProps) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(false);
  }, [question.id]);

  if (!question.passage) return null;

  if (collapsed) {
    return (
      <div className="mb-5">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1 transition-colors"
          aria-label="Show passage"
        >
          Show Passage
          <kbd className="ml-1 font-mono opacity-60 text-[10px]">P</kbd>
        </button>
      </div>
    );
  }

  return (
    <div className="mb-5">
      <section
        className="bg-slate-100 dark:bg-slate-900 rounded-lg p-4 border border-slate-200 dark:border-slate-800"
        aria-label="Reading passage"
      >
        <RichText
          text={question.passage}
          isHtml={question.isHtml}
          className="text-sm leading-relaxed text-slate-800 dark:text-slate-200"
        />
      </section>
      <div className="flex justify-end mt-1">
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
          aria-label="Hide passage"
        >
          Hide Passage
          <kbd className="font-mono opacity-60 text-[10px] ml-1">P</kbd>
        </button>
      </div>
    </div>
  );
}
