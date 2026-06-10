-- =============================================================================
-- Migration: 0153_pickleball_coach_core.sql
-- Description: Coach-track core data for the Pickleball coaching feature
-- (course_type = 'pickleball_coach', see 0150). Two tables:
--
--   pickleball_coach_profiles   — one biographical/intake record per coach
--                                 (a student-role enrollee) per course.
--   pickleball_certifications   — coaching certifications a coach has earned;
--                                 optional expiry so the UI can flag "expiring
--                                 soon" / "expired".
--
-- RLS mirrors the counseling model (0134/0140) and the program catalog (0150):
--   * Educator of the course (owner / co-teacher / admin) has full read+write.
--   * The coach (coach_id = auth.uid()) reads their OWN profile + certs and may
--     edit (insert/update) their own PROFILE. Certifications stay educator-
--     managed (a coach reads but can't mint/delete their own creds) — so the
--     coach has no insert/update/delete policy on pickleball_certifications,
--     only SELECT of their own rows.
--
-- All person FK columns point at profiles(id) (NOT at other pickleball tables)
-- to avoid cross-lane dependencies. coach_id == auth.uid() for an enrolled
-- coach because profiles.id == auth.uid() in this schema (see Foundation note).
--
-- RPCs (pk_ prefix, SECURITY DEFINER, stable string error codes):
--   pk_upsert_coach_profile(...)  — educator-of-course OR the coach themself.
--   pk_add_certification(...)     — educator only (insert or edit own course's).
--   pk_delete_certification(p_id) — educator only.
--
-- Forward-only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. pickleball_coach_profiles — one intake/bio record per (course, coach).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pickleball_coach_profiles (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id         uuid NOT NULL REFERENCES public.courses(id)  ON DELETE CASCADE,
  coach_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  dob               date,
  years_played      numeric,
  sports_background text,
  referred_by       text,
  contact           text,
  emergency_contact text,
  bio               text,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, coach_id)
);
CREATE INDEX IF NOT EXISTS pickleball_coach_profiles_course_idx
  ON public.pickleball_coach_profiles (course_id);
ALTER TABLE public.pickleball_coach_profiles ENABLE ROW LEVEL SECURITY;

-- Educator of the course (owner / co-teacher / admin) has full read+write.
DROP POLICY IF EXISTS "pk_coach_profiles: educator manages" ON public.pickleball_coach_profiles;
CREATE POLICY "pk_coach_profiles: educator manages" ON public.pickleball_coach_profiles
  FOR ALL
  USING (public.is_teacher_of_course((SELECT auth.uid()), course_id) OR public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_teacher_of_course((SELECT auth.uid()), course_id) OR public.is_admin((SELECT auth.uid())));

-- The coach reads their OWN profile.
DROP POLICY IF EXISTS "pk_coach_profiles: coach reads own" ON public.pickleball_coach_profiles;
CREATE POLICY "pk_coach_profiles: coach reads own" ON public.pickleball_coach_profiles
  FOR SELECT
  USING (coach_id = (SELECT auth.uid()));

-- The coach may UPDATE their own profile row (e.g. fix their bio/contact).
-- INSERT for a brand-new row goes through the RPC (which also validates
-- membership), so we only grant UPDATE here.
DROP POLICY IF EXISTS "pk_coach_profiles: coach updates own" ON public.pickleball_coach_profiles;
CREATE POLICY "pk_coach_profiles: coach updates own" ON public.pickleball_coach_profiles
  FOR UPDATE
  USING (coach_id = (SELECT auth.uid()))
  WITH CHECK (coach_id = (SELECT auth.uid()));

DROP TRIGGER IF EXISTS trg_pk_coach_profiles_updated_at ON public.pickleball_coach_profiles;
CREATE TRIGGER trg_pk_coach_profiles_updated_at
  BEFORE UPDATE ON public.pickleball_coach_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 2. pickleball_certifications — coaching credentials a coach has earned.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pickleball_certifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id    uuid NOT NULL REFERENCES public.courses(id)  ON DELETE CASCADE,
  coach_id     uuid NOT NULL REFERENCES public.profiles(id),
  name         text NOT NULL,
  issuing_body text,
  level        text,
  earned_on    date,
  expires_on   date,
  cert_no      text,
  file_url     text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pickleball_certifications_course_coach_idx
  ON public.pickleball_certifications (course_id, coach_id);
ALTER TABLE public.pickleball_certifications ENABLE ROW LEVEL SECURITY;

-- Educator of the course (owner / co-teacher / admin) has full read+write.
DROP POLICY IF EXISTS "pk_certs: educator manages" ON public.pickleball_certifications;
CREATE POLICY "pk_certs: educator manages" ON public.pickleball_certifications
  FOR ALL
  USING (public.is_teacher_of_course((SELECT auth.uid()), course_id) OR public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_teacher_of_course((SELECT auth.uid()), course_id) OR public.is_admin((SELECT auth.uid())));

-- The coach reads their OWN certifications (read-only; minting/deleting is
-- educator-only, so no coach INSERT/UPDATE/DELETE policy here).
DROP POLICY IF EXISTS "pk_certs: coach reads own" ON public.pickleball_certifications;
CREATE POLICY "pk_certs: coach reads own" ON public.pickleball_certifications
  FOR SELECT
  USING (coach_id = (SELECT auth.uid()));

-- -----------------------------------------------------------------------------
-- 3. pk_upsert_coach_profile — create or edit a coach's intake/bio record.
--    Allowed for the educator of the course OR the coach themself. The coach
--    must be an enrolled member of the course (guards against a coach writing a
--    profile for a course they aren't in). Returns the row.
--    Stable error codes: not_authenticated / not_authorized / invalid_input.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pk_upsert_coach_profile(
  p_course_id         uuid,
  p_coach_id          uuid,
  p_dob               date    DEFAULT NULL,
  p_years_played      numeric DEFAULT NULL,
  p_sports_background text    DEFAULT NULL,
  p_referred_by       text    DEFAULT NULL,
  p_contact           text    DEFAULT NULL,
  p_emergency_contact text    DEFAULT NULL,
  p_bio               text    DEFAULT NULL
)
  RETURNS public.pickleball_coach_profiles
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_is_ed  boolean;
  v_row    public.pickleball_coach_profiles;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_course_id IS NULL OR p_coach_id IS NULL THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  v_is_ed := public.is_teacher_of_course(v_caller, p_course_id) OR public.is_admin(v_caller);

  -- The caller is either the educator, or the coach editing their OWN record
  -- (and that coach must actually be enrolled in the course).
  IF NOT v_is_ed THEN
    IF v_caller <> p_coach_id THEN
      RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
    END IF;
    IF NOT public.is_student_in_class(v_caller, p_course_id) THEN
      RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.pickleball_coach_profiles AS p (
    course_id, coach_id, dob, years_played, sports_background,
    referred_by, contact, emergency_contact, bio
  )
  VALUES (
    p_course_id, p_coach_id, p_dob, p_years_played, p_sports_background,
    p_referred_by, p_contact, p_emergency_contact, p_bio
  )
  ON CONFLICT (course_id, coach_id) DO UPDATE
     SET dob               = EXCLUDED.dob,
         years_played      = EXCLUDED.years_played,
         sports_background = EXCLUDED.sports_background,
         referred_by       = EXCLUDED.referred_by,
         contact           = EXCLUDED.contact,
         emergency_contact = EXCLUDED.emergency_contact,
         bio               = EXCLUDED.bio,
         updated_at        = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.pk_upsert_coach_profile(uuid, uuid, date, numeric, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_upsert_coach_profile(uuid, uuid, date, numeric, text, text, text, text, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. pk_add_certification — educator creates or edits a certification record.
--    Educator-only. p_id NULL = create; non-NULL = edit (must belong to the
--    asserted course else not_found). Returns the row.
--    Stable error codes: not_authenticated / not_authorized / invalid_input /
--    not_found.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pk_add_certification(
  p_course_id    uuid,
  p_coach_id     uuid,
  p_id           uuid    DEFAULT NULL,
  p_name         text    DEFAULT NULL,
  p_issuing_body text    DEFAULT NULL,
  p_level        text    DEFAULT NULL,
  p_earned_on    date    DEFAULT NULL,
  p_expires_on   date    DEFAULT NULL,
  p_cert_no      text    DEFAULT NULL,
  p_file_url     text    DEFAULT NULL
)
  RETURNS public.pickleball_certifications
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_row    public.pickleball_certifications;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_course_id IS NULL OR p_coach_id IS NULL THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  IF NOT (public.is_teacher_of_course(v_caller, p_course_id) OR public.is_admin(v_caller)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.pickleball_certifications (
      course_id, coach_id, name, issuing_body, level,
      earned_on, expires_on, cert_no, file_url
    )
    VALUES (
      p_course_id, p_coach_id, btrim(p_name), p_issuing_body, p_level,
      p_earned_on, p_expires_on, p_cert_no, p_file_url
    )
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.pickleball_certifications
       SET coach_id     = p_coach_id,
           name         = btrim(p_name),
           issuing_body = p_issuing_body,
           level        = p_level,
           earned_on    = p_earned_on,
           expires_on   = p_expires_on,
           cert_no      = p_cert_no,
           file_url     = p_file_url
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
REVOKE ALL ON FUNCTION public.pk_add_certification(uuid, uuid, uuid, text, text, text, date, date, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_add_certification(uuid, uuid, uuid, text, text, text, date, date, text, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. pk_delete_certification — educator deletes a certification record.
--    Educator-only. Stable error codes: not_authenticated / not_authorized /
--    not_found. Returns the deleted id.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pk_delete_certification(p_id uuid)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller    uuid := (SELECT auth.uid());
  v_course_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT course_id INTO v_course_id
    FROM public.pickleball_certifications
   WHERE id = p_id;

  IF v_course_id IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = '02000';
  END IF;

  IF NOT (public.is_teacher_of_course(v_caller, v_course_id) OR public.is_admin(v_caller)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.pickleball_certifications WHERE id = p_id;

  RETURN p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.pk_delete_certification(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_delete_certification(uuid) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0153_pickleball_coach_core.sql
-- =============================================================================
