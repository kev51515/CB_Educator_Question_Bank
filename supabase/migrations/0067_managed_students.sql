-- =============================================================================
-- Migration: 0067_managed_students.sql
-- Description: Teacher-managed student accounts + per-course recognition codes.
--
-- Context (decided 2026-06-02): a teacher wants to *create* student logins
-- directly from the roster — no email round-trip, no student self-signup —
-- and recognise each student by a short per-course code (e.g. "KQAZNP-04").
-- The student signs in with that code + an auto-generated password.
--
-- This migration adds:
--   • profiles.login_code  — the global login username for a managed student.
--                            Equals the roster_code of the course they were
--                            created in (course short_codes are globally
--                            unique, so this is unique too). NULL for ordinary
--                            self-signup / anonymous users.
--   • profiles.managed     — true for teacher-created accounts. Gates the
--                            password-reset RPC (we only ever reset passwords
--                            for accounts we minted, never a real person's).
--   • course_memberships.roster_code / roster_seq — the per-course recognition
--                            code shown in the roster. roster_seq is the 1-based
--                            ordinal within the course; roster_code is
--                            "<course.short_code>-<NN>".
--
-- And two SECURITY DEFINER RPCs (the only way to mint an auth user from the
-- teacher's browser, which carries only the anon key — no service role):
--   • admin_create_student(course, name, password)
--   • admin_reset_student_password(student, password)
--
-- Login identity: synthetic email "<lower(login_code)>@students.local". The
-- client's sign-in screen maps a typed code → that email. We use a reserved,
-- never-deliverable domain on purpose: these mailboxes don't exist and don't
-- need to.
--
-- WHY direct auth.users INSERT: Supabase's admin.createUser needs the service
-- role, which must never ship to a browser. A SECURITY DEFINER function runs
-- as its owner (supabase_admin) and may write auth.* directly. The
-- handle_new_auth_user trigger (0001) fires on the INSERT and creates the
-- public.profiles row; we then stamp login_code/managed onto it. We also
-- insert the matching auth.identities row so GoTrue password sign-in works.
--
-- crypt()/gen_salt() live in the `extensions` schema on Supabase — hence the
-- search_path below includes it.
--
-- Forward-only. Tested against smoke suite before push.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- SECTION 1: SCHEMA
-- -----------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS login_code text,
  ADD COLUMN IF NOT EXISTS managed    boolean NOT NULL DEFAULT false;

-- login_code is the login username — must be globally unique when present.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_login_code_key
  ON public.profiles (login_code)
  WHERE login_code IS NOT NULL;

ALTER TABLE public.course_memberships
  ADD COLUMN IF NOT EXISTS roster_code text,
  ADD COLUMN IF NOT EXISTS roster_seq  integer;

-- roster_code is unique within a course (the per-course recognition id).
CREATE UNIQUE INDEX IF NOT EXISTS course_memberships_course_roster_code_key
  ON public.course_memberships (course_id, roster_code)
  WHERE roster_code IS NOT NULL;


-- -----------------------------------------------------------------------------
-- SECTION 2: admin_create_student
-- Creates a managed student account, enrols it in the course, and returns the
-- credentials the teacher hands to the student.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_create_student(
  p_course_id    uuid,
  p_display_name text,
  p_password     text
)
  RETURNS TABLE (
    student_id  uuid,
    login_code  text,
    roster_code text,
    email       text
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth, extensions
AS $$
DECLARE
  v_caller       uuid := auth.uid();
  v_short_code   text;
  v_is_owner     boolean;
  v_name         text;
  v_seq          integer;
  v_roster_code  text;
  v_email        text;
  v_uid          uuid := gen_random_uuid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Must be staff AND either the course's teacher or an admin.
  IF NOT public.is_staff(v_caller) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT c.short_code,
         (c.teacher_id = v_caller OR public.is_admin(v_caller))
    INTO v_short_code, v_is_owner
    FROM public.courses c
   WHERE c.id = p_course_id;

  IF v_short_code IS NULL THEN
    RAISE EXCEPTION 'course_not_found';
  END IF;
  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  v_name := trim(coalesce(p_display_name, ''));
  IF v_name = '' THEN
    RAISE EXCEPTION 'invalid_name';
  END IF;
  IF length(coalesce(p_password, '')) < 6 THEN
    RAISE EXCEPTION 'weak_password';
  END IF;

  -- Next ordinal within the course. Lock the course row so two concurrent
  -- creates can't grab the same seq (the unique index would reject the loser,
  -- but locking gives a clean serial instead of a surprising error).
  PERFORM 1 FROM public.courses WHERE id = p_course_id FOR UPDATE;
  SELECT coalesce(max(roster_seq), 0) + 1
    INTO v_seq
    FROM public.course_memberships
   WHERE course_id = p_course_id;

  v_roster_code := v_short_code || '-' || lpad(v_seq::text, 2, '0');
  v_email       := lower(v_roster_code) || '@students.local';

  -- 1. Mint the auth user. The handle_new_auth_user trigger creates the
  --    matching public.profiles row from raw_user_meta_data.
  INSERT INTO auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_uid, 'authenticated', 'authenticated', v_email,
    crypt(p_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('display_name', v_name, 'role', 'student'),
    now(), now(),
    '', '', '', ''
  );

  -- 2. Identity row so GoTrue password sign-in resolves the email→user.
  INSERT INTO auth.identities (
    id, provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), v_uid::text, v_uid,
    jsonb_build_object('sub', v_uid::text, 'email', v_email),
    'email', now(), now(), now()
  );

  -- 3. Stamp the managed flags + login_code onto the profile the trigger made.
  UPDATE public.profiles
     SET display_name = v_name,
         email        = v_email,
         login_code   = v_roster_code,
         managed      = true,
         updated_at   = now()
   WHERE id = v_uid;

  -- 4. Enrol in the course with the per-course recognition code.
  INSERT INTO public.course_memberships (course_id, student_id, roster_code, roster_seq)
  VALUES (p_course_id, v_uid, v_roster_code, v_seq);

  -- 5. Audit.
  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (
    v_caller, 'student.create', 'profile', v_uid::text,
    jsonb_build_object('course_id', p_course_id, 'roster_code', v_roster_code)
  );

  RETURN QUERY SELECT v_uid, v_roster_code, v_roster_code, v_email;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_student(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_student(uuid, text, text) TO authenticated;


-- -----------------------------------------------------------------------------
-- SECTION 3: admin_reset_student_password
-- Re-set the password for a managed student the caller teaches. Only ever
-- touches accounts we minted (managed=true) — never a real person's account.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_reset_student_password(
  p_student_id uuid,
  p_password   text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth, extensions
AS $$
DECLARE
  v_caller  uuid := auth.uid();
  v_managed boolean;
  v_allowed boolean;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT public.is_staff(v_caller) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF length(coalesce(p_password, '')) < 6 THEN
    RAISE EXCEPTION 'weak_password';
  END IF;

  SELECT managed INTO v_managed FROM public.profiles WHERE id = p_student_id;
  IF v_managed IS NULL THEN
    RAISE EXCEPTION 'student_not_found';
  END IF;
  IF NOT v_managed THEN
    -- Refuse to touch a self-signup / real account.
    RAISE EXCEPTION 'not_managed';
  END IF;

  -- Caller must teach a course this student is in (or be admin).
  SELECT public.is_admin(v_caller) OR EXISTS (
    SELECT 1
      FROM public.course_memberships cm
      JOIN public.courses c ON c.id = cm.course_id
     WHERE cm.student_id = p_student_id
       AND c.teacher_id  = v_caller
  ) INTO v_allowed;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE auth.users
     SET encrypted_password = crypt(p_password, gen_salt('bf')),
         updated_at         = now()
   WHERE id = p_student_id;

  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (v_caller, 'student.password_reset', 'profile', p_student_id::text, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reset_student_password(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reset_student_password(uuid, text) TO authenticated;


-- =============================================================================
-- END OF MIGRATION 0067_managed_students.sql
-- =============================================================================
