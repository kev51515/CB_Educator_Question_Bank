-- =============================================================================
-- Migration: 0214_assignment_heartbeat.sql
-- Description: Live heartbeat for assignment attempts, mirroring full tests'
--   test_heartbeat (0087). Lets the educator Monitor show which question a
--   student is on + how long they've been idle, instead of only "mid-attempt".
--
--   • assignment_attempts gains current_question (1-based) + last_seen_at.
--   • assignment_heartbeat(attempt_id, question) — the student runner posts this
--     on every navigation + on a timer. Updates last_seen_at always and
--     current_question when a number is supplied (qbank's iframe can't report a
--     question yet, so it posts NULL = an "alive" ping). Scoped to the caller's
--     OWN in-progress attempt.
--   • assignment_roster_status (0209) is recreated to also return current_question
--     + last_seen_at for the live (in-progress) attempt.
--
-- Forward-only. Idempotent.
-- =============================================================================

ALTER TABLE public.assignment_attempts
  ADD COLUMN IF NOT EXISTS current_question integer,
  ADD COLUMN IF NOT EXISTS last_seen_at     timestamptz;

-- Heartbeat ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.assignment_heartbeat(uuid, integer);
CREATE FUNCTION public.assignment_heartbeat(
  p_attempt_id uuid,
  p_question   integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  UPDATE public.assignment_attempts
     SET last_seen_at     = now(),
         current_question = COALESCE(p_question, current_question)
   WHERE id = p_attempt_id
     AND student_id = v_uid
     AND submitted_at IS NULL;
END;
$$;
GRANT EXECUTE ON FUNCTION public.assignment_heartbeat(uuid, integer) TO authenticated;

-- Roster status (recreated with live position) ---------------------------------
DROP FUNCTION IF EXISTS public.assignment_roster_status(uuid);
CREATE FUNCTION public.assignment_roster_status(p_assignment_id uuid)
RETURNS TABLE (
  student_id          uuid,
  student_name        text,
  attempt_id          uuid,
  effective_score     numeric,
  submitted_at        timestamptz,
  results_released_at timestamptz,
  has_in_progress     boolean,
  started_at          timestamptz,
  current_question    integer,
  last_seen_at        timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_course uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT course_id INTO v_course FROM public.assignments WHERE id = p_assignment_id;
  IF v_course IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT (public.is_teacher_of_course(v_uid, v_course) OR public.is_admin(v_uid)) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  WITH roster AS (
    SELECT cm.student_id AS sid, p.display_name AS sname
      FROM public.course_memberships cm
      JOIN public.profiles p ON p.id = cm.student_id
     WHERE cm.course_id = v_course
  ),
  best AS (
    SELECT DISTINCT ON (att.student_id)
           att.student_id,
           att.id AS attempt_id,
           COALESCE(att.score_override, att.score_percent) AS eff,
           att.submitted_at,
           att.results_released_at
      FROM public.assignment_attempts att
     WHERE att.assignment_id = p_assignment_id
       AND att.submitted_at IS NOT NULL
     ORDER BY att.student_id,
              COALESCE(att.score_override, att.score_percent) DESC NULLS LAST,
              att.submitted_at DESC
  ),
  inprog AS (
    SELECT DISTINCT ON (att.student_id)
           att.student_id, att.started_at, att.current_question, att.last_seen_at
      FROM public.assignment_attempts att
     WHERE att.assignment_id = p_assignment_id
       AND att.submitted_at IS NULL
     ORDER BY att.student_id, att.started_at DESC
  )
  SELECT r.sid, r.sname,
         b.attempt_id, b.eff, b.submitted_at, b.results_released_at,
         (ip.student_id IS NOT NULL) AS has_in_progress,
         ip.started_at, ip.current_question, ip.last_seen_at
    FROM roster r
    LEFT JOIN best   b  ON b.student_id  = r.sid
    LEFT JOIN inprog ip ON ip.student_id = r.sid
   ORDER BY r.sname NULLS LAST;
END;
$$;
GRANT EXECUTE ON FUNCTION public.assignment_roster_status(uuid) TO authenticated;

-- END OF MIGRATION 0214_assignment_heartbeat.sql
