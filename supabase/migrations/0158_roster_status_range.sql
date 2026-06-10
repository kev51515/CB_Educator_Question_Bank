-- =============================================================================
-- Migration: 0158_roster_status_range.sql
-- Purpose:   Scope the teacher test-overview roster to a single ASSIGNMENT
--            OCCURRENCE — (course + module range) — so a test assigned more
--            than once (e.g. "Module 1 only" and "Module 2 only") shows
--            independent data per occurrence, and a single-module assignment is
--            limited to that module.
--
--   `test_roster_status` already returns course_id/course_name (0149) so the
--   page can filter by course. This adds optional (p_first, p_last): when given,
--   each student's shown run is the one whose range matches THIS occurrence
--   (scheduled_first/last = p_first/p_last — the subset runs from 0156), and
--   `has_in_progress` is scoped the same way. NULL/NULL = test-wide (unchanged):
--   the latest submitted run regardless of range.
--
--   Combined with the page's course filter (0149) and the ?m= deep-link, a
--   teacher opening a course's "Module 1" link sees ONLY that course's Module-1
--   runs — no cross-course, no cross-occurrence contamination.
--
--   Signature change ⇒ DROP + CREATE. We also DROP the 1-arg overload so a
--   {p_slug}-only call resolves unambiguously to the 3-arg DEFAULTed version
--   (the candidate-ambiguity lesson from 0157).
--
--   Forward-only.
-- =============================================================================

DROP FUNCTION IF EXISTS public.test_roster_status(text);
DROP FUNCTION IF EXISTS public.test_roster_status(text, integer, integer);

CREATE FUNCTION public.test_roster_status(
  p_slug text, p_first integer DEFAULT NULL, p_last integer DEFAULT NULL
)
RETURNS TABLE (
  student_id          uuid,
  student_name        text,
  run_id              uuid,
  score               integer,
  total               integer,
  submitted_at        timestamptz,
  results_released_at timestamptz,
  has_in_progress     boolean,
  course_id           uuid,
  course_name         text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_test_id uuid;
  v_admin   boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_staff(v_uid) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  v_admin := public.is_admin(v_uid);
  SELECT id INTO v_test_id FROM public.tests WHERE slug = p_slug;
  IF v_test_id IS NULL THEN RAISE EXCEPTION 'test_not_found'; END IF;
  RETURN QUERY
  WITH assigned AS (
    SELECT DISTINCT cm.student_id AS sid, p.display_name AS sname,
                    c.id AS cid, c.name AS cname
      FROM public.module_items mi
      JOIN public.course_modules cmod ON cmod.id = mi.module_id
      JOIN public.courses c ON c.id = cmod.course_id
      JOIN public.course_memberships cm ON cm.course_id = c.id
      JOIN public.profiles p ON p.id = cm.student_id
     WHERE mi.item_type = 'link'
       AND mi.url ILIKE '%/test/' || p_slug || '%'
       AND (v_admin OR c.teacher_id = v_uid)
  )
  SELECT a.sid, a.sname, lr.id, lr.score, lr.total, lr.submitted_at, lr.results_released_at,
         EXISTS (SELECT 1 FROM public.test_runs ip
                  WHERE ip.user_id = a.sid AND ip.test_id = v_test_id
                    AND ip.status = 'in_progress'
                    AND (p_first IS NULL OR ip.scheduled_first_position = p_first)
                    AND (p_last  IS NULL OR ip.scheduled_last_position  = p_last)),
         a.cid, a.cname
    FROM assigned a
    LEFT JOIN LATERAL (
      SELECT r.id, r.score, r.total, r.submitted_at, r.results_released_at
        FROM public.test_runs r
       WHERE r.user_id = a.sid AND r.test_id = v_test_id AND r.status = 'submitted'
         AND (p_first IS NULL OR r.scheduled_first_position = p_first)
         AND (p_last  IS NULL OR r.scheduled_last_position  = p_last)
       ORDER BY r.submitted_at DESC NULLS LAST
       LIMIT 1
    ) lr ON true
   ORDER BY a.cname, (lr.submitted_at IS NULL), a.sname;
END;
$$;
REVOKE ALL ON FUNCTION public.test_roster_status(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.test_roster_status(text, integer, integer) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0158_roster_status_range.sql
-- =============================================================================
