-- =============================================================================
-- Migration: 0101_proctor_force_submit.sql
-- Description: proctor_force_submit(run) — a teacher of a course linking the test
--              (or admin) ends a student's in-progress sitting NOW (walked away,
--              ran out of room time, integrity stop). It grades whatever the
--              student has recorded so far and finalizes the run exactly like a
--              normal completion, but scores against the FULL test denominator
--              (unreached questions count as not-correct).
--
-- Mirrors submit_test_module's finalize block (score/total/section_scores), but
-- doesn't take answers — it grades the drafts already in test_run_answers.
--
-- Forward-only.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.proctor_force_submit(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_run   public.test_runs%ROWTYPE;
  v_slug  text;
  v_ok    boolean;
  v_score integer;
  v_total integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_staff(v_uid) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT * INTO v_run FROM public.test_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_found'; END IF;
  IF v_run.status <> 'in_progress' THEN RAISE EXCEPTION 'run_already_submitted'; END IF;

  -- Scope: admin, or a teacher of a course that links this test.
  IF NOT public.is_admin(v_uid) THEN
    SELECT t.slug INTO v_slug FROM public.tests t WHERE t.id = v_run.test_id;
    SELECT EXISTS (
      SELECT 1
        FROM public.module_items mi
        JOIN public.course_modules cm ON cm.id = mi.module_id
        JOIN public.courses c ON c.id = cm.course_id
       WHERE mi.item_type = 'link'
         AND mi.url ILIKE '%/test/' || v_slug || '%'
         AND c.teacher_id = v_uid
    ) INTO v_ok;
    IF NOT v_ok THEN RAISE EXCEPTION 'not_authorized'; END IF;
  END IF;

  -- Grade everything the student has recorded so far (idempotent: already-graded
  -- submitted modules re-resolve to the same value).
  UPDATE public.test_run_answers a
     SET is_correct = public._grade_answer(tq.type, tq.correct_answer, tq.accepted, a.chosen)
    FROM public.test_questions tq
   WHERE tq.id = a.question_id AND a.run_id = v_run.id;

  -- Total = the WHOLE test (unreached questions count against the student).
  SELECT count(*) INTO v_total
    FROM public.test_questions tq
    JOIN public.test_modules m ON m.id = tq.module_id
   WHERE m.test_id = v_run.test_id;

  SELECT count(*) FILTER (WHERE is_correct) INTO v_score
    FROM public.test_run_answers WHERE run_id = v_run.id;

  UPDATE public.test_runs SET
    status                    = 'submitted',
    submitted_at              = now(),
    current_module_started_at = NULL,
    score                     = v_score,
    total                     = v_total,
    duration_seconds          = floor(extract(epoch FROM (now() - started_at)))::int,
    section_scores = (
      SELECT jsonb_object_agg(s.section, jsonb_build_object('correct', s.correct, 'total', s.total))
        FROM (
          SELECT m.section,
                 count(*) FILTER (WHERE a.is_correct) AS correct,
                 count(*) AS total
            FROM public.test_run_answers a
            JOIN public.test_questions tq ON tq.id = a.question_id
            JOIN public.test_modules m ON m.id = tq.module_id
           WHERE a.run_id = v_run.id
           GROUP BY m.section
        ) s)
   WHERE id = v_run.id;

  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (v_uid, 'proctor.force_submit', 'test_run', p_run_id::text,
          jsonb_build_object('score', v_score, 'total', v_total));

  RETURN jsonb_build_object('score', v_score, 'total', v_total);
END;
$$;
REVOKE ALL ON FUNCTION public.proctor_force_submit(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.proctor_force_submit(uuid) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0101_proctor_force_submit.sql
-- =============================================================================
