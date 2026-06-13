/**
 * AI study-aids types — flashcards, a markdown study guide, and a key-terms
 * glossary generated from a recording (migration 0235 + the
 * generate-study-aids-from-recording edge fn). Defined here, NOT in the shared
 * recordings/types.ts (a parallel lane owns that file).
 */

export interface Flashcard {
  front: string;
  back: string;
}

export interface GlossaryEntry {
  term: string;
  definition: string;
}

export interface RecordingStudyAids {
  recording_id: string;
  flashcards: Flashcard[];
  study_guide: string | null;
  glossary: GlossaryEntry[];
  model: string | null;
  generated_at: string;
}
