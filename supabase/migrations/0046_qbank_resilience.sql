-- 0046_qbank_resilience.sql
-- Make qbank submission flow bulletproof:
--   1. client_attempt_id column + partial unique index for idempotency
--   2. CHECK constraints on score/count ranges
--   3. qbank_submission_log audit table with RLS
--   4. submit_qbank_attempt v2 with idempotency + audit logging
--   5. _log_qbank_attempt helper (best-effort, never fails parent tx)
--
-- Notes for future readers:
--   - Triggers / helper fns that INSERT cross-table MUST be SECURITY DEFINER
--     with SET search_path = public, auth (see CLAUDE.md migration rules).
--   - The partial unique index intentionally allows NULL client_attempt_id
--     so legacy mocktest rows aren't rejected.
--   - The audit log helper swallows its own errors — submission must not
--     be blocked by a logging failure.

-- ---------------------------------------------------------------------------
-- 1. client_attempt_id on assignment_attempts
-- ---------------------------------------------------------------------------
ALTER TABLE public.assignment_attempts
  ADD COLUMN IF NOT EXISTS client_attempt_id uuid NULL;

-- Partial unique index: only enforce uniqueness when client_attempt_id IS NOT NULL.
-- (Legacy rows from mocktest don't have one — don't fail them.)
CREATE UNIQUE INDEX IF NOT EXISTS idx_assignment_attempts_client_uid
  ON public.assignment_attempts(assignment_id, student_id, client_attempt_id)
  WHERE client_attempt_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Tighten score / count CHECK constraints
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignment_attempts_score_range') THEN
    ALTER TABLE public.assignment_attempts
      ADD CONSTRAINT assignment_attempts_score_range
      CHECK (score_percent IS NULL OR (score_percent >= 0 AND score_percent <= 100));
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignment_attempts_count_consistency') THEN
    ALTER TABLE public.assignment_attempts
      ADD CONSTRAINT assignment_attempts_count_consistency
      CHECK (
        correct_count IS NULL OR total_questions IS NULL
        OR (correct_count >= 0 AND correct_count <= total_questions)
      );
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Audit log table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.qbank_submission_log (
  id               bigserial PRIMARY KEY,
  assignment_id    uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id       uuid NOT NULL,
  client_attempt_id uuid NULL,
  attempt_id       uuid NULL,        -- non-null on success
  payload          jsonb NOT NULL,
  result_code      text NOT NULL,    -- 'success' | 'success_idempotent' | error_code
  error_message    text NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qbank_log_assignment ON public.qbank_submission_log(assignment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qbank_log_student ON public.qbank_submission_log(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qbank_log_orphans
  ON public.qbank_submission_log(assignment_id, client_attempt_id)
  WHERE result_code <> 'success';

ALTER TABLE public.qbank_submission_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "qbank_log: own student reads" ON public.qbank_submission_log;
CREATE POLICY "qbank_log: own student reads"
  ON public.qbank_submission_log FOR SELECT
  USING (student_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "qbank_log: staff reads all" ON public.qbank_submission_log;
CREATE POLICY "qbank_log: staff reads all"
  ON public.qbank_submission_log FOR SELECT
  USING (public.is_staff((SELECT auth.uid())));

-- No client-side INSERT/UPDATE/DELETE policies — only the SECURITY DEFINER RPC writes.

-- ---------------------------------------------------------------------------
-- 5. Audit log helper (defined before RPC that uses it)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._log_qbank_attempt(
  p_assignment_id uuid,
  p_student_id uuid,
  p_client_attempt_id uuid,
  p_attempt_id uuid,
  p_payload jsonb,
  p_result_code text,
  p_error_msg text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Best-effort log. Never fail the parent transaction.
  INSERT INTO public.qbank_submission_log (
    assignment_id, student_id, client_attempt_id, attempt_id, payload, result_code, error_message
  ) VALUES (
    p_assignment_id, p_student_id, p_client_attempt_id, p_attempt_id, p_payload, p_result_code, p_error_msg
  );
EXCEPTION WHEN OTHERS THEN
  -- Swallow log errors — primary RPC behavior must not be blocked.
  NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Replace submit_qbank_attempt with idempotent v2
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.submit_qbank_attempt(uuid, jsonb);

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
  v_error_code text;
  v_error_msg text;
BEGIN
  IF v_user_id IS NULL THEN
    v_error_code := 'not_authenticated';
    PERFORM public._log_qbank_attempt(p_assignment_id, NULL, p_client_attempt_id, NULL, p_payload, v_error_code, NULL);
    RAISE EXCEPTION '%', v_error_code USING ERRCODE = '28000';
  END IF;

  -- Idempotency: if this client_attempt_id already exists, return its id.
  IF p_client_attempt_id IS NOT NULL THEN
    SELECT id INTO v_existing_id
      FROM public.assignment_attempts
     WHERE assignment_id = p_assignment_id
       AND student_id = v_user_id
       AND client_attempt_id = p_client_attempt_id;
    IF v_existing_id IS NOT NULL THEN
      PERFORM public._log_qbank_attempt(p_assignment_id, v_user_id, p_client_attempt_id, v_existing_id, p_payload, 'success_idempotent', NULL);
      RETURN v_existing_id;
    END IF;
  END IF;

  -- Validate assignment
  SELECT course_id, kind, max_attempts
    INTO v_course_id, v_kind, v_max_attempts
    FROM public.assignments
   WHERE id = p_assignment_id AND archived = false;

  IF v_course_id IS NULL THEN
    v_error_code := 'assignment_not_found';
    PERFORM public._log_qbank_attempt(p_assignment_id, v_user_id, p_client_attempt_id, NULL, p_payload, v_error_code, NULL);
    RAISE EXCEPTION '%', v_error_code USING ERRCODE = '02000';
  END IF;
  IF v_kind <> 'qbank_set' THEN
    v_error_code := 'wrong_kind';
    PERFORM public._log_qbank_attempt(p_assignment_id, v_user_id, p_client_attempt_id, NULL, p_payload, v_error_code, NULL);
    RAISE EXCEPTION '%', v_error_code USING ERRCODE = '22000';
  END IF;

  -- Enrollment check
  IF NOT (
    EXISTS (SELECT 1 FROM public.course_memberships WHERE course_id = v_course_id AND student_id = v_user_id)
    OR public.is_staff(v_user_id)
  ) THEN
    v_error_code := 'not_enrolled';
    PERFORM public._log_qbank_attempt(p_assignment_id, v_user_id, p_client_attempt_id, NULL, p_payload, v_error_code, NULL);
    RAISE EXCEPTION '%', v_error_code USING ERRCODE = '42501';
  END IF;

  -- max_attempts (count submitted only, excluding the current would-be insert)
  IF v_max_attempts IS NOT NULL THEN
    SELECT count(*) INTO v_existing_attempts
      FROM public.assignment_attempts
     WHERE assignment_id = p_assignment_id
       AND student_id = v_user_id
       AND submitted_at IS NOT NULL;
    IF v_existing_attempts >= v_max_attempts THEN
      v_error_code := 'max_attempts_reached';
      PERFORM public._log_qbank_attempt(p_assignment_id, v_user_id, p_client_attempt_id, NULL, p_payload, v_error_code, NULL);
      RAISE EXCEPTION '%', v_error_code USING ERRCODE = '22023';
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

  PERFORM public._log_qbank_attempt(p_assignment_id, v_user_id, p_client_attempt_id, v_attempt_id, p_payload, 'success', NULL);

  RETURN v_attempt_id;
EXCEPTION WHEN OTHERS THEN
  v_error_msg := SQLERRM;
  PERFORM public._log_qbank_attempt(p_assignment_id, v_user_id, p_client_attempt_id, NULL, p_payload, COALESCE(v_error_code, 'unknown_error'), v_error_msg);
  RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_qbank_attempt(uuid, uuid, jsonb) TO authenticated;
