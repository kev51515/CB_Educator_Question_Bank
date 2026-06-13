/**
 * Recordings — "Session insights": pure, transcript-derived analytics.
 *
 * No AI, no DB, no network. Given a recording's parts (each with an optional
 * speaker-labelled transcript), compute per-speaker talk-time, pace, and a few
 * engagement signals so a coach/counselor/teacher can reflect on a session
 * ("you spoke 70% of the time"). All functions here are React-free.
 */
import type { RecordingPart, Utterance } from "./types";

export interface SpeakerStat {
  speaker: string;
  ms: number;
  pct: number; // 0..1 share of totalSpeechMs
  words: number;
}

export interface SessionInsights {
  totalSpeechMs: number;
  speakers: SpeakerStat[]; // sorted desc by ms
  totalWords: number;
  wordsPerMinute: number; // over total speech time
  questionCount: number; // utterances whose trimmed text ends with "?"
  utteranceCount: number;
  speakerCount: number;
}

const EMPTY: SessionInsights = {
  totalSpeechMs: 0,
  speakers: [],
  totalWords: 0,
  wordsPerMinute: 0,
  questionCount: 0,
  utteranceCount: 0,
  speakerCount: 0,
};

/** Whitespace-split word count; robust to null/empty strings. */
function wordCount(text: string | null | undefined): number {
  if (!text) return 0;
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/** Talk-time of one utterance in ms, clamped to >= 0. */
function utteranceMs(u: Utterance): number {
  return Math.max(0, (u.end_ms ?? 0) - (u.start_ms ?? 0));
}

/**
 * Compute session insights across every part's transcript. Returns all-zero /
 * empty values when there's nothing to measure (no parts, null/empty
 * transcripts, or zero total speech time).
 */
export function computeSessionInsights(
  parts: RecordingPart[] | null | undefined,
): SessionInsights {
  if (!parts || parts.length === 0) return EMPTY;

  const bySpeaker = new Map<string, { ms: number; words: number }>();
  let totalSpeechMs = 0;
  let totalWords = 0;
  let questionCount = 0;
  let utteranceCount = 0;

  for (const part of parts) {
    const transcript = part?.transcript;
    if (!transcript || transcript.length === 0) continue;
    for (const u of transcript) {
      if (!u) continue;
      const ms = utteranceMs(u);
      const words = wordCount(u.text);
      const speaker = u.speaker || "?";

      const acc = bySpeaker.get(speaker) ?? { ms: 0, words: 0 };
      acc.ms += ms;
      acc.words += words;
      bySpeaker.set(speaker, acc);

      totalSpeechMs += ms;
      totalWords += words;
      utteranceCount += 1;
      if (u.text && u.text.trim().endsWith("?")) questionCount += 1;
    }
  }

  if (totalSpeechMs === 0) return EMPTY;

  const speakers: SpeakerStat[] = Array.from(bySpeaker.entries())
    .map(([speaker, { ms, words }]) => ({
      speaker,
      ms,
      pct: ms / totalSpeechMs,
      words,
    }))
    .sort((a, b) => b.ms - a.ms);

  const minutes = totalSpeechMs / 60_000;
  const wordsPerMinute = minutes > 0 ? Math.round(totalWords / minutes) : 0;

  return {
    totalSpeechMs,
    speakers,
    totalWords,
    wordsPerMinute,
    questionCount,
    utteranceCount,
    speakerCount: speakers.length,
  };
}
