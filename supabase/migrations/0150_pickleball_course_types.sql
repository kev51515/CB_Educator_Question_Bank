-- =============================================================================
-- Migration: 0150_pickleball_course_types.sql
-- Description: Foundation for the Pickleball coaching feature. Adds two new
-- course_type values alongside the existing 'class' / 'counseling' (0133):
--
--   'pickleball_player' — coach players: profiles, lessons, recaps, programs,
--                         community chat.
--   'pickleball_coach'  — develop coaches: certifications, hours, programs
--                         taught, community chat.
--
-- The split mirrors the counseling model (0133/0134/0140): course_type drives
-- which tabs/features the UI shows per course. RLS reuses the existing
-- SECURITY DEFINER helpers:
--   * is_teacher_of_course(uid, course_id)  — owner OR share recipient (0130)
--   * is_student_in_class(uid, course_id)   — enrolled member via
--                                              course_memberships (0012/0130)
-- A thin pk_is_course_member(course_id) wrapper is added for client/RPC use so
-- the member check has a stable, pickleball-prefixed name; it simply delegates
-- to is_student_in_class with the signed-in auth.uid().
--
-- This migration only seeds the program-catalog table + RPCs that BOTH the
-- player and coach tracks share (a "program" = a named coaching track/series a
-- course offers). Track-specific tables land in later migrations.
--
-- Forward-only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Extend the course_type CHECK constraint (real name from 0133:
--    courses_course_type_check) to allow the two pickleball values.
-- -----------------------------------------------------------------------------
ALTER TABLE public.courses
  DROP CONSTRAINT IF EXISTS courses_course_type_check;
ALTER TABLE public.courses
  ADD CONSTRAINT courses_course_type_check
  CHECK (course_type IN ('class', 'counseling', 'pickleball_player', 'pickleball_coach'));

-- -----------------------------------------------------------------------------
-- 2. pk_is_course_member — stable, pickleball-prefixed "is signed-in user an
--    enrolled member of this course" check. Delegates to the canonical
--    is_student_in_class helper so there is ONE source of truth for membership.
--    SECURITY DEFINER so it can read course_memberships regardless of the
--    caller's RLS, matching the existing helpers.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pk_is_course_member(p_course_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
  SELECT public.is_student_in_class((SELECT auth.uid()), p_course_id);
$$;
REVOKE ALL ON FUNCTION public.pk_is_course_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_is_course_member(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. pickleball_programs — per-course catalog of coaching programs/tracks
--    shared by both the player and coach surfaces.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pickleball_programs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  sort_order  integer NOT NULL DEFAULT 0,
  archived    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pickleball_programs_course_idx
  ON public.pickleball_programs (course_id);
ALTER TABLE public.pickleball_programs ENABLE ROW LEVEL SECURITY;

-- Educator of the course (owner / co-teacher / admin) has full read+write.
DROP POLICY IF EXISTS "pk_programs: educator manages" ON public.pickleball_programs;
CREATE POLICY "pk_programs: educator manages" ON public.pickleball_programs
  FOR ALL
  USING (public.is_teacher_of_course((SELECT auth.uid()), course_id) OR public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_teacher_of_course((SELECT auth.uid()), course_id) OR public.is_admin((SELECT auth.uid())));

-- Enrolled members read the catalog (so a player/coach can see the programs
-- their course offers).
DROP POLICY IF EXISTS "pk_programs: member reads" ON public.pickleball_programs;
CREATE POLICY "pk_programs: member reads" ON public.pickleball_programs
  FOR SELECT
  USING (public.is_student_in_class((SELECT auth.uid()), course_id));

-- -----------------------------------------------------------------------------
-- 4. pk_upsert_program — educator creates or edits a program. Returns the row.
--    Stable error codes: not_authenticated / not_authorized / invalid_input /
--    not_found.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pk_upsert_program(
  p_course_id   uuid,
  p_id          uuid,
  p_name        text,
  p_description text DEFAULT NULL,
  p_sort_order  integer DEFAULT 0
)
  RETURNS public.pickleball_programs
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_row    public.pickleball_programs;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_course_id IS NULL THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  IF NOT (public.is_teacher_of_course(v_caller, p_course_id) OR public.is_admin(v_caller)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  IF p_id IS NULL THEN
    -- Create
    INSERT INTO public.pickleball_programs (course_id, name, description, sort_order)
    VALUES (p_course_id, btrim(p_name), p_description, COALESCE(p_sort_order, 0))
    RETURNING * INTO v_row;
  ELSE
    -- Edit — must belong to the asserted course.
    UPDATE public.pickleball_programs
       SET name        = btrim(p_name),
           description = p_description,
           sort_order  = COALESCE(p_sort_order, 0)
     WHERE id = p_id
       AND course_id = p_course_id
     RETURNING * INTO v_row;

    IF v_row.id IS NULL THEN
      RAISE EXCEPTION 'not_found' USING ERRCODE = '02000';
    END IF;
  END IF;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.pk_upsert_program(uuid, uuid, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_upsert_program(uuid, uuid, text, text, integer) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. pk_archive_program — educator archives / unarchives a program. Returns the
--    row. Stable error codes: not_authenticated / not_authorized / not_found.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pk_archive_program(
  p_id       uuid,
  p_archived boolean
)
  RETURNS public.pickleball_programs
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_row    public.pickleball_programs;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_row FROM public.pickleball_programs WHERE id = p_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = '02000';
  END IF;

  IF NOT (public.is_teacher_of_course(v_caller, v_row.course_id) OR public.is_admin(v_caller)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.pickleball_programs
     SET archived = COALESCE(p_archived, false)
   WHERE id = p_id
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.pk_archive_program(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_archive_program(uuid, boolean) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0150_pickleball_course_types.sql
-- =============================================================================
