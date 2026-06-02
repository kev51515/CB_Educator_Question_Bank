-- ============================================================================
-- 0057_best_attempts_by_effective_score.sql
-- ----------------------------------------------------------------------------
-- Wave 21 M127 follow-up: fix `assignment_best_attempts` to pick the best
-- attempt per (assignment_id, student_id) by the EFFECTIVE score
-- (COALESCE(score_override, score_percent)) rather than the raw auto-score
-- (score_percent).
--
-- Why this exists
-- ---------------
-- Migration 0020 introduced `assignment_best_attempts` using
--   ORDER BY assignment_id, student_id, score_percent DESC NULLS LAST, ...
-- which picks the highest auto-scored attempt. After migration 0056 added
-- `score_override` (teacher manual override), a teacher could override an
-- attempt upward and the view would STILL prefer a different attempt whose
-- raw auto-score happened to be higher. The gradebook ("CourseGradebook")
-- then displays the wrong attempt's score, ignoring the override entirely.
-- This view is the canonical "best attempt" pick consumed by the gradebook
-- and a few other surfaces — fixing it here fixes it everywhere.
--
-- Backward compatibility
-- ----------------------
-- The existing column shape is preserved (assignment_id, student_id,
-- attempt_id, score_percent, submitted_at, duration_seconds, status) so
-- callers that already SELECT those columns keep working unchanged.
-- One additive column: `effective_score numeric(5,2)` — the COALESCE result
-- — so callers can render the headline grade without a second round-trip
-- against `assignment_attempts` to re-read score_override. score_percent is
-- retained because some callers (e.g. the "Adjusted" pill in CourseGradebook)
-- need the raw auto-score to detect whether an override is in effect.
--
-- Idempotent: CREATE OR REPLACE VIEW (no DROP — keeps existing GRANTs intact,
-- though we re-issue the grant below for safety).
--
-- IMPORTANT (fix 2026-06-02): CREATE OR REPLACE VIEW can only APPEND columns,
-- never reorder/rename existing ones. The first cut inserted effective_score
-- between score_percent and submitted_at, which Postgres rejects with
--   42P16: cannot change name of view column "submitted_at" to "effective_score"
-- so the migration never applied. effective_score is therefore appended as the
-- LAST column here (callers read it by name, so position is irrelevant) and the
-- original 0020 column order (… submitted_at, duration_seconds, status) is kept
-- byte-for-byte. Do NOT move it back into the middle.
--
-- Follow-up
-- ---------
-- CourseGradebook currently does a second round-trip to fetch score_override
-- for the "Adjusted" pill. With `effective_score` now on this view it can
-- drop that fetch entirely; that's a frontend-lane change, not in scope here.
-- ============================================================================

CREATE OR REPLACE VIEW public.assignment_best_attempts AS
SELECT DISTINCT ON (assignment_id, student_id)
  assignment_id,
  student_id,
  id AS attempt_id,
  score_percent,
  submitted_at,
  duration_seconds,
  'submitted'::text AS status,
  COALESCE(score_override, score_percent)::numeric(5,2) AS effective_score
FROM public.assignment_attempts
WHERE submitted_at IS NOT NULL
ORDER BY
  assignment_id,
  student_id,
  COALESCE(score_override, score_percent) DESC NULLS LAST,
  submitted_at DESC;

GRANT SELECT ON public.assignment_best_attempts TO authenticated;
