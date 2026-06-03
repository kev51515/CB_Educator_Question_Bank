-- =============================================================================
-- Migration: 0091_release_test_results_multi_course.sql
-- Description: Fix release_test_results' scope check to handle tests that are
--              linked from MORE THAN ONE course (the common real-world case).
--
-- Bug in 0090: the scope check did
--   SELECT c.id INTO v_course_id FROM ... LIMIT 1
-- and then is_teacher_of_course(v_uid, v_course_id). With LIMIT 1, when a
-- single test slug is linked from multiple courses (e.g. multiple classes each
-- assigning the same practice test), the SELECT picks an arbitrary course —
-- often not one the caller teaches — and the check fails with not_authorized
-- even though the caller IS the teacher of a (different) course that links
-- this test.
--
-- Fix: switch to an EXISTS pattern that returns true if the caller is teacher
-- of ANY course that links this test (or is_admin). This matches the pattern
-- already used by allow_test_retake / reset_test_attempt in 0090.
--
-- Behaviour: a teacher who owns a course with a module_items link to the test
-- can release results for ANY student's run of that test (consistent with
-- 0072's original is_staff-only contract, just narrowed to "teaches some
-- course that links the test"). To narrow further (e.g. only releases for
-- students enrolled in YOUR course), we'd need to join through
-- course_memberships on tr.user_id — but that's a tighter policy than 0072
-- shipped and would require a separate decision.
--
-- Existing audit_events writes, error codes, and return type preserved.
--
-- Forward-only.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.release_test_results(
  p_run_id   uuid,
  p_released boolean DEFAULT true
)
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_when      timestamptz;
  v_has_scope boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_staff(v_uid) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  -- Scope: caller is admin, OR caller teaches at least one course that
  -- links the test this run belongs to. EXISTS handles the multi-course
  -- case (same test linked from multiple courses).
  IF public.is_admin(v_uid) THEN
    v_has_scope := true;
  ELSE
    SELECT EXISTS (
      SELECT 1
        FROM public.test_runs        tr
        JOIN public.tests            t    ON t.id  = tr.test_id
        JOIN public.module_items     mi   ON mi.item_type = 'link'
                                         AND mi.url ILIKE '%/test/' || t.slug || '%'
        JOIN public.course_modules   cmod ON cmod.id = mi.module_id
        JOIN public.courses          c    ON c.id   = cmod.course_id
       WHERE tr.id        = p_run_id
         AND c.teacher_id = v_uid
    ) INTO v_has_scope;
  END IF;

  IF NOT v_has_scope THEN RAISE EXCEPTION 'not_authorized'; END IF;

  v_when := CASE WHEN p_released THEN now() ELSE NULL END;

  UPDATE public.test_runs
     SET results_released_at = v_when
   WHERE id = p_run_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_found'; END IF;

  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (
    v_uid,
    CASE WHEN p_released THEN 'test_result.release' ELSE 'test_result.unrelease' END,
    'test_run', p_run_id::text,
    jsonb_build_object('released', p_released)
  );

  RETURN v_when;
END;
$$;

REVOKE ALL ON FUNCTION public.release_test_results(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_test_results(uuid, boolean) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0091_release_test_results_multi_course.sql
-- =============================================================================
