-- =============================================================================
-- 0094: Narrow the student-self-rename guard so RPCs/onboarding still work
-- =============================================================================
-- BUG in 0093 (caught by smoke-e2e "Quick-start anonymous" before it ever
-- shipped to users): the guard trigger from 0093 was SECURITY DEFINER and
-- keyed only on `auth.uid() = OLD.id`. But the legitimate onboarding RPC
-- `quick_start_with_code` (SECURITY DEFINER) sets the student's OWN name while
-- auth.uid() still equals the student's id — so the guard wrongly raised
-- `student_name_locked` and blocked a brand-new student from naming themselves.
--
-- ROOT INSIGHT: we want to block only a DIRECT end-user PostgREST write (a
-- student PATCHing their own profile.display_name), NOT a name change made by
-- a privileged SECURITY DEFINER RPC (quick_start, signup fan-out, future
-- admin tools). The two are distinguishable by `current_user`:
--   • direct authenticated/anon request  → current_user = 'authenticated' | 'anon'
--   • SECURITY DEFINER RPC (owner=postgres) → current_user = the function owner
-- A SECURITY DEFINER trigger can't see this (current_user is always the trigger
-- owner), so the guard must be SECURITY INVOKER.
--
-- Net behaviour after this migration:
--   • student edits own name via PostgREST .update()  → BLOCKED (the misuse case)
--   • teacher/admin renames a student (uid <> OLD.id)  → allowed
--   • quick_start_with_code / any SECURITY DEFINER RPC → allowed (current_user
--     is the definer, not authenticated/anon)
--   • service-role / seeds                             → allowed
--
-- Forward-only. Replaces the function body in place; the 0093 trigger keeps
-- pointing at it (same name + signature).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.guard_student_self_rename()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path = public, auth
AS $$
BEGIN
  IF OLD.role = 'student'
     AND NEW.display_name IS DISTINCT FROM OLD.display_name
     AND auth.uid() = OLD.id                       -- the student editing their OWN row
     AND current_user IN ('authenticated', 'anon') -- a direct end-user write, not an RPC/definer/service path
  THEN
    RAISE EXCEPTION 'student_name_locked'
      USING HINT = 'A student''s name is set by their teacher.';
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger functions don't strictly require EXECUTE on the firing role, but
-- grant it explicitly so a SECURITY INVOKER invocation can never trip a
-- "permission denied for function" on locked-down roles.
GRANT EXECUTE ON FUNCTION public.guard_student_self_rename() TO authenticated, anon;
