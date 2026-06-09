-- =============================================================================
-- Migration: 0122_student_report_latest_attempt_domains.sql
-- Description: Fix the per-domain rollup in student_test_report so a student who
--              RETAKES the same test doesn't have that form's questions counted
--              once per attempt. The teacher per-student "Skills by domain" card
--              reads this; before the fix a 2-attempt retake showed e.g. 34/34
--              instead of 17/17, inflating the denominators and distorting which
--              domain looks weakest.
--
-- The 'domains' aggregate now counts only the LATEST submitted run per test
-- (DISTINCT ON (test_id) ... ORDER BY submitted_at DESC). The 'runs' array is
-- unchanged — the score-trajectory sparkline still needs every attempt.
--
-- CREATE OR REPLACE, byte-identical to 0088 except the domains subquery's run
-- source. jsonb return shape unchanged; forward-only.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.student_test_report(p_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_staff(v_uid) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  RETURN jsonb_build_object(
    'runs', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'run_id', r.id,
        'test_title', t.title,
        'submitted_at', r.submitted_at,
        'score', r.score,
        'total', r.total,
        'section_scores', r.section_scores
      ) ORDER BY r.submitted_at), '[]'::jsonb)
      FROM public.test_runs r
      JOIN public.tests t ON t.id = r.test_id
      WHERE r.user_id = p_student_id AND r.status = 'submitted'
    ),
    'domains', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'domain', d.domain,
        'correct', d.correct,
        'total', d.total
      ) ORDER BY (d.correct::numeric / NULLIF(d.total, 0)) ASC, d.domain), '[]'::jsonb)
      FROM (
        SELECT tq.domain,
               count(*) FILTER (WHERE a.is_correct) AS correct,
               count(*) AS total
          FROM (
            -- latest submitted run per test, so retakes of the same form
            -- aren't double-counted in the domain rollup
            SELECT DISTINCT ON (r.test_id) r.id
              FROM public.test_runs r
             WHERE r.user_id = p_student_id AND r.status = 'submitted'
             ORDER BY r.test_id, r.submitted_at DESC NULLS LAST
          ) lr
          JOIN public.test_run_answers a ON a.run_id = lr.id
          JOIN public.test_questions tq ON tq.id = a.question_id
         WHERE tq.domain IS NOT NULL AND tq.domain <> ''
         GROUP BY tq.domain
      ) d
    )
  );
END;
$$;

-- =============================================================================
-- END OF MIGRATION 0122_student_report_latest_attempt_domains.sql
-- =============================================================================
