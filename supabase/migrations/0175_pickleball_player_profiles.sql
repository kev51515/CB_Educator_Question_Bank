-- =============================================================================
-- Migration: 0151_pickleball_player_profiles.sql
-- Description: Per-(course, student) player profile for the
-- 'pickleball_player' track. One profile row per enrolled player captures the
-- intake details a coach needs: experience, goals, hand/skill/DUPR, contacts.
--
-- The profile is owned by the educator of the course but is also self-service:
-- a player can read AND update their OWN row (matches the counseling
-- self-service pattern from 0136). FK person columns point at profiles(id),
-- NOT at any other pickleball table (avoids cross-lane dependencies).
--
-- RLS reuses the existing SECURITY DEFINER helpers (no inline EXISTS over
-- profiles in WITH CHECK, per the project rule):
--   * is_teacher_of_course(uid, course_id) — owner / co-teacher (0130)
--   * is_admin(uid)                          — admin oversight (0001)
--   * student_id = (SELECT auth.uid())       — the player themself
--     (profiles.id == auth.uid() in this schema, 1:1)
--
-- Forward-only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. pickleball_player_profiles — one row per (course, enrolled player).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pickleball_player_profiles (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id         uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  student_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  dob               date,
  years_played      numeric,
  sports_background text,
  goal              text CHECK (goal IN ('fun', 'fitness', 'competition', 'skill')),
  goal_notes        text,
  referred_by       text,
  skill_level       text,
  dupr              numeric,
  dominant_hand     text CHECK (dominant_hand IN ('left', 'right')),
  start_date        date,
  contact           text,
  emergency_contact text,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, student_id)
);
CREATE INDEX IF NOT EXISTS pickleball_player_profiles_course_idx
  ON public.pickleball_player_profiles (course_id);
ALTER TABLE public.pickleball_player_profiles ENABLE ROW LEVEL SECURITY;

-- Educator of the course (owner / co-teacher / admin) has full read+write.
DROP POLICY IF EXISTS "pk_player_profiles: educator manages"
  ON public.pickleball_player_profiles;
CREATE POLICY "pk_player_profiles: educator manages"
  ON public.pickleball_player_profiles
  FOR ALL
  USING (
    public.is_teacher_of_course((SELECT auth.uid()), course_id)
    OR public.is_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    public.is_teacher_of_course((SELECT auth.uid()), course_id)
    OR public.is_admin((SELECT auth.uid()))
  );

-- The player reads their OWN profile row.
DROP POLICY IF EXISTS "pk_player_profiles: self reads"
  ON public.pickleball_player_profiles;
CREATE POLICY "pk_player_profiles: self reads"
  ON public.pickleball_player_profiles
  FOR SELECT
  USING (student_id = (SELECT auth.uid()));

-- The player updates their OWN profile row (no INSERT/DELETE — those go through
-- the educator policy or the upsert RPC, which a player calls only for self).
DROP POLICY IF EXISTS "pk_player_profiles: self updates"
  ON public.pickleball_player_profiles;
CREATE POLICY "pk_player_profiles: self updates"
  ON public.pickleball_player_profiles
  FOR UPDATE
  USING (student_id = (SELECT auth.uid()))
  WITH CHECK (student_id = (SELECT auth.uid()));

-- -----------------------------------------------------------------------------
-- 2. pk_upsert_player_profile — create-or-edit a player's profile.
--    Allowed for: the educator of the course, OR the player themself
--    (p_student_id must equal auth.uid()). Upserts on (course_id, student_id).
--    Stable error codes: not_authenticated / not_authorized / invalid_input.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pk_upsert_player_profile(
  p_course_id         uuid,
  p_student_id        uuid,
  p_dob               date    DEFAULT NULL,
  p_years_played      numeric DEFAULT NULL,
  p_sports_background text    DEFAULT NULL,
  p_goal              text    DEFAULT NULL,
  p_goal_notes        text    DEFAULT NULL,
  p_referred_by       text    DEFAULT NULL,
  p_skill_level       text    DEFAULT NULL,
  p_dupr              numeric DEFAULT NULL,
  p_dominant_hand     text    DEFAULT NULL,
  p_start_date        date    DEFAULT NULL,
  p_contact           text    DEFAULT NULL,
  p_emergency_contact text    DEFAULT NULL
)
  RETURNS public.pickleball_player_profiles
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_row    public.pickleball_player_profiles;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_course_id IS NULL OR p_student_id IS NULL THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  -- Authorisation: educator of the course, OR the player editing their own row.
  IF NOT (
    public.is_teacher_of_course(v_caller, p_course_id)
    OR public.is_admin(v_caller)
    OR p_student_id = v_caller
  ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- Enum-shaped fields are CHECK-constrained; validate here for a stable code
  -- instead of a raw 23514 constraint violation.
  IF p_goal IS NOT NULL
     AND p_goal NOT IN ('fun', 'fitness', 'competition', 'skill') THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;
  IF p_dominant_hand IS NOT NULL
     AND p_dominant_hand NOT IN ('left', 'right') THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.pickleball_player_profiles AS pp (
    course_id, student_id, dob, years_played, sports_background, goal,
    goal_notes, referred_by, skill_level, dupr, dominant_hand, start_date,
    contact, emergency_contact, updated_at
  )
  VALUES (
    p_course_id, p_student_id, p_dob, p_years_played, p_sports_background,
    p_goal, p_goal_notes, p_referred_by, p_skill_level, p_dupr,
    p_dominant_hand, p_start_date, p_contact, p_emergency_contact, now()
  )
  ON CONFLICT (course_id, student_id) DO UPDATE
    SET dob               = EXCLUDED.dob,
        years_played      = EXCLUDED.years_played,
        sports_background = EXCLUDED.sports_background,
        goal              = EXCLUDED.goal,
        goal_notes        = EXCLUDED.goal_notes,
        referred_by       = EXCLUDED.referred_by,
        skill_level       = EXCLUDED.skill_level,
        dupr              = EXCLUDED.dupr,
        dominant_hand     = EXCLUDED.dominant_hand,
        start_date        = EXCLUDED.start_date,
        contact           = EXCLUDED.contact,
        emergency_contact = EXCLUDED.emergency_contact,
        updated_at        = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.pk_upsert_player_profile(
  uuid, uuid, date, numeric, text, text, text, text, text, numeric, text,
  date, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_upsert_player_profile(
  uuid, uuid, date, numeric, text, text, text, text, text, numeric, text,
  date, text, text
) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. pk_delete_player_profile — educator removes a player's profile row.
--    Stable error codes: not_authenticated / not_authorized / not_found.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pk_delete_player_profile(p_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_row    public.pickleball_player_profiles;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_row FROM public.pickleball_player_profiles WHERE id = p_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = '02000';
  END IF;

  IF NOT (
    public.is_teacher_of_course(v_caller, v_row.course_id)
    OR public.is_admin(v_caller)
  ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.pickleball_player_profiles WHERE id = p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.pk_delete_player_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_delete_player_profile(uuid) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0151_pickleball_player_profiles.sql
-- =============================================================================
