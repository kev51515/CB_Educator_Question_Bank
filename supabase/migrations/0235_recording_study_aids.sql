-- =============================================================================
-- Migration: 0235_recording_study_aids.sql
-- Description: "AI study aids" generated from a recording — flashcards, a
--   study guide (markdown), and a key-terms glossary — for students to learn
--   from. Owner-triggered, on demand (mirrors the quiz draft flow). Students
--   the recording is SHARED to (0225) can VIEW them read-only.
--
--   One table, 1:1 with a recording (recording_id PK), mirroring
--   recording_notes (0208): NO owner_id column — ownership is derived through
--   the parent recording. RLS:
--     - owner ALL  via EXISTS(recording owned by auth.uid())
--     - admin read via is_admin(auth.uid())
--     - shared read via is_recording_shared_to_me(recording_id)  (0225 helper)
--
-- Forward-only. Idempotent re-runs OK. Numbered 0235 (0233/0234 taken).
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1: recording_study_aids — the AI study-aids output (1:1)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.recording_study_aids (
  recording_id uuid PRIMARY KEY REFERENCES public.recordings(id) ON DELETE CASCADE,
  -- [{front, back}] — flashcard prompts + answers (10-20).
  flashcards   jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Markdown with ## sections — a learner-facing study guide.
  study_guide  text,
  -- [{term, definition}] — key-terms glossary.
  glossary     jsonb NOT NULL DEFAULT '[]'::jsonb,
  model        text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_recording_study_aids_updated_at ON public.recording_study_aids;
CREATE TRIGGER trg_recording_study_aids_updated_at
  BEFORE UPDATE ON public.recording_study_aids
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2: RLS — owner-all, admin-read, shared-read (mirrors recording_notes)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.recording_study_aids ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recording_study_aids: owner all"   ON public.recording_study_aids;
DROP POLICY IF EXISTS "recording_study_aids: admin read"  ON public.recording_study_aids;
DROP POLICY IF EXISTS "recording_study_aids: shared read" ON public.recording_study_aids;

CREATE POLICY "recording_study_aids: owner all"
  ON public.recording_study_aids
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.recordings r
     WHERE r.id = recording_study_aids.recording_id
       AND r.owner_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.recordings r
     WHERE r.id = recording_study_aids.recording_id
       AND r.owner_id = (SELECT auth.uid())
  ));

CREATE POLICY "recording_study_aids: admin read"
  ON public.recording_study_aids
  FOR SELECT
  USING (public.is_admin((SELECT auth.uid())));

-- Additive: students the recording is shared to may READ the study aids.
-- Combines with the owner + admin SELECT policies via OR (mirrors 0225).
CREATE POLICY "recording_study_aids: shared read"
  ON public.recording_study_aids
  FOR SELECT
  USING (public.is_recording_shared_to_me(recording_id));

-- =============================================================================
