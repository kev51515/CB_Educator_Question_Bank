-- =============================================================================
-- Migration: 0078_test_roster_status.sql
-- Description: Per-test completion across the ASSIGNED roster — so a teacher
--              sees who hasn't started yet, not just who submitted.
--
-- "Assigned" = students enrolled in a course (taught by the caller; admins all)
-- whose Modules contain a link to /test/<slug>. For each, returns their latest
-- submitted run (NULL columns when not started). Supersedes list_test_completion
-- for the catalog modal (kept for compatibility).
--
-- Forward-only.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.test_roster_status(p_slug text)
RETURNS TABLE (
  student_id          uuid,
  student_name        text,
  run_id              uuid,
  score               integer,
  total               integer,
  submitted_at        timestamptz,
  results_released_at timestamptz
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
    SELECT DISTINCT cm.student_id AS sid, p.display_name AS sname
      FROM public.module_items mi
      JOIN public.course_modules cmod ON cmod.id = mi.module_id
      JOIN public.courses c ON c.id = cmod.course_id
      JOIN public.course_memberships cm ON cm.course_id = c.id
      JOIN public.profiles p ON p.id = cm.student_id
     WHERE mi.item_type = 'link'
       AND mi.url ILIKE '%/test/' || p_slug || '%'
       AND (v_admin OR c.teacher_id = v_uid)
  )
  SELECT a.sid, a.sname, lr.id, lr.score, lr.total, lr.submitted_at, lr.results_released_at
    FROM assigned a
    LEFT JOIN LATERAL (
      SELECT r.id, r.score, r.total, r.submitted_at, r.results_released_at
        FROM public.test_runs r
       WHERE r.user_id = a.sid AND r.test_id = v_test_id AND r.status = 'submitted'
       ORDER BY r.submitted_at DESC NULLS LAST
       LIMIT 1
    ) lr ON true
   ORDER BY (lr.submitted_at IS NULL), a.sname;  -- taken first, then by name
END;
$$;

REVOKE ALL ON FUNCTION public.test_roster_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.test_roster_status(text) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0078_test_roster_status.sql
-- =============================================================================
