-- =============================================================================
-- Migration: 0028_helper_cleanup.sql
-- Description: Two corrections discovered during Wave 6.
--   (1) Migration 0022's audit_course_delete trigger function uses plain
--       LANGUAGE plpgsql (no SECURITY DEFINER). audit_events RLS denies INSERT
--       to end-user roles — so a teacher deleting a course will silently
--       fail the INSERT (the DELETE itself proceeds; the audit row is lost).
--       Wave 6C caught the same latent bug while writing assignment.delete
--       and material.delete triggers and applied SECURITY DEFINER. Apply
--       the same fix to the original.
--   (2) Migration 0012's rename swept tables/columns but NOT the helper
--       function `is_student_in_class(uid, course_id)`. The function lives
--       and works, but the name lies. Add a thin alias
--       `is_student_in_course(uid, course_id)` so future migrations using
--       Course terminology don't have to remember the historical name.
-- =============================================================================

-- ---- 1. Fix audit_course_delete ------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_course_delete() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (auth.uid(), 'course.delete', 'course', OLD.id::text,
          jsonb_build_object('name', OLD.name, 'teacher_id', OLD.teacher_id));
  RETURN OLD;
END;
$$;

-- Also patch the role-change + invite-mint triggers from 0022 with the same
-- fix to keep them future-proof against any RLS tightening on audit_events.
CREATE OR REPLACE FUNCTION public.audit_profile_role_change() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
    VALUES (auth.uid(), 'role.change', 'profile', NEW.id::text,
            jsonb_build_object('from', OLD.role, 'to', NEW.role, 'email', NEW.email));
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_invite_mint() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (auth.uid(), 'invite.mint', 'invite_code', NEW.code,
          jsonb_build_object('note', NEW.note, 'max_uses', NEW.max_uses, 'expires_at', NEW.expires_at));
  RETURN NEW;
END;
$$;

-- ---- 2. Add is_student_in_course alias ------------------------------------
-- This is a thin wrapper; future migrations may call either name.
CREATE OR REPLACE FUNCTION public.is_student_in_course(uid uuid, p_course_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT public.is_student_in_class(uid, p_course_id);
$$;
REVOKE ALL ON FUNCTION public.is_student_in_course(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_student_in_course(uuid, uuid) TO authenticated, anon;
