/**
 * SessionInsightsPanel — a compact, transcript-derived analytics card.
 *
 * Pure local computation (see insights.ts): per-speaker talk-time bars, plus a
 * small stat row (words/min, questions asked, # speakers). Renders nothing when
 * there's no measurable speech, so it's safe to mount unconditionally.
 */
import { useMemo } from "react";
import { computeSessionInsights } from "./insights";
import { formatDuration, speakerDisplay } from "./format";
import { NoteSectionHeading } from "./notesUi";
import type { RecordingPart } from "./types";

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
        {value}
      </span>
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
    </div>
  );
}

export function SessionInsightsPanel({ parts }: { parts: RecordingPart[] }) {
  const insights = useMemo(() => computeSessionInsights(parts), [parts]);

  if (insights.totalSpeechMs === 0 || insights.speakers.length === 0) return null;

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
      <NoteSectionHeading kind="topics">Session insights</NoteSectionHeading>

      {/* Talk-time bars */}
      <ul className="space-y-2.5">
        {insights.speakers.map((s) => {
          const pct = Math.round(s.pct * 100);
          const duration = formatDuration(s.ms / 1000);
          return (
            <li key={s.speaker}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  {speakerDisplay(s.speaker)}
                </span>
                <span className="tabular-nums text-slate-500 dark:text-slate-400">
                  {pct}%{duration ? ` · ${duration}` : ""}
                </span>
              </div>
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
                role="meter"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${speakerDisplay(s.speaker)} talk time ${pct} percent`}
              >
                <div
                  className="h-full rounded-full bg-indigo-500 transition-[width] duration-500 dark:bg-indigo-400"
                  style={{ width: `${Math.max(2, pct)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {/* Stat row */}
      <div className="flex flex-wrap gap-x-8 gap-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
        <Stat value={String(insights.wordsPerMinute)} label="words / min" />
        <Stat
          value={String(insights.questionCount)}
          label={insights.questionCount === 1 ? "question asked" : "questions asked"}
        />
        <Stat
          value={String(insights.speakerCount)}
          label={insights.speakerCount === 1 ? "speaker" : "speakers"}
        />
      </div>
    </div>
  );
}
