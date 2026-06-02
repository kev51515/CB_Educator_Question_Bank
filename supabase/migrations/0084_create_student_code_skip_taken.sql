-- =============================================================================
-- Migration: 0084_create_student_code_skip_taken.sql
-- Description: admin_create_student now skips already-taken roster codes.
--
-- Bug: the next code was max(roster_seq)+1 over CURRENT memberships. Removing a
-- student deletes their course_memberships row but NOT their profile / auth
-- user, so its login_code (e.g. KQAZNP-02) + synthetic email
-- (kqaznp-02@students.local) live on. A later create that recomputed seq=2 then
-- failed with `users_email_partial_key` / `profiles_login_code_key` duplicate.
--
-- Fix: from the computed starting seq, loop upward until the candidate roster
-- code is free of (a) any profile login_code, (b) any auth.users email, and
-- (c) any membership roster_code in this course. Everything else identical to
-- 0067. Forward-only.
-- =============================================================================

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

  -- Lock the course row, then find the first FREE sequence at/after max+1.
  PERFORM 1 FROM public.courses WHERE id = p_course_id FOR UPDATE;
  SELECT coalesce(max(roster_seq), 0) + 1
    INTO v_seq
    FROM public.course_memberships
   WHERE course_id = p_course_id;

  LOOP
    v_roster_code := v_short_code || '-' || lpad(v_seq::text, 2, '0');
    v_email       := lower(v_roster_code) || '@students.local';
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE login_code = v_roster_code)
          AND NOT EXISTS (SELECT 1 FROM auth.users WHERE email = v_email)
          AND NOT EXISTS (SELECT 1 FROM public.course_memberships
                           WHERE course_id = p_course_id AND roster_code = v_roster_code);
    v_seq := v_seq + 1;
  END LOOP;

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

  INSERT INTO auth.identities (
    id, provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), v_uid::text, v_uid,
    jsonb_build_object('sub', v_uid::text, 'email', v_email),
    'email', now(), now(), now()
  );

  UPDATE public.profiles
     SET display_name = v_name,
         email        = v_email,
         login_code   = v_roster_code,
         managed      = true,
         updated_at   = now()
   WHERE id = v_uid;

  INSERT INTO public.course_memberships (course_id, student_id, roster_code, roster_seq)
  VALUES (p_course_id, v_uid, v_roster_code, v_seq);

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

-- =============================================================================
-- END OF MIGRATION 0084_create_student_code_skip_taken.sql
-- =============================================================================
