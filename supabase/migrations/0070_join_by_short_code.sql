-- =============================================================================
-- Migration: 0070_join_by_short_code.sql
-- Description: Let students join with EITHER the course short_code OR join_code.
--
-- The bug: every teacher-facing surface shows the course `short_code` (e.g.
-- "KQAZNP") — it's in the URL (/courses/KQAZNP/...), the roster header, and the
-- roster's "Copy course code" button literally copies short_code. But
-- join_course_by_code / quick_start_with_code only matched `join_code` (e.g.
-- "8NC7-ZY5K"). So a teacher hands out KQAZNP, the student types KQAZNP, and
-- gets "We couldn't find a class with that code." Classic mismatch.
--
-- Fix: both RPCs now accept short_code OR join_code. short_code is stored
-- upper-case (A–Z, 2–9, no dash); join_code is "XXXX-XXXX" — the alphabets
-- don't overlap, so matching either is unambiguous in practice (LIMIT 1 guards
-- the theoretical tie). Bodies are otherwise byte-for-byte the 0021 versions
-- (rate limiting preserved); only the WHERE lookup changed.
--
-- Forward-only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- join_course_by_code — accept short_code OR join_code
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.join_course_by_code(p_code text)
  RETURNS TABLE (
    id                   uuid,
    name                 text,
    description          text,
    join_code            text,
    teacher_display_name text
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller    uuid := auth.uid();
  v_course_id uuid;
  v_normalized text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING HINT = 'You must be signed in to join a course.';
  END IF;

  PERFORM public.check_rate_limit('join_course', 10, 60);

  v_normalized := upper(trim(coalesce(p_code, '')));

  IF v_normalized = '' THEN
    RAISE EXCEPTION 'invalid_join_code'
      USING HINT = 'Join code is required.';
  END IF;

  SELECT c.id
    INTO v_course_id
    FROM public.courses c
   WHERE (upper(c.join_code) = v_normalized OR upper(c.short_code) = v_normalized)
     AND c.archived = false
   LIMIT 1;

  IF v_course_id IS NULL THEN
    RAISE EXCEPTION 'invalid_join_code'
      USING HINT = 'No active course found for that code.';
  END IF;

  INSERT INTO public.course_memberships (course_id, student_id)
  VALUES (v_course_id, v_caller)
  ON CONFLICT (course_id, student_id) DO NOTHING;

  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.description,
    c.join_code,
    p.display_name AS teacher_display_name
  FROM public.courses c
  JOIN public.profiles p ON p.id = c.teacher_id
  WHERE c.id = v_course_id;
END;
$$;

REVOKE ALL ON FUNCTION public.join_course_by_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_course_by_code(text) TO authenticated;


-- -----------------------------------------------------------------------------
-- quick_start_with_code — accept short_code OR join_code
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.quick_start_with_code(
  p_code  text,
  p_name  text,
  p_email text
)
  RETURNS TABLE (
    class_id             uuid,
    class_name           text,
    teacher_display_name text
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller     uuid := auth.uid();
  v_course_id  uuid;
  v_class_name text;
  v_teacher    text;
  v_norm_code  text;
  v_norm_name  text;
  v_norm_email text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING HINT = 'You must be signed in (anonymously is fine) to use quick start.';
  END IF;

  PERFORM public.check_rate_limit('quick_start', 5, 60);

  v_norm_code  := upper(trim(coalesce(p_code, '')));
  v_norm_name  := trim(coalesce(p_name, ''));
  v_norm_email := lower(trim(coalesce(p_email, '')));

  IF v_norm_name = '' THEN
    RAISE EXCEPTION 'invalid_name'
      USING HINT = 'Please enter your full name.';
  END IF;

  IF v_norm_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'invalid_email'
      USING HINT = 'That email does not look right.';
  END IF;

  IF v_norm_code = '' THEN
    RAISE EXCEPTION 'invalid_join_code'
      USING HINT = 'Join code is required.';
  END IF;

  SELECT c.id, c.name
    INTO v_course_id, v_class_name
    FROM public.courses c
   WHERE (upper(c.join_code) = v_norm_code OR upper(c.short_code) = v_norm_code)
     AND c.archived = false
   LIMIT 1;

  IF v_course_id IS NULL THEN
    RAISE EXCEPTION 'invalid_join_code'
      USING HINT = 'No active course found for that code.';
  END IF;

  UPDATE public.profiles
     SET display_name = v_norm_name,
         email        = v_norm_email,
         updated_at   = now()
   WHERE id = v_caller;

  INSERT INTO public.course_memberships (course_id, student_id)
  VALUES (v_course_id, v_caller)
  ON CONFLICT (course_id, student_id) DO NOTHING;

  SELECT p.display_name
    INTO v_teacher
    FROM public.courses c
    JOIN public.profiles p ON p.id = c.teacher_id
   WHERE c.id = v_course_id;

  RETURN QUERY SELECT v_course_id, v_class_name, v_teacher;
END;
$$;

REVOKE ALL ON FUNCTION public.quick_start_with_code(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quick_start_with_code(text, text, text) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0070_join_by_short_code.sql
-- =============================================================================
