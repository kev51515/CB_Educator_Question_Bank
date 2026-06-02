-- 0047_qbank_log_autonomous.sql
-- Fix failure-path audit log persistence in submit_qbank_attempt.
--
-- The bug (caught by smoke-qbank.mjs scenario [11]):
--   The previous implementation called PERFORM public._log_qbank_attempt(...)
--   immediately BEFORE every RAISE EXCEPTION in the validation paths. Because
--   PostgreSQL doesn't have true autonomous transactions, the RAISE rolls back
--   the WHOLE RPC transaction — including the audit log INSERT that was
--   "best-effort" written moments earlier. The EXCEPTION WHEN OTHERS handler
--   in _log_qbank_attempt swallows INSERT errors, but it can't survive the
--   parent transaction being rolled back. Net effect: zero failure rows ever
--   land in qbank_submission_log, which defeats the entire point of the
--   audit log for debugging student submission issues.
--
-- The fix (Option F from the task brief — chosen over dblink for portability,
-- since dblink is NOT reliably available on Supabase Cloud's hosted Postgres,
-- and over pg_net which adds HTTP overhead):
--   1. Introduce a separate `log_qbank_failure` RPC (SECURITY DEFINER, granted
--      to authenticated). The CLIENT calls this from its catch block AFTER
--      submit_qbank_attempt raises — at which point the failing RPC's
--      transaction is already gone, but the client knows the failure code +
--      payload + assignment_id, so it can log them in a brand-new transaction
--      that PostgreSQL will commit normally.
--   2. Rewrite submit_qbank_attempt to drop the failure-path
--      _log_qbank_attempt PERFORM calls. The SUCCESS path keeps its inline log
--      (no exception, no rollback). The unhappy paths just RAISE — the client
--      is responsible for follow-up logging via log_qbank_failure.
--
-- The client (viewer/src/student/qbankSubmit.ts) is updated in the same
-- patchset to call log_qbank_failure from inside submitWithRetry's catch
-- handler so failure logs persist across RPC retries.
--
-- Notes for future readers:
--   - Future contributors: if you add a new failure path to
--     submit_qbank_attempt, do NOT add an in-RPC log call — RAISE will
--     roll it back. Update the client to map the new error code instead.
--   - log_qbank_failure itself is wrapped in BEGIN/EXCEPTION so a logging
--     failure can't ever surface to the student.
--   - The success-path log INSERT inside submit_qbank_attempt is kept
--     because it runs ONLY when the RPC is about to RETURN normally —
--     no RAISE, no rollback risk.

