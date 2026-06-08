-- =============================================================================
-- Migration: 0120_test_question_rationale.sql
-- Description: Optional per-choice rationale on test_questions, powering Review
--              Mode's "Explain" toggle (which word is wrong + why).
--
-- jsonb shape (all keys optional):
--   {
--     "A": { "wrong": "overlooked", "reason": "The passage says Hashimoto
--            *embraced* tradition — the opposite of overlooking it." },
--     "C": { "reason": "Matches the passage: he adopted traditional methods." },
--     ...
--   }
-- For a wrong choice, `wrong` is the distractor phrase to flag and `reason`
-- explains it; the correct choice may carry just a `reason` (why it's right).
--
-- Read via the staff `tests` SELECT (0048 RLS: is_staff). Students cannot read
-- test_questions at all, so no extra policy is needed. Nullable; empty until
-- authored/generated. Forward-only.
-- =============================================================================

ALTER TABLE public.test_questions
  ADD COLUMN IF NOT EXISTS rationale jsonb;

-- =============================================================================
-- END OF MIGRATION 0120_test_question_rationale.sql
-- =============================================================================
