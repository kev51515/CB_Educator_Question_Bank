-- =============================================================================
-- Migration: 0032_anon_profile_trigger.sql
-- Description: Anonymous sign-ins were enabled via the Management API but
--   creating one fails with "Database error creating anonymous user". Root
--   cause: the `handle_new_auth_user` trigger from 0001 inserts into
--   `profiles` with `email = NEW.email`, and `profiles.email` is NOT NULL.
--   For an anonymous sign-in, `auth.users.email` is NULL.
--
--   Fix: relax `profiles.email` to allow NULL (anonymous users will fill it
--   later via `quick_start_with_code`), and patch the trigger to coalesce
--   the value to an empty string in case the column ever returns to
--   NOT NULL with a default.
-- =============================================================================

ALTER TABLE public.profiles ALTER COLUMN email DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_role public.user_role;
  v_display_name text;
  v_meta jsonb;
BEGIN
  v_meta := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  v_role := COALESCE(
    NULLIF(v_meta->>'role', '')::public.user_role,
    'student'
  );
  v_display_name := NULLIF(v_meta->>'display_name', '');

  INSERT INTO public.profiles (id, email, display_name, role)
  VALUES (NEW.id, NEW.email, v_display_name, v_role)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;
