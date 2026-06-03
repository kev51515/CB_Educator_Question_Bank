-- =============================================================================
-- 0093: A student may not change their own display_name
-- =============================================================================
-- DECISION (2026-06-03): a student's name is owned by their teacher (set on the
-- roster), not by the student. This prevents misuse of the field — students
-- renaming themselves to impersonate others or to surface inappropriate names
-- on discussions / the gradebook. AccountSettings already hides the editor for
-- students (the UI half), but the "profiles: own row update" RLS policy still
-- technically permits a student to PATCH their own display_name directly. This
-- migration closes that gap server-side (defense in depth).
--
-- MECHANISM: a BEFORE UPDATE trigger on profiles. RLS WITH CHECK can't compare
-- OLD vs NEW, so a trigger is the right tool. We block the write only when:
--   • the row's role is 'student', AND
--   • display_name actually changed, AND
--   • the actor is the student editing their OWN row (auth.uid() = OLD.id).
-- A teacher / admin editing a student's name (auth.uid() <> OLD.id) is
-- untouched, as is a student editing any other field (theme, etc.). Service-
-- role / SECURITY DEFINER paths run with auth.uid() = NULL and are exempt, so
-- RPCs and seeds keep working.
--
-- ERRCODE 'P0001' with a stable hint string the client can recognize.
-- Forward-only. No data change.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.guard_student_self_rename()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
BEGIN
  IF OLD.role = 'student'
     AND NEW.display_name IS DISTINCT FROM OLD.display_name
     AND auth.uid() IS NOT NULL
     AND auth.uid() = OLD.id
  THEN
    RAISE EXCEPTION 'student_name_locked'
      USING HINT = 'A student''s name is set by their teacher.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_student_self_rename() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_guard_student_self_rename ON public.profiles;
CREATE TRIGGER trg_guard_student_self_rename
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_student_self_rename();
