-- =============================================================================
-- Migration: 0148_admin_create_student_dashless_code.sql
-- Description: `admin_create_student` now mints a NON-GUESSABLE, dash-less login
--              code — fixing a regression.
--
-- Background: a prior wave ("non-guessable login codes") replaced the old
-- sequential `<short_code>-NN` seat codes (e.g. `Y8M3KP-01`) with random codes
-- of **6 distinct uppercase letters, A–Z minus I/O/L** (e.g. `KMCZQR`). But that
-- wave only RE-KEYED existing rows — it never updated `admin_create_student`, so
-- every newly-created student regressed straight back to a `<short_code>-NN`
-- dash code. This migration fixes the generator at the source.
--
-- A student's `login_code` IS their auth identity: the synthetic email is
-- `<lower(code)>@students.local`, and the per-course `course_memberships
-- .roster_code` mirrors it. All three are derived from the one generated code,
-- exactly as before — only the SHAPE of the code changes (letters, no dash, no
-- course prefix). `peek_join_code` (0142) already routes these bare codes to the
-- claim flow, so nothing downstream needs to change.
--
-- Body reproduced verbatim from the live definition; the ONLY change is the
-- code-generation LOOP. Forward-only; `CREATE OR REPLACE` so it's idempotent.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_create_student(
  p_course_id uuid,
  p_display_name text,
  p_password text
)
  RETURNS TABLE(student_id uuid, login_code text, roster_code text, email text)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'auth', 'extensions'
AS $function$
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

  -- roster_seq still orders the seat within the course; the CODE no longer uses it.
  PERFORM 1 FROM public.courses WHERE id = p_course_id FOR UPDATE;
  SELECT coalesce(max(cm.roster_seq), 0) + 1
    INTO v_seq
    FROM public.course_memberships cm
   WHERE cm.course_id = p_course_id;

  -- Generate a non-guessable code: 6 DISTINCT uppercase letters from the
  -- confusable-free alphabet A–Z minus I, O, L. No dash, no course prefix.
  -- Loop on the rare global collision (login_code / synthetic email / roster).
  LOOP
    v_roster_code := (
      SELECT string_agg(ch, '')
        FROM (
          SELECT ch
            FROM regexp_split_to_table('ABCDEFGHJKMNPQRSTUVWXYZ', '') AS ch
           ORDER BY random()
           LIMIT 6
        ) t
    );
    v_email := lower(v_roster_code) || '@students.local';
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.login_code = v_roster_code)
          AND NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.email = v_email)
          AND NOT EXISTS (SELECT 1 FROM public.course_memberships cmx
                           WHERE cmx.course_id = p_course_id AND cmx.roster_code = v_roster_code);
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
$function$;
