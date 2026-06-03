-- =============================================================================
-- Migration: 0088_student_test_report.sql
-- Description: Per-student full-test analytics for the teacher: a scaled-score
--              trajectory across attempts + weak-domain accuracy. Powers the
--              "Test performance" panel on the student profile.
--
-- Returns jsonb {
--   runs:    [{ run_id, test_title, submitted_at, score, total, section_scores }]
--            ordered oldest→newest (for the trajectory; client scales),
--   domains: [{ domain, correct, total }]  aggregated across the student's
--            submitted full-test runs (weakest surfaced by the client).
-- }
-- Staff-only (mirrors list_test_runs_for_student). Forward-only.
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
          FROM public.test_run_answers a
          JOIN public.test_questions tq ON tq.id = a.question_id
          JOIN public.test_runs r ON r.id = a.run_id
         WHERE r.user_id = p_student_id AND r.status = 'submitted'
           AND tq.domain IS NOT NULL AND tq.domain <> ''
         GROUP BY tq.domain
      ) d
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.student_test_report(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_test_report(uuid) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0088_student_test_report.sql
-- =============================================================================
