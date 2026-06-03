-- =============================================================================
-- Migration: 0090_test_rpcs_course_scope.sql
-- Description: Harden three test-management RPCs with per-course scope checks.
--
-- Before: release_test_results, allow_test_retake, and reset_test_attempt
--   all gated on is_staff — any teacher in the system could act on any student's
--   run, regardless of course membership.
--
-- After:
--   • release_test_results — requires caller is teacher of the course to which
--     the test is linked (via module_items) OR is_admin.
--   • allow_test_retake — same scope check; PLUS adds idempotency: a new grant
--     is refused if the student's latest submission is older than the most
--     recent grant for (user, test), raising 'retake_already_granted'.
--   • reset_test_attempt — same scope check as release/allow.
--
-- Scope determination:
--   For release_test_results (run-scoped): joins test_runs → tests →
--     module_items (item_type='link', url ILIKE '%/test/<slug>%') →
--     course_modules → courses, then checks is_teacher_of_course OR is_admin.
--   For allow_test_retake / reset_test_attempt (student+slug-scoped): checks
--     that the student has a course_membership in any course where
--     (caller is teacher OR is_admin) AND that course has a module_items link
--     matching the slug.
--
-- Security model:
--   All three RPCs are SECURITY DEFINER with SET search_path = public, auth.
--   Error codes: not_authenticated, not_authorized, not_found, test_not_found,
--     run_not_found, retake_already_granted.
--   Existing audit_events writes are preserved without change.
--
-- Forward-only. No rollback.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- #1: release_test_results — course-scoped
-- -----------------------------------------------------------------------------
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
  v_course_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_staff(v_uid) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  -- Resolve the course this test run belongs to via the module_items link.
  SELECT c.id INTO v_course_id
    FROM public.test_runs   tr
    JOIN public.tests        t   ON t.id  = tr.test_id
    JOIN public.module_items mi  ON mi.item_type = 'link'
                                AND mi.url ILIKE '%/test/' || t.slug || '%'
    JOIN public.course_modules cmod ON cmod.id = mi.module_id
    JOIN public.courses      c   ON c.id = cmod.course_id
   WHERE tr.id = p_run_id
   LIMIT 1;

  -- If no module_items row links this test, fall back to admin-only.
  IF v_course_id IS NOT NULL THEN
    IF NOT (public.is_teacher_of_course(v_uid, v_course_id) OR public.is_admin(v_uid)) THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;
  ELSE
    -- Test not yet linked to any course: restrict to admins only.
    IF NOT public.is_admin(v_uid) THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;
  END IF;

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

-- -----------------------------------------------------------------------------
-- #2: allow_test_retake — course-scoped + idempotency guard
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.allow_test_retake(p_student_id uuid, p_slug text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_test_id     uuid;
  v_has_scope   boolean := false;
  v_last_sub    timestamptz;
  v_last_grant  timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_staff(v_uid) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT id INTO v_test_id FROM public.tests WHERE slug = p_slug;
  IF v_test_id IS NULL THEN RAISE EXCEPTION 'test_not_found'; END IF;

  -- Scope check: caller must be teacher of a course (or admin) where:
  --   • student is a member, AND
  --   • the course has a module_items link to this test.
  IF public.is_admin(v_uid) THEN
    v_has_scope := true;
  ELSE
    SELECT EXISTS (
      SELECT 1
        FROM public.course_memberships cm
        JOIN public.course_modules     cmod ON cmod.course_id = cm.course_id
        JOIN public.module_items       mi   ON mi.module_id   = cmod.id
        JOIN public.courses            c    ON c.id           = cm.course_id
       WHERE cm.student_id  = p_student_id
         AND mi.item_type   = 'link'
         AND mi.url         ILIKE '%/test/' || p_slug || '%'
         AND c.teacher_id   = v_uid
    ) INTO v_has_scope;
  END IF;

  IF NOT v_has_scope THEN RAISE EXCEPTION 'not_authorized'; END IF;

  -- Idempotency: refuse if a grant already exists that is newer than the
  -- student's latest submission (i.e., the grant has not been consumed yet).
  SELECT submitted_at INTO v_last_sub
    FROM public.test_runs
   WHERE user_id = p_student_id AND test_id = v_test_id AND status = 'submitted'
   ORDER BY submitted_at DESC NULLS LAST
   LIMIT 1;

  SELECT granted_at INTO v_last_grant
    FROM public.test_retake_grants
   WHERE user_id = p_student_id AND test_id = v_test_id
   ORDER BY granted_at DESC NULLS LAST
   LIMIT 1;

  -- A grant is still "live" if no submission has occurred after it was issued.
  IF v_last_grant IS NOT NULL AND (v_last_sub IS NULL OR v_last_grant > v_last_sub) THEN
    RAISE EXCEPTION 'retake_already_granted';
  END IF;

  INSERT INTO public.test_retake_grants (user_id, test_id, granted_by)
  VALUES (p_student_id, v_test_id, v_uid);

  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (v_uid, 'test.retake_granted', 'profile', p_student_id::text,
          jsonb_build_object('slug', p_slug));
END;
$$;

REVOKE ALL ON FUNCTION public.allow_test_retake(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.allow_test_retake(uuid, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- #3: reset_test_attempt — course-scoped
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reset_test_attempt(p_student_id uuid, p_slug text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_test_id   uuid;
  v_count     integer;
  v_has_scope boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_staff(v_uid) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT id INTO v_test_id FROM public.tests WHERE slug = p_slug;
  IF v_test_id IS NULL THEN RAISE EXCEPTION 'test_not_found'; END IF;

  -- Same scope pattern as allow_test_retake.
  IF public.is_admin(v_uid) THEN
    v_has_scope := true;
  ELSE
    SELECT EXISTS (
      SELECT 1
        FROM public.course_memberships cm
        JOIN public.course_modules     cmod ON cmod.course_id = cm.course_id
        JOIN public.module_items       mi   ON mi.module_id   = cmod.id
        JOIN public.courses            c    ON c.id           = cm.course_id
       WHERE cm.student_id  = p_student_id
         AND mi.item_type   = 'link'
         AND mi.url         ILIKE '%/test/' || p_slug || '%'
         AND c.teacher_id   = v_uid
    ) INTO v_has_scope;
  END IF;

  IF NOT v_has_scope THEN RAISE EXCEPTION 'not_authorized'; END IF;

  UPDATE public.test_runs
     SET status = 'abandoned'
   WHERE user_id = p_student_id AND test_id = v_test_id AND status = 'in_progress';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (v_uid, 'test.attempt_reset', 'profile', p_student_id::text,
          jsonb_build_object('slug', p_slug, 'abandoned', v_count));

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_test_attempt(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_test_attempt(uuid, text) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0090_test_rpcs_course_scope.sql
-- =============================================================================
