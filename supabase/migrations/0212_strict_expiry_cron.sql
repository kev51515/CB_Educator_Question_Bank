-- =============================================================================
-- Migration: 0212_strict_expiry_cron.sql
-- Purpose:   "The test ends with or without you." For a 'strict' time-mode run
--            (0210), the section clock runs on wall-clock and does NOT pause
--            when the student leaves. If they walk away and never come back,
--            a per-minute cron sweep FINALIZES the run once its current module's
--            wall-clock deadline has passed (plus a grace buffer), grading
--            whatever was recorded — exactly like a teacher force-submit (0101),
--            but unattended.
--
--   • _finalize_run_now(run) — internal SECURITY DEFINER grade+finalize, the
--     auth-free core of proctor_force_submit. Re-locks + re-checks in_progress
--     so it can't double-finalize a run the student just submitted.
--   • finalize_expired_strict_runs() — sweeps in-progress STRICT runs whose
--     current timed module blew past time_limit + grace, skipping any that are
--     proctor-paused (0102) or row-locked (a concurrent submit). Returns the
--     count finalized.
--   • pg_cron: run every minute (guarded — no-op if pg_cron isn't installed).
--
--   Scope notes: 'unlimited' runs are never swept (their clock is paused while
--   away). A run sitting at a BREAK (between modules — current_module_started_at
--   is NULL) is not swept: the break isn't timed, so leaving there is allowed.
--   A proctor pause (paused_at) shields a run from the sweep until resumed.
--
-- Forward-only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. _finalize_run_now — auth-free grade + finalize (mirrors proctor_force_submit
--    0101, minus the actor/scope/audit-actor; logs a system audit row instead).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._finalize_run_now(p_run_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_run   public.test_runs%ROWTYPE;
  v_score integer;
  v_total integer;
BEGIN
  -- Re-lock + re-check: the student's own submit may have committed between the
  -- sweep's candidate scan and now; if so, leave it alone.
  SELECT * INTO v_run FROM public.test_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_run.status <> 'in_progress' THEN RETURN false; END IF;

  -- Grade everything recorded so far (idempotent).
  UPDATE public.test_run_answers a
     SET is_correct = public._grade_answer(tq.type, tq.correct_answer, tq.accepted, a.chosen)
    FROM public.test_questions tq
   WHERE tq.id = a.question_id AND a.run_id = v_run.id;

  -- Denominator = the run's scoped module range (a subset occurrence) or the
  -- whole test. Unreached in-scope questions count against the student.
  SELECT count(*) INTO v_total
    FROM public.test_questions tq
    JOIN public.test_modules m ON m.id = tq.module_id
   WHERE m.test_id = v_run.test_id
     AND m.position >= COALESCE(v_run.scheduled_first_position, m.position)
     AND m.position <= COALESCE(v_run.scheduled_last_position, m.position);

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
  VALUES (NULL, 'test.strict_expiry_finalize', 'test_run', p_run_id::text,
          jsonb_build_object('score', v_score, 'total', v_total));

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public._finalize_run_now(uuid) FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- 2. finalize_expired_strict_runs — sweep + finalize. Returns count finalized.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_expired_strict_runs(p_grace_seconds integer DEFAULT 120)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_id    uuid;
  v_count integer := 0;
BEGIN
  FOR v_id IN
    SELECT r.id
      FROM public.test_runs r
      JOIN public.test_modules m
        ON m.test_id = r.test_id AND m.position = r.current_module
     WHERE r.status = 'in_progress'
       AND r.time_mode = 'strict'
       AND r.paused_at IS NULL                 -- not proctor-paused
       AND r.current_module_started_at IS NOT NULL  -- actively in a timed module
       AND now() > r.current_module_started_at
                   + make_interval(secs => m.time_limit_seconds + GREATEST(p_grace_seconds, 0))
     -- Skip rows a concurrent submit is holding; we'll catch them next minute.
     FOR UPDATE OF r SKIP LOCKED
  LOOP
    IF public._finalize_run_now(v_id) THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_expired_strict_runs(integer) FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- 3. Schedule it every minute (guarded — no-op if pg_cron isn't installed).
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not available; skipping schedule. Re-run after enabling.';
    RETURN;
  END IF;

  PERFORM cron.unschedule('strict-expiry-minute')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'strict-expiry-minute');

  PERFORM cron.schedule(
    'strict-expiry-minute',
    '* * * * *',
    'SELECT public.finalize_expired_strict_runs();'
  );
END
$$;

-- =============================================================================
-- END OF MIGRATION 0212_strict_expiry_cron.sql
-- =============================================================================
