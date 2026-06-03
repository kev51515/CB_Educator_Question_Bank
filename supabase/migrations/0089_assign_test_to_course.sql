-- =============================================================================
-- Migration: 0089_assign_test_to_course.sql
-- Description: One-click "assign a full test to a course" — adds a Modules link
--              to the test so it shows up for that course's students (and the
--              roster/monitor/completion surfaces, which key off the same link).
--
-- assign_test_to_course(course, slug):
--   • staff who teaches the course (or admin);
--   • idempotent — if a /test/<slug> link already exists in the course, no-op;
--   • otherwise appends a published 'link' module_item to the course's first
--     module (creating a "Practice Tests" module if the course has none).
--
-- Forward-only.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.assign_test_to_course(p_course_id uuid, p_slug text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_title  text;
  v_url    text := '/test/' || p_slug;
  v_mod    uuid;
  v_pos    integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (public.is_teacher_of_course(v_uid, p_course_id) OR public.is_admin(v_uid)) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT title INTO v_title FROM public.tests WHERE slug = p_slug;
  IF v_title IS NULL THEN RAISE EXCEPTION 'test_not_found'; END IF;

  -- Already assigned anywhere in this course?
  IF EXISTS (
    SELECT 1 FROM public.module_items mi
      JOIN public.course_modules cm ON cm.id = mi.module_id
     WHERE cm.course_id = p_course_id
       AND mi.item_type = 'link'
       AND mi.url ILIKE '%/test/' || p_slug || '%'
  ) THEN
    RETURN jsonb_build_object('assigned', false, 'already', true);
  END IF;

  -- Target module: first by position, else create a "Practice Tests" module.
  SELECT id INTO v_mod FROM public.course_modules
   WHERE course_id = p_course_id ORDER BY position, created_at LIMIT 1;
  IF v_mod IS NULL THEN
    INSERT INTO public.course_modules (course_id, name, position, published)
    VALUES (p_course_id, 'Practice Tests', 0, true)
    RETURNING id INTO v_mod;
  END IF;

  SELECT coalesce(max(position), -1) + 1 INTO v_pos
    FROM public.module_items WHERE module_id = v_mod;

  INSERT INTO public.module_items (module_id, position, item_type, title, url, published)
  VALUES (v_mod, v_pos, 'link', v_title, v_url, true);

  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (v_uid, 'test.assigned', 'course', p_course_id::text,
          jsonb_build_object('slug', p_slug, 'module_id', v_mod));

  RETURN jsonb_build_object('assigned', true, 'already', false, 'module_id', v_mod);
END;
$$;

REVOKE ALL ON FUNCTION public.assign_test_to_course(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_test_to_course(uuid, text) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0089_assign_test_to_course.sql
-- =============================================================================
