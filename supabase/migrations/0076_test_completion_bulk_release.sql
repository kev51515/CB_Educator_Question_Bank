-- =============================================================================
-- Migration: 0076_test_completion_bulk_release.sql
-- Description: Per-test completion overview + bulk results release for a teacher,
--              so after a test day a teacher can see who took a test and release
--              the whole class at once (instead of per-student profile).
--
--   • list_test_completion(slug) — staff: one row per student (in the caller's
--     courses; admins see all) with their LATEST submitted run for that test:
--     student id/name, score, submitted_at, results_released_at, run_id.
--   • release_test_results_for_teacher(slug, released) — staff: release/hide
--     every submitted run of the caller's students for that test; returns count.
--
-- Scoping mirrors the rest of the LMS: a teacher sees students enrolled in a
-- course they teach; is_admin sees all. Audited. Forward-only.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.list_test_completion(p_slug text)
RETURNS TABLE (
  run_id              uuid,
  student_id          uuid,
  student_name        text,
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
  SELECT DISTINCT ON (r.user_id)
         r.id, p.id, p.display_name, r.score, r.total,
         r.submitted_at, r.results_released_at
    FROM public.test_runs r
    JOIN public.profiles p ON p.id = r.user_id
   WHERE r.test_id = v_test_id
     AND r.status = 'submitted'
     AND (v_admin OR EXISTS (
            SELECT 1 FROM public.course_memberships cm
              JOIN public.courses c ON c.id = cm.course_id
             WHERE cm.student_id = r.user_id AND c.teacher_id = v_uid))
   ORDER BY r.user_id, r.submitted_at DESC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.list_test_completion(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_test_completion(text) TO authenticated;


CREATE OR REPLACE FUNCTION public.release_test_results_for_teacher(
  p_slug text, p_released boolean DEFAULT true
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_test_id uuid;
  v_admin   boolean;
  v_count   integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_staff(v_uid) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  v_admin := public.is_admin(v_uid);

  SELECT id INTO v_test_id FROM public.tests WHERE slug = p_slug;
  IF v_test_id IS NULL THEN RAISE EXCEPTION 'test_not_found'; END IF;

  UPDATE public.test_runs r
     SET results_released_at = CASE WHEN p_released THEN now() ELSE NULL END
   WHERE r.test_id = v_test_id
     AND r.status = 'submitted'
     AND (v_admin OR EXISTS (
            SELECT 1 FROM public.course_memberships cm
              JOIN public.courses c ON c.id = cm.course_id
             WHERE cm.student_id = r.user_id AND c.teacher_id = v_uid));
  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (
    v_uid,
    CASE WHEN p_released THEN 'test_result.release_bulk' ELSE 'test_result.unrelease_bulk' END,
    'test', v_test_id::text,
    jsonb_build_object('slug', p_slug, 'released', p_released, 'count', v_count)
  );

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.release_test_results_for_teacher(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_test_results_for_teacher(text, boolean) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0076_test_completion_bulk_release.sql
-- =============================================================================
