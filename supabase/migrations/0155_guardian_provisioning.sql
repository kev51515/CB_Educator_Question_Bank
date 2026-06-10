-- =============================================================================
-- Migration: 0155_guardian_provisioning.sql
-- Teacher-side provisioning of guardian (parent) accounts.
--
-- A guardian is a managed profile (role='guardian', managed=true) with a coded
-- login — same mechanism as a managed student (0067): direct auth.users +
-- auth.identities INSERT via SECURITY DEFINER, synthetic <code>@students.local
-- email, bcrypt password. It is NOT enrolled in any course; instead it is
-- attached to one or more students via guardian_students (0153). The LINE
-- enqueue trigger (0153) then mirrors each linked student's notifications to
-- the guardian's bound LINE account.
--
-- RPCs (all authenticated, gated to a teacher of a course the student is in,
-- or an admin):
--   • create_guardian_for_student(student, name, password) -> (id, code, email)
--   • list_guardians_for_student(student)  -> rows for the teacher UI
--   • unlink_guardian(guardian, student)   -> remove the link
--
-- Login code: bare 6-letter, alphabet A–Z minus the I/L/O/Q confusables
-- (matches the managed-student dash-less direction). Globally unique via the
-- profiles.login_code unique index; we retry on the rare collision.
--
-- !! Part of the LINE block 0153/0154/0155 — re-verify numbering before push.
-- Mirrors 0067's auth-creation pattern; reconcile with the live dash-less
-- helper (0148/0150) at merge so there's a single code generator. crypt()/
-- gen_salt() live in `extensions` — hence the search_path. Forward-only.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- create_guardian_for_student
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_guardian_for_student(
  p_student_id   uuid,
  p_display_name text,
  p_password     text
)
  RETURNS TABLE (guardian_id uuid, login_code text, email text)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth, extensions
AS $$
DECLARE
  v_caller   uuid := auth.uid();
  v_allowed  boolean;
  v_name     text;
  v_code     text;
  v_email    text;
  v_uid      uuid := gen_random_uuid();
  v_alphabet text := 'ABCDEFGHJKMNPRSTUVWXYZ';  -- 22 letters: A–Z minus I,L,O,Q
  i          int;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT public.is_staff(v_caller) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_student_id) THEN
    RAISE EXCEPTION 'student_not_found';
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

  v_name := trim(coalesce(p_display_name, ''));
  IF v_name = '' THEN
    RAISE EXCEPTION 'invalid_name';
  END IF;
  IF length(coalesce(p_password, '')) < 6 THEN
    RAISE EXCEPTION 'weak_password';
  END IF;

  -- Unique dash-less login code.
  LOOP
    v_code := '';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE login_code = v_code);
  END LOOP;
  v_email := lower(v_code) || '@students.local';

  -- 1. Mint the auth user; handle_new_auth_user (0001) creates the profile row.
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
    jsonb_build_object('display_name', v_name, 'role', 'guardian'),
    now(), now(),
    '', '', '', ''
  );

  -- 2. Identity row so GoTrue password sign-in resolves the email -> user.
  INSERT INTO auth.identities (
    id, provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), v_uid::text, v_uid,
    jsonb_build_object('sub', v_uid::text, 'email', v_email),
    'email', now(), now(), now()
  );

  -- 3. Stamp the guardian flags onto the profile the trigger made.
  UPDATE public.profiles
     SET display_name = v_name,
         email        = v_email,
         login_code   = v_code,
         managed      = true,
         role         = 'guardian',
         updated_at   = now()
   WHERE id = v_uid;

  -- 4. Attach to the student.
  INSERT INTO public.guardian_students (guardian_id, student_id, created_by)
  VALUES (v_uid, p_student_id, v_caller);

  -- 5. Audit.
  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (
    v_caller, 'guardian.create', 'profile', v_uid::text,
    jsonb_build_object('student_id', p_student_id, 'login_code', v_code)
  );

  RETURN QUERY SELECT v_uid, v_code, v_email;
END;
$$;
REVOKE ALL ON FUNCTION public.create_guardian_for_student(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_guardian_for_student(uuid, text, text) TO authenticated;


-- -----------------------------------------------------------------------------
-- list_guardians_for_student — for the teacher UI (RLS on guardian_students is
-- party-scoped, so a teacher needs this SECURITY DEFINER read).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_guardians_for_student(p_student_id uuid)
  RETURNS TABLE (guardian_id uuid, display_name text, login_code text, created_at timestamptz)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller  uuid := auth.uid();
  v_allowed boolean;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
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

  RETURN QUERY
    SELECT p.id, p.display_name, p.login_code, gs.created_at
      FROM public.guardian_students gs
      JOIN public.profiles p ON p.id = gs.guardian_id
     WHERE gs.student_id = p_student_id
     ORDER BY gs.created_at;
END;
$$;
REVOKE ALL ON FUNCTION public.list_guardians_for_student(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_guardians_for_student(uuid) TO authenticated;


-- -----------------------------------------------------------------------------
-- unlink_guardian — remove a guardian<->student link (does NOT delete the
-- guardian account; a guardian may still be linked to other students).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.unlink_guardian(
  p_guardian_id uuid,
  p_student_id  uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller  uuid := auth.uid();
  v_allowed boolean;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
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

  DELETE FROM public.guardian_students
   WHERE guardian_id = p_guardian_id
     AND student_id  = p_student_id;

  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (
    v_caller, 'guardian.unlink', 'profile', p_guardian_id::text,
    jsonb_build_object('student_id', p_student_id)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.unlink_guardian(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unlink_guardian(uuid, uuid) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0155_guardian_provisioning.sql
-- =============================================================================
