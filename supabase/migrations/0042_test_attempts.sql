-- =============================================================================
-- Migration: 0042_test_attempts.sql
-- Description: Persistence backend for the SAT Question Bank static-export
--   test runner. Mirrors the AttemptPersistence interface locked in
--   docs/DESIGN_ARCH.md §4 (test-runner saveDraft / saveAttempt /
--   listLatestAttempts / listInProgress / clearForSet / clearAll). When a user
--   is signed in, the static exports (and the React viewer) write here so that
--   "your progress" surfaces survive across devices instead of being stuck in
--   localStorage on whichever browser took the test.
--
--   - One `test_attempts` row per session. `submitted_at IS NULL` is a draft.
--   - One `test_answers` row per answered (or skipped-with-blank) question.
--   - RLS scoped to the owning auth.uid so a single anon key is safe to ship
--     into the static HTML pages.
--   - Partial unique index enforces "at most one in-progress draft per
--     (user, set_uid)" — matches the localStorage contract where a fresh draft
--     replaces any prior one for the same setUid.
-- =============================================================================

-- Attempts: one row per finished or in-progress test session.
CREATE TABLE IF NOT EXISTS public.test_attempts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  set_uid       text NOT NULL,
  started_at    timestamptz NOT NULL DEFAULT now(),
  submitted_at  timestamptz,
  seconds_taken integer,
  score         integer,
  total         integer,
  source        text NOT NULL CHECK (source IN ('static', 'viewer'))
);

CREATE INDEX IF NOT EXISTS test_attempts_user_set
  ON public.test_attempts (user_id, set_uid, submitted_at DESC);

-- One row per answered (or skipped) question within an attempt.
CREATE TABLE IF NOT EXISTS public.test_answers (
  attempt_id      uuid NOT NULL REFERENCES public.test_attempts(id) ON DELETE CASCADE,
  question_id     text NOT NULL,
  chosen          text,
  is_correct      boolean,
  answer_time_ms  integer,
  PRIMARY KEY (attempt_id, question_id)
);

-- RLS so users only see their own data. Both tables are owner-scoped; answers
-- are reached through the parent attempt's user_id.
ALTER TABLE public.test_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_answers  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS test_attempts_owner ON public.test_attempts;
CREATE POLICY test_attempts_owner ON public.test_attempts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS test_answers_owner ON public.test_answers;
CREATE POLICY test_answers_owner ON public.test_answers
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.test_attempts a
       WHERE a.id = test_answers.attempt_id
         AND a.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.test_attempts a
       WHERE a.id = test_answers.attempt_id
         AND a.user_id = auth.uid()
    )
  );

-- A "draft" is just an unsubmitted attempt — submitted_at IS NULL.
-- Enforce one draft per (user_id, set_uid) via a partial unique index.
CREATE UNIQUE INDEX IF NOT EXISTS test_attempts_one_draft_per_set
  ON public.test_attempts (user_id, set_uid)
  WHERE submitted_at IS NULL;
