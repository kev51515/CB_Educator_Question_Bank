-- =============================================================================
-- 0199_trash_user_null_name_fix.sql
--
-- Hotfix to 0198's trash_user / restore_user: both used
--   SELECT display_name INTO v_name ...; IF v_name IS NULL THEN user_not_found
-- as the existence check — but display_name is NULLABLE, so any user without
-- a display name (fresh sign-ups, code-provisioned students) was wrongly
-- rejected with user_not_found. Caught by the post-0198 verification probe.
--
-- Lesson (mirrors 0091): never use a nullable column as an existence proxy —
-- check FOUND (or row count) instead.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.trash_user(p_user_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_name   text;
  v_exists boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_user_id' USING ERRCODE = '22023';
  END IF;
  IF p_user_id = v_uid THEN
    RAISE EXCEPTION 'cannot_delete_self' USING ERRCODE = '22023';
  END IF;

  SELECT true, display_name INTO v_exists, v_name
    FROM public.profiles WHERE id = p_user_id;
  IF v_exists IS NOT TRUE THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
     SET deleted_at = now(), deleted_by = v_uid
   WHERE id = p_user_id
     AND deleted_at IS NULL;

  IF FOUND THEN
    UPDATE auth.users
       SET banned_until = now() + interval '100 years'
     WHERE id = p_user_id;

    PERFORM public.audit_record(
      'user.trash', 'profile', p_user_id::text,
      jsonb_build_object('display_name', v_name, 'purge_after_days', 90)
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_user(p_user_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_name   text;
  v_exists boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT true, display_name INTO v_exists, v_name
    FROM public.profiles WHERE id = p_user_id;
  IF v_exists IS NOT TRUE THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
     SET deleted_at = NULL, deleted_by = NULL
   WHERE id = p_user_id
     AND deleted_at IS NOT NULL;

  IF FOUND THEN
    UPDATE auth.users SET banned_until = NULL WHERE id = p_user_id;
    PERFORM public.audit_record(
      'user.restore', 'profile', p_user_id::text,
      jsonb_build_object('display_name', v_name)
    );
  END IF;
END;
$$;

-- =============================================================================
-- END 0199
-- =============================================================================
