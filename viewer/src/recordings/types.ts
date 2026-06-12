/**
 * Recordings — shared types mirroring migration 0208.
 * See docs/RECORDINGS_FEATURE.md.
 */
import type { Domain } from "@/lib/domain";

export type RecordingSubject = "self" | "session";
export type RecordingStatus = "recording" | "processing" | "ready" | "failed";
export type PartStatus =
  | "uploading"
  | "queued"
  | "transcribing"
  | "transcribed"
  | "failed";

/** One utterance inside a Part's transcript (speaker-labelled). */
export interface Utterance {
  speaker: string; // e.g. "A" / "B" (AssemblyAI) — relabelled in the UI
  start_ms: number;
  end_ms: number;
  text: string;
}

export interface Recording {
  id: string;
  owner_id: string;
  course_id: string | null;
  domain: Domain;
  title: string;
  subject_type: RecordingSubject;
  consent_obtained: boolean;
  consent_note: string | null;
  status: RecordingStatus;
  duration_s: number;
  created_at: string;
  updated_at: string;
}

export interface RecordingPart {
  id: string;
  recording_id: string;
  part_index: number;
  audio_path: string | null;
  status: PartStatus;
  provider_id: string | null;
  transcript: Utterance[] | null;
  duration_s: number;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecordingTopic {
  title: string;
  summary: string;
  start_ms?: number;
  part_index?: number;
}
export interface RecordingActionItem {
  text: string;
  owner?: string;
}
export interface RecordingHighlight {
  quote: string;
  start_ms?: number;
  part_index?: number;
}

export interface RecordingNotes {
  recording_id: string;
  tldr: string | null;
  topics: RecordingTopic[];
  action_items: RecordingActionItem[];
  highlights: RecordingHighlight[];
  model: string | null;
  generated_at: string;
}

/** A recording plus its parts + notes, as the detail page consumes it. */
export interface RecordingDetail {
  recording: Recording;
  parts: RecordingPart[];
  notes: RecordingNotes | null;
}

// ── Phase 3: AI-drafted quiz questions ───────────────────────────────────────

export type QuizStyle = "sat" | "general";
export type AuthoredStatus = "draft" | "published";

export interface AuthoredQuestion {
  id: string;
  recording_id: string | null;
  owner_id: string;
  course_id: string | null;
  position: number;
  style: QuizStyle;
  stem: string;
  /** { A: "…", B: "…", C: "…", D: "…" } */
  choices: Record<string, string>;
  correct_answer: string | null;
  rationale: string | null;
  status: AuthoredStatus;
  created_at: string;
  updated_at: string;
}
