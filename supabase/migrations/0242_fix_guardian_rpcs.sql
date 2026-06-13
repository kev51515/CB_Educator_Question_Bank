-- =============================================================================
-- Migration: 0242_fix_guardian_rpcs.sql
-- Description: Two latent bugs in the guardian RPCs, surfaced when the parent
--   system was first actually exercised (0 guardians had ever been created):
--
--   1. create_guardian_for_student (0155) RAISEd at call time with
--      `column reference "login_code" is ambiguous` — the function's
--      RETURNS TABLE(... login_code ...) OUT column collides with
--      `profiles.login_code` in the unique-code loop. → guardian creation was
--      BROKEN. Fix: alias the table (`profiles pr`) so the column is
--      unambiguous. (Full CREATE OR REPLACE, body otherwise identical to 0155.)
--
--   2. link_guardian_to_student (0241) inserted a uuid into
--      `audit_events.target_id`, which is TEXT — would error on the first real
--      link. Fix: cast `p_student_id::text`. (Full CREATE OR REPLACE.)
--
-- Forward-only. Idempotent (CREATE OR REPLACE). Numbered 0242.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 1: create_guardian_for_student — disambiguate login_code in the loop.
-- ─────────────────────────────────────────────────────────────────────────────
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

  -- Unique dash-less login code. NOTE: alias the table (`pr`) — bare
  -- `login_code` is ambiguous with the RETURNS TABLE OUT column (the 0155 bug).
  LOOP
    v_code := '';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.profiles pr WHERE pr.login_code = v_code
    );
  END LOOP;
  v_email := lower(v_code) || '@students.local';

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
         login_code   = v_code,
         managed      = true,
         role         = 'guardian',
         updated_at   = now()
   WHERE id = v_uid;

  INSERT INTO public.guardian_students (guardian_id, student_id, created_by)
  VALUES (v_uid, p_student_id, v_caller);

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

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 2: link_guardian_to_student — audit_events.target_id is TEXT, cast it.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.link_guardian_to_student(
  p_login_code text,
  p_student_id uuid
)
RETURNS TABLE (
  guardian_id    uuid,
  display_name   text,
  login_code     text,
  already_linked boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller  uuid := (SELECT auth.uid());
  v_code    text := upper(btrim(coalesce(p_login_code, '')));
  v_gid     uuid;
  v_gname   text;
  v_gcode   text;
  v_exists  boolean;
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

  IF NOT (public.is_admin(v_caller) OR EXISTS (
            SELECT 1
              FROM public.course_memberships cm
              JOIN public.courses c ON c.id = cm.course_id
             WHERE cm.student_id = p_student_id
               AND c.teacher_id  = v_caller
          )) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT pr.id, pr.display_name, pr.login_code
    INTO v_gid, v_gname, v_gcode
    FROM public.profiles pr
   WHERE upper(pr.login_code) = v_code
     AND pr.role = 'guardian'
   LIMIT 1;
  IF v_gid IS NULL THEN
    RAISE EXCEPTION 'guardian_not_found';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.guardian_students gs
     WHERE gs.guardian_id = v_gid AND gs.student_id = p_student_id
  ) INTO v_exists;

  IF NOT v_exists THEN
    -- Already gated by v_exists; no ON CONFLICT (its column-inference clause
    -- collides with the RETURNS TABLE OUT columns guardian_id/… → ambiguous).
    INSERT INTO public.guardian_students (guardian_id, student_id, created_by)
    VALUES (v_gid, p_student_id, v_caller);

    INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
    VALUES (
      v_caller, 'guardian.link', 'profile', p_student_id::text,
      jsonb_build_object('guardian_id', v_gid, 'login_code', v_gcode)
    );
  END IF;

  guardian_id    := v_gid;
  display_name   := v_gname;
  login_code     := v_gcode;
  already_linked := v_exists;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.link_guardian_to_student(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_guardian_to_student(text, uuid) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0242_fix_guardian_rpcs.sql
-- =============================================================================
