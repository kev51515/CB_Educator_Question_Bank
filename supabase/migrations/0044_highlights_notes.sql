-- =============================================================================
-- Migration: 0044_highlights_notes.sql
-- Description: Adds per-question highlights and notes to the SAT Question Bank
--   test runner. These are written to JSONB columns on submitted attempt rows
--   so the student's annotations outlive the in-progress draft (which lives
--   inside `test_attempts.draft_meta` until submission).
--
--   Shape:
--     highlights jsonb := { [qid]: [{ hid, color, pane, start, end, text }] }
--     notes      jsonb := { [qid]: "free text up to 8000 chars" }
--
--   Drafts continue to round-trip through `test_attempts.draft_meta` (added
--   by 0043). On submit, the SupabaseAdapter additionally copies the final
--   highlights + notes to these top-level columns so reporting / archival
--   queries don't have to peer inside `draft_meta`.
--
-- Idempotent — safe to re-apply.
-- =============================================================================

ALTER TABLE public.test_attempts
  ADD COLUMN IF NOT EXISTS highlights jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS notes      jsonb NOT NULL DEFAULT '{}'::jsonb;
