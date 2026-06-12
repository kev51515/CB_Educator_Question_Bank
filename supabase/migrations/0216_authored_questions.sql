-- =============================================================================
-- Migration: 0216_authored_questions.sql
-- Description: Phase 3 of the Recordings feature — AI-drafted quiz questions
--   generated from a recording's transcript/notes. See docs/RECORDINGS_FEATURE.md.
--
--   `authored_questions` holds DRAFT (and later published) multiple-choice
--   questions the educator reviews/edits before they go live. This is the
--   net-new "teacher-authored question" store the LMS didn't have — qbank sets
--   were static-catalog-only.
--
--   PUBLISH (turning these into a student-takeable assignment) is deliberately
--   NOT in this migration: that step couples to the assignment/runner system
--   and is being designed separately. For now these rows are draft content
--   owned by, and visible only to, their author.
--
-- NOTE: numbered 0216 but a parallel session is adding migrations rapidly
--   (0209–0215 as of authoring). Re-check `supabase migration list` for a
--   collision and renumber before pushing if needed (the usual gotcha).
--
-- Forward-only. Idempotent re-runs OK.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.authored_questions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Source recording (nullable so the table can also back manual authoring later).
  recording_id   uuid REFERENCES public.recordings(id) ON DELETE CASCADE,
  -- Denormalized author for simple owner-only RLS.
  owner_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Optional course this draft is intended for (set at publish time later).
  course_id      uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  position       integer NOT NULL DEFAULT 0,
  -- 'sat' = SAT-bank-shaped (passage/stem + 4 choices); 'general' = plain MCQ.
  style          text NOT NULL DEFAULT 'general'
                   CHECK (style IN ('sat', 'general')),
  stem           text NOT NULL,
  -- { "A": "…", "B": "…", "C": "…", "D": "…" } — mirrors test_questions.choices.
  choices        jsonb NOT NULL DEFAULT '{}'::jsonb,
  correct_answer text,                 -- choice key, e.g. "B"
  rationale      text,
  status         text NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'published')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS authored_questions_recording_idx
  ON public.authored_questions (recording_id, position);
CREATE INDEX IF NOT EXISTS authored_questions_owner_idx
  ON public.authored_questions (owner_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_authored_questions_updated_at ON public.authored_questions;
CREATE TRIGGER trg_authored_questions_updated_at
  BEFORE UPDATE ON public.authored_questions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS — owner-only (admins can read for support).
ALTER TABLE public.authored_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authored_questions: owner all"  ON public.authored_questions;
DROP POLICY IF EXISTS "authored_questions: admin read" ON public.authored_questions;

CREATE POLICY "authored_questions: owner all"
  ON public.authored_questions
  FOR ALL
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));

CREATE POLICY "authored_questions: admin read"
  ON public.authored_questions
  FOR SELECT
  USING (public.is_admin((SELECT auth.uid())));

-- =============================================================================
