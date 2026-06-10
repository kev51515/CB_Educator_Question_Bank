-- =============================================================================
-- Migration: 0163_fix_line_nonce_search_path.sql
-- Hotfix to 0153's create_line_link_nonce: it used encode(gen_random_bytes(16),
-- 'hex') but its search_path was `public, auth` — on Supabase, pgcrypto's
-- gen_random_bytes lives in the `extensions` schema, so the call failed at
-- runtime with "function gen_random_bytes(integer) does not exist" (the LINE
-- link page showed this). Add `extensions` to the search_path (same as 0067).
-- CREATE OR REPLACE, signature/grants unchanged, idempotent. Forward-only.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_line_link_nonce()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_uid   uuid := (SELECT auth.uid());
  v_nonce text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  v_nonce := encode(gen_random_bytes(16), 'hex');
  INSERT INTO public.line_link_nonces (nonce, profile_id, expires_at)
  VALUES (v_nonce, v_uid, now() + interval '10 minutes');
  RETURN v_nonce;
END
$$;
REVOKE ALL ON FUNCTION public.create_line_link_nonce() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_line_link_nonce() TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0163_fix_line_nonce_search_path.sql
-- =============================================================================
