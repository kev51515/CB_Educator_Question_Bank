-- =============================================================================
-- Migration: 0217_qbank_in_progress_attempt.sql
-- Description: Give qbank_set assignments a live IN-PROGRESS phase so they can be
--   monitored like full tests. Until now a qbank attempt row was created only at
--   submit (submit_qbank_attempt INSERTs with submitted_at = now()), so a student
--   mid-set was invisible to assignment_roster_status / the Monitor.
--
--   • start_qbank_attempt(assignment_id, client_attempt_id) — called by the
--     runner when the iframe loads. Creates (or reuses) an in-progress
--     assignment_attempts row (submitted_at NULL, current_question = 1,
--     last_seen_at = now()) and returns its id. Idempotent on client_attempt_id;
--     reuses any existing in-progress row for (assignment, student) so a refresh
--     doesn't leave ghost rows. Same auth/enrollment/max_attempts guards as
--     submit (max_attempts counts SUBMITTED rows only, so starting is allowed up
--     to the limit).
--   • submit_qbank_attempt — reconciled to FINALIZE the in-progress row (UPDATE
--     it: set score + submitted_at) when one exists for this client_attempt_id,
--     instead of inserting a duplicate. Back-compat preserved: an old bridge that
--     never calls start still hits the INSERT path. Idempotency unchanged (an
--     already-SUBMITTED client_attempt_id returns its id).
--
-- The heartbeat (0214 assignment_heartbeat) now has a live row to write to, so
--   the Monitor shows the qbank student's current question + idle time.
--
-- Forward-only. Idempotent.
-- =============================================================================

