-- =============================================================================
-- Migration: 0129_admin_create_educator.sql
-- Description: Admin-provisioning primitive for educators — "educator from
--              admin". With public email signup disabled (invitation-only),
--              educators no longer self-register; an admin creates their account
--              here. Mirrors admin_create_student (0085) — a direct auth.users +
--              auth.identities insert with a bcrypt password — but for a real
--              email, role 'teacher', and no course/roster scaffolding.
--
-- ADMIN-ONLY (is_admin). The handle_new_auth_user trigger (0001) creates the
-- profile from raw_user_meta_data (role 'teacher'); we then set name/email and
-- mark it non-managed. `provisioned: true` is stamped in metadata so any future
-- invite-gate trigger treats this as a sanctioned creation.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_create_educator(
  p_email        text,
  p_display_name text,
  p_password     text
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth, extensions
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_email  text := lower(trim(coalesce(p_email, '')));
  v_name   text := trim(coalesce(p_display_name, ''));
  v_uid    uuid := gen_random_uuid();
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_admin(v_caller) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF v_email = '' OR position('@' in v_email) = 0 THEN RAISE EXCEPTION 'invalid_email'; END IF;
  IF v_name = '' THEN RAISE EXCEPTION 'invalid_name'; END IF;
  IF length(coalesce(p_password, '')) < 6 THEN RAISE EXCEPTION 'weak_password'; END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_email) THEN RAISE EXCEPTION 'email_taken'; END IF;

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
    jsonb_build_object('display_name', v_name, 'role', 'teacher', 'provisioned', true),
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

  -- handle_new_auth_user already inserted the profile (role 'teacher' from
  -- metadata); set the canonical fields + mark non-managed.
  UPDATE public.profiles
     SET display_name = v_name,
         email        = v_email,
         role         = 'teacher',
         managed      = false,
         updated_at   = now()
   WHERE id = v_uid;

  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (v_caller, 'educator.create', 'profile', v_uid::text, jsonb_build_object('email', v_email));

  RETURN v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_educator(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_educator(text, text, text) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0129_admin_create_educator.sql
-- =============================================================================
