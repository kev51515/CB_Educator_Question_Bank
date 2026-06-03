-- =============================================================================
-- Migration: 0097_code_redemptions_log.sql
-- Description: Durable, cumulative log of CLASS-CODE redemptions so a teacher can
--              see how many times the shared course code has been used, by whom,
--              when, and via which entry path — and have that survive removing a
--              student from the roster.
--
-- Why a log (vs. counting memberships): the roster only shows CURRENT members,
-- so a derived count drops when a student is removed and can't show "last used"
-- or the join-vs-quick-start split. code_redemptions is append-only; student_id
-- is ON DELETE SET NULL and we snapshot name+email, so the historical tally
-- persists even after the student (or their profile) is gone.
--
-- Scope: this logs the SHARED class-code paths only —
--   - join_course_by_code  → method 'join'        (signed-in student enters code)
--   - quick_start_with_code → method 'quick_start' (anon name+email quick start)
-- Per-seat personal codes (Y8M3KP-01) are tracked separately by
-- profiles.claimed_at (migration 0095) and the roster "Activated" badge.
--
-- Both RPC bodies below are the 0070 definitions verbatim (0070 is the last
-- CREATE OR REPLACE of each); the ONLY change is an append of a redemption-log
-- INSERT, gated on a NEW membership actually being created (FOUND after the
-- ON CONFLICT DO NOTHING) so idempotent re-calls don't inflate the count.
--
-- Forward-only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- SECTION 1: code_redemptions ledger
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.code_redemptions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id      uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  student_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,  -- survives removal
  code_used      text NOT NULL,
  method         text NOT NULL CHECK (method IN ('join', 'quick_start')),
  name_snapshot  text,   -- captured at redemption so detail survives student deletion
  email_snapshot text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS code_redemptions_course_idx
  ON public.code_redemptions (course_id, created_at DESC);

ALTER TABLE public.code_redemptions ENABLE ROW LEVEL SECURITY;

-- Teachers of the course (or admins) read their own course's redemptions.
-- Writes happen only inside the SECURITY DEFINER RPCs below (which bypass RLS),
-- so there is intentionally no INSERT/UPDATE/DELETE policy.
DROP POLICY IF EXISTS "code_redemptions: course staff read" ON public.code_redemptions;
CREATE POLICY "code_redemptions: course staff read"
  ON public.code_redemptions FOR SELECT
  USING (
    public.is_teacher_of_course((SELECT auth.uid()), course_id)
    OR public.is_admin((SELECT auth.uid()))
  );


-- -----------------------------------------------------------------------------
-- SECTION 2: join_course_by_code — 0070 body + redemption log on first join.
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

  -- Log the redemption only when a NEW membership was created (FOUND reflects
  -- whether the INSERT affected a row past ON CONFLICT DO NOTHING).
  IF FOUND THEN
    INSERT INTO public.code_redemptions
      (course_id, student_id, code_used, method, name_snapshot, email_snapshot)
    SELECT v_course_id, v_caller, v_normalized, 'join', p.display_name, p.email
      FROM public.profiles p WHERE p.id = v_caller;
  END IF;

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
-- SECTION 3: quick_start_with_code — 0070 body + redemption log on first join.
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

  IF FOUND THEN
    INSERT INTO public.code_redemptions
      (course_id, student_id, code_used, method, name_snapshot, email_snapshot)
    VALUES (v_course_id, v_caller, v_norm_code, 'quick_start', v_norm_name, v_norm_email);
  END IF;

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
-- END OF MIGRATION 0097_code_redemptions_log.sql
-- =============================================================================