-- 1) start_qbank_attempt -------------------------------------------------------
DROP FUNCTION IF EXISTS public.start_qbank_attempt(uuid, uuid);
CREATE FUNCTION public.start_qbank_attempt(
  p_assignment_id     uuid,
  p_client_attempt_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_user_id        uuid := auth.uid();
  v_course_id      uuid;
  v_kind           text;
  v_max_attempts   int;
  v_submitted      int;
  v_existing_id    uuid;
  v_attempt_id     uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;

  -- Idempotent on client_attempt_id (already started or already submitted).
  IF p_client_attempt_id IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM public.assignment_attempts
     WHERE assignment_id = p_assignment_id AND student_id = v_user_id
       AND client_attempt_id = p_client_attempt_id;
    IF v_existing_id IS NOT NULL THEN RETURN v_existing_id; END IF;
  END IF;

  SELECT course_id, kind, max_attempts INTO v_course_id, v_kind, v_max_attempts
    FROM public.assignments WHERE id = p_assignment_id AND archived = false;
  IF v_course_id IS NULL THEN RAISE EXCEPTION 'assignment_not_found' USING ERRCODE = '02000'; END IF;
  IF v_kind <> 'qbank_set' THEN RAISE EXCEPTION 'wrong_kind' USING ERRCODE = '22000'; END IF;
  IF NOT (
    EXISTS (SELECT 1 FROM public.course_memberships
             WHERE course_id = v_course_id AND student_id = v_user_id)
    OR public.is_staff(v_user_id)
  ) THEN
    RAISE EXCEPTION 'not_enrolled' USING ERRCODE = '42501';
  END IF;
  IF v_max_attempts IS NOT NULL THEN
    SELECT count(*) INTO v_submitted FROM public.assignment_attempts
     WHERE assignment_id = p_assignment_id AND student_id = v_user_id AND submitted_at IS NOT NULL;
    IF v_submitted >= v_max_attempts THEN RAISE EXCEPTION 'max_attempts_reached' USING ERRCODE = '22023'; END IF;
  END IF;

  -- Reuse an existing in-progress row (refresh / re-mount) so we don't pile up
  -- ghost "in progress" rows in the Monitor. Adopt the new client_attempt_id.
  SELECT id INTO v_existing_id FROM public.assignment_attempts
   WHERE assignment_id = p_assignment_id AND student_id = v_user_id AND submitted_at IS NULL
   ORDER BY started_at DESC LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    UPDATE public.assignment_attempts
       SET client_attempt_id = p_client_attempt_id, last_seen_at = now()
     WHERE id = v_existing_id;
    RETURN v_existing_id;
  END IF;

  INSERT INTO public.assignment_attempts
    (assignment_id, student_id, started_at, client_attempt_id, current_question, last_seen_at)
  VALUES
    (p_assignment_id, v_user_id, now(), p_client_attempt_id, 1, now())
  RETURNING id INTO v_attempt_id;
  RETURN v_attempt_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.start_qbank_attempt(uuid, uuid) TO authenticated;

-- 2) submit_qbank_attempt — finalize the in-progress row when present ----------
CREATE OR REPLACE FUNCTION public.submit_qbank_attempt(
  p_assignment_id uuid,
  p_client_attempt_id uuid,
  p_payload jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_course_id uuid;
  v_kind text;
  v_existing_attempts int;
  v_max_attempts int;
  v_attempt_id uuid;
  v_existing_id uuid;
  v_existing_submitted timestamptz;
  v_score numeric;
  v_correct int;
  v_total int;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;

  -- Look up any row for this client_attempt_id. An already-SUBMITTED one is an
  -- idempotent replay; an IN-PROGRESS one (from start_qbank_attempt) is the row
  -- we will finalize below.
  IF p_client_attempt_id IS NOT NULL THEN
    SELECT id, submitted_at INTO v_existing_id, v_existing_submitted
      FROM public.assignment_attempts
     WHERE assignment_id = p_assignment_id AND student_id = v_user_id
       AND client_attempt_id = p_client_attempt_id;
    IF v_existing_id IS NOT NULL AND v_existing_submitted IS NOT NULL THEN
      PERFORM public._log_qbank_attempt(
        p_assignment_id, v_user_id, p_client_attempt_id, v_existing_id,
        p_payload, 'success_idempotent', NULL
      );
      RETURN v_existing_id;
    END IF;
  END IF;

  SELECT course_id, kind, max_attempts
    INTO v_course_id, v_kind, v_max_attempts
    FROM public.assignments WHERE id = p_assignment_id AND archived = false;
  IF v_course_id IS NULL THEN RAISE EXCEPTION 'assignment_not_found' USING ERRCODE = '02000'; END IF;
  IF v_kind <> 'qbank_set' THEN RAISE EXCEPTION 'wrong_kind' USING ERRCODE = '22000'; END IF;
  IF NOT (
    EXISTS (SELECT 1 FROM public.course_memberships
             WHERE course_id = v_course_id AND student_id = v_user_id)
    OR public.is_staff(v_user_id)
  ) THEN
    RAISE EXCEPTION 'not_enrolled' USING ERRCODE = '42501';
  END IF;

  -- max_attempts counts SUBMITTED rows; the in-progress row we're finalizing
  -- isn't submitted yet, so it isn't counted here.
  IF v_max_attempts IS NOT NULL THEN
    SELECT count(*) INTO v_existing_attempts
      FROM public.assignment_attempts
     WHERE assignment_id = p_assignment_id AND student_id = v_user_id AND submitted_at IS NOT NULL;
    IF v_existing_attempts >= v_max_attempts THEN
      RAISE EXCEPTION 'max_attempts_reached' USING ERRCODE = '22023';
    END IF;
  END IF;

  v_score   := COALESCE((p_payload->>'score_percent')::numeric, 0);
  v_correct := COALESCE((p_payload->>'correct_count')::int, 0);
  v_total   := COALESCE((p_payload->>'total_questions')::int, 0);
  IF v_score < 0 THEN v_score := 0; END IF;
  IF v_score > 100 THEN v_score := 100; END IF;
  IF v_correct < 0 THEN v_correct := 0; END IF;
  IF v_total < 0 THEN v_total := 0; END IF;
  IF v_correct > v_total THEN v_correct := v_total; END IF;

  IF v_existing_id IS NOT NULL THEN
    -- Finalize the in-progress row created by start_qbank_attempt.
    UPDATE public.assignment_attempts
       SET submitted_at     = now(),
           score_percent    = v_score,
           correct_count    = v_correct,
           total_questions  = v_total,
           answers          = COALESCE(p_payload->'answers', '{}'::jsonb),
           result_detail    = COALESCE(p_payload->'result_detail', '{}'::jsonb),
           started_at       = COALESCE(started_at, COALESCE((p_payload->>'started_at')::timestamptz, now()))
     WHERE id = v_existing_id
    RETURNING id INTO v_attempt_id;
  ELSE
    -- Back-compat: no start_qbank_attempt was called — insert directly.
    INSERT INTO public.assignment_attempts (
      assignment_id, student_id, started_at, submitted_at,
      score_percent, correct_count, total_questions,
      answers, result_detail, client_attempt_id
    ) VALUES (
      p_assignment_id, v_user_id,
      COALESCE((p_payload->>'started_at')::timestamptz, now()), now(),
      v_score, v_correct, v_total,
      COALESCE(p_payload->'answers', '{}'::jsonb),
      COALESCE(p_payload->'result_detail', '{}'::jsonb),
      p_client_attempt_id
    )
    RETURNING id INTO v_attempt_id;
  END IF;

  PERFORM public._log_qbank_attempt(
    p_assignment_id, v_user_id, p_client_attempt_id, v_attempt_id,
    p_payload, 'success', NULL
  );
  RETURN v_attempt_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.submit_qbank_attempt(uuid, uuid, jsonb) TO authenticated;

-- END OF MIGRATION 0217_qbank_in_progress_attempt.sql
