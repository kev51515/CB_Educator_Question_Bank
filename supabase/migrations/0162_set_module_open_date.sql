-- =============================================================================
-- Migration: 0162_set_module_open_date.sql
-- Purpose:   One "Available from" date per OCCURRENCE (best-practice model).
--
--   An occurrence is a Modules link with a module range (`?m=<first>-<last>`,
--   0156). Scheduling is now a SINGLE open date for the whole occurrence, set
--   from the Add/Edit-modules modal — not a per-module stagger. `opens_at` lives
--   on `test_module_windows` (dates only, per 0161); this RPC writes the one
--   date across the occurrence's positions [first..last], so get_test_module's
--   existing `module_not_yet_open` gate locks the occurrence until then.
--
--   Two non-overlapping occurrences (e.g. M1 and M2) write distinct positions,
--   so their dates never collide. `opens_at = NULL` ⇒ open immediately.
--
--   Supersedes the old per-position `set_test_module_windows` schedule editor
--   (which also enforced a deployed-set — now irrelevant since the range is the
--   deployment). That RPC is left in place but unused.
--
--   Forward-only.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_module_open_date(
  p_course_id uuid, p_slug text, p_first integer, p_last integer, p_opens_at timestamptz
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_test_id uuid;
  v_pos     integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (public.is_teacher_of_course(v_uid, p_course_id) OR public.is_admin(v_uid)) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  SELECT id INTO v_test_id FROM public.tests WHERE slug = p_slug;
  IF v_test_id IS NULL THEN RAISE EXCEPTION 'test_not_found'; END IF;
  IF p_first IS NULL OR p_last IS NULL OR p_first > p_last THEN
    RAISE EXCEPTION 'invalid_range';
  END IF;

  FOR v_pos IN p_first..p_last LOOP
    INSERT INTO public.test_module_windows
      (course_id, test_id, module_position, deployed, opens_at, created_by)
    VALUES (p_course_id, v_test_id, v_pos, true, p_opens_at, v_uid)
    ON CONFLICT (course_id, test_id, module_position) DO UPDATE
      SET opens_at = EXCLUDED.opens_at, deployed = true, updated_at = now();
  END LOOP;

  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (v_uid, 'test.occurrence_schedule', 'course', p_course_id::text,
          jsonb_build_object('slug', p_slug, 'first', p_first, 'last', p_last, 'opens_at', p_opens_at));
END;
$$;
REVOKE ALL ON FUNCTION public.set_module_open_date(uuid, text, integer, integer, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_module_open_date(uuid, text, integer, integer, timestamptz) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0162_set_module_open_date.sql
-- =============================================================================
