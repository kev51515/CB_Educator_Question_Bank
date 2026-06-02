-- =============================================================================
-- Migration: 0043_test_answer_timing.sql
-- Description: Phase-2 enrichment for the SAT Question Bank static-export
--   test runner. Adds per-question pacing analytics and a JSONB bag for the
--   auxiliary draft fields (mark-for-review, cross-out, currentIndex,
--   timeSpent, visits) that the Phase-1 schema deferred.
--
--   - `test_answers.time_spent_ms` — TOTAL ms accumulated on this question
--     across all visits. Distinct from the existing `answer_time_ms`, which
--     was meant to capture "time to first answer" and is left in place.
--   - `test_answers.revisit_count` — # of times the user landed on this
--     question during the attempt (>=1 for any seen question).
--   - `test_attempts.draft_meta` — JSONB bag holding marked / crossOut /
--     currentIndex / timeSpent / visits so the SupabaseAdapter can round-trip
--     a full draft. Only ever populated on UNSUBMITTED rows; cleaned up
--     implicitly by ON DELETE CASCADE when an attempt is cleared.
--   - Helper index for "slowest questions for me" attempt-level analytics.
-- All operations are idempotent — safe to re-apply on partially-migrated
-- environments.
-- =============================================================================

ALTER TABLE public.test_answers
  ADD COLUMN IF NOT EXISTS time_spent_ms  integer,
  ADD COLUMN IF NOT EXISTS revisit_count  integer;

ALTER TABLE public.test_attempts
  ADD COLUMN IF NOT EXISTS draft_meta jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Helpful for "slowest questions" rollups within a single attempt.
CREATE INDEX IF NOT EXISTS test_answers_attempt_time
  ON public.test_answers (attempt_id, time_spent_ms DESC NULLS LAST);