-- ---------------------------------------------------------------------------
-- 1. New RPC: log_qbank_failure (called by the client after a caught error)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_qbank_failure(
  p_assignment_id   uuid,
  p_client_attempt_id uuid,
  p_payload         jsonb,
  p_result_code     text,
  p_error_message   text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  -- Anon callers can't log (RLS would block anyway, but be explicit).
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Cap pathological inputs so a buggy client can't blow up the log table.
  IF length(COALESCE(p_result_code, '')) > 128 THEN
    p_result_code := substring(p_result_code FROM 1 FOR 128);
  END IF;
  IF length(COALESCE(p_error_message, '')) > 4000 THEN
    p_error_message := substring(p_error_message FROM 1 FOR 4000);
  END IF;

  BEGIN
    INSERT INTO public.qbank_submission_log (
      assignment_id, student_id, client_attempt_id, attempt_id,
      payload, result_code, error_message
    ) VALUES (
      p_assignment_id, v_user_id, p_client_attempt_id, NULL,
      COALESCE(p_payload, '{}'::jsonb),
      COALESCE(p_result_code, 'unknown_error'),
      p_error_message
    );
  EXCEPTION WHEN OTHERS THEN
    -- Best-effort: never surface a logging failure to the caller.
    NULL;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.log_qbank_failure(uuid, uuid, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_qbank_failure(uuid, uuid, jsonb, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Replace submit_qbank_attempt — strip failure-path log calls
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_qbank_attempt(
  p_assignment_id uuid,
  p_client_attempt_id uuid,
  p_payload jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_course_id uuid;
  v_kind text;
  v_existing_attempts int;
  v_max_attempts int;
  v_attempt_id uuid;
  v_existing_id uuid;
  v_score numeric;
  v_correct int;
  v_total int;
BEGIN
  -- NOTE: No in-RPC failure logging here. The RAISE EXCEPTION rolls back
  -- the whole transaction, which would silently discard any log row written
  -- in this function. The CLIENT is responsible for calling
  -- public.log_qbank_failure() after catching the error.
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- Idempotency: if this client_attempt_id already exists, return its id.
  IF p_client_attempt_id IS NOT NULL THEN
    SELECT id INTO v_existing_id
      FROM public.assignment_attempts
     WHERE assignment_id = p_assignment_id
       AND student_id = v_user_id
       AND client_attempt_id = p_client_attempt_id;
    IF v_existing_id IS NOT NULL THEN
      -- This path is a successful RETURN, so the log insert is safe.
      PERFORM public._log_qbank_attempt(
        p_assignment_id, v_user_id, p_client_attempt_id, v_existing_id,
        p_payload, 'success_idempotent', NULL
      );
      RETURN v_existing_id;
    END IF;
  END IF;

  -- Validate assignment
  SELECT course_id, kind, max_attempts
    INTO v_course_id, v_kind, v_max_attempts
    FROM public.assignments
   WHERE id = p_assignment_id AND archived = false;

  IF v_course_id IS NULL THEN
    RAISE EXCEPTION 'assignment_not_found' USING ERRCODE = '02000';
  END IF;
  IF v_kind <> 'qbank_set' THEN
    RAISE EXCEPTION 'wrong_kind' USING ERRCODE = '22000';
  END IF;

  -- Enrollment check
  IF NOT (
    EXISTS (SELECT 1 FROM public.course_memberships
             WHERE course_id = v_course_id AND student_id = v_user_id)
    OR public.is_staff(v_user_id)
  ) THEN
    RAISE EXCEPTION 'not_enrolled' USING ERRCODE = '42501';
  END IF;

  -- max_attempts (count submitted only, excluding the current would-be insert)
  IF v_max_attempts IS NOT NULL THEN
    SELECT count(*) INTO v_existing_attempts
      FROM public.assignment_attempts
     WHERE assignment_id = p_assignment_id
       AND student_id = v_user_id
       AND submitted_at IS NOT NULL;
    IF v_existing_attempts >= v_max_attempts THEN
      RAISE EXCEPTION 'max_attempts_reached' USING ERRCODE = '22023';
    END IF;
  END IF;

  v_score   := COALESCE((p_payload->>'score_percent')::numeric, 0);
  v_correct := COALESCE((p_payload->>'correct_count')::int, 0);
  v_total   := COALESCE((p_payload->>'total_questions')::int, 0);

  -- Clamp + sanity (defense-in-depth alongside the CHECK constraints)
  IF v_score < 0 THEN v_score := 0; END IF;
  IF v_score > 100 THEN v_score := 100; END IF;
  IF v_correct < 0 THEN v_correct := 0; END IF;
  IF v_total < 0 THEN v_total := 0; END IF;
  IF v_correct > v_total THEN v_correct := v_total; END IF;

  INSERT INTO public.assignment_attempts (
    assignment_id, student_id,
    started_at, submitted_at,
    score_percent, correct_count, total_questions,
    answers, result_detail,
    client_attempt_id
  ) VALUES (
    p_assignment_id, v_user_id,
    COALESCE((p_payload->>'started_at')::timestamptz, now()),
    now(),
    v_score, v_correct, v_total,
    COALESCE(p_payload->'answers', '{}'::jsonb),
    COALESCE(p_payload->'result_detail', '{}'::jsonb),
    p_client_attempt_id
  )
  RETURNING id INTO v_attempt_id;

  -- Success path: safe to log inline (no exception, no rollback).
  PERFORM public._log_qbank_attempt(
    p_assignment_id, v_user_id, p_client_attempt_id, v_attempt_id,
    p_payload, 'success', NULL
  );

  RETURN v_attempt_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_qbank_attempt(uuid, uuid, jsonb) TO authenticated;
