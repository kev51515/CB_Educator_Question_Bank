-- =============================================================================
-- Migration: 0243_guardian_crud.sql
-- Description: Complete educator CRUD over a student's guardians. We already had
--   create_guardian_for_student (0155), link_guardian_to_student (0241),
--   list_guardians_for_student (0155), unlink_guardian (0155). This adds the
--   missing UPDATE + full-DELETE:
--
--     • update_guardian(guardian, display_name)        — rename
--     • reset_guardian_password(guardian, password)    — issue a new password
--     • delete_guardian(guardian)                      — delete the ACCOUNT
--
--   Gate (mirrors 0155/0241): caller must teach a course that one of the
--   guardian's students is in, or be admin. delete_guardian is stricter — a
--   teacher may only delete a guardian whose students are ALL in the caller's
--   courses (so you can't nuke a parent who also follows another teacher's
--   student); admins always may. The existing 0050 BEFORE-DELETE trigger on
--   profiles still snapshots + audits the cascade.
--
--   Passwords are never written to audit_events. crypt()/gen_salt() need the
--   extensions schema on the search_path (as in 0155).
--
-- Forward-only. Idempotent (CREATE OR REPLACE). Numbered 0243.
-- =============================================================================

-- Helper predicate inlined in each fn: does the caller teach ANY student this
-- guardian covers (or is admin)? Kept inline (no shared helper) to match the
-- 0155/0241 style.

-- ─────────────────────────────────────────────────────────────────────────────
-- update_guardian — rename a guardian.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_guardian(
  p_guardian_id  uuid,
  p_display_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_name   text := btrim(coalesce(p_display_name, ''));
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_guardian_id AND role = 'guardian') THEN
    RAISE EXCEPTION 'guardian_not_found';
  END IF;
  IF NOT (public.is_admin(v_caller) OR EXISTS (
            SELECT 1
              FROM public.guardian_students gs
              JOIN public.course_memberships cm ON cm.student_id = gs.student_id
              JOIN public.courses c ON c.id = cm.course_id
             WHERE gs.guardian_id = p_guardian_id
               AND c.teacher_id   = v_caller
          )) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF v_name = '' THEN RAISE EXCEPTION 'invalid_name'; END IF;

  UPDATE public.profiles
     SET display_name = v_name, updated_at = now()
   WHERE id = p_guardian_id;

  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (v_caller, 'guardian.update', 'profile', p_guardian_id::text,
          jsonb_build_object('display_name', v_name));
END;
$$;
REVOKE ALL ON FUNCTION public.update_guardian(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_guardian(uuid, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- reset_guardian_password — issue a new password for the parent.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reset_guardian_password(
  p_guardian_id uuid,
  p_password    text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_guardian_id AND role = 'guardian') THEN
    RAISE EXCEPTION 'guardian_not_found';
  END IF;
  IF NOT (public.is_admin(v_caller) OR EXISTS (
            SELECT 1
              FROM public.guardian_students gs
              JOIN public.course_memberships cm ON cm.student_id = gs.student_id
              JOIN public.courses c ON c.id = cm.course_id
             WHERE gs.guardian_id = p_guardian_id
               AND c.teacher_id   = v_caller
          )) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF length(coalesce(p_password, '')) < 6 THEN RAISE EXCEPTION 'weak_password'; END IF;

  UPDATE auth.users
     SET encrypted_password = crypt(p_password, gen_salt('bf')),
         updated_at         = now()
   WHERE id = p_guardian_id;

  -- NOTE: never log the password.
  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (v_caller, 'guardian.reset_password', 'profile', p_guardian_id::text, '{}'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.reset_guardian_password(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_guardian_password(uuid, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- delete_guardian — delete the guardian ACCOUNT (cascades the links + profile).
--   Teacher may delete only when EVERY student the guardian covers is in one of
--   the caller's courses (no cross-teacher students); admin always.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_guardian(p_guardian_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller    uuid := (SELECT auth.uid());
  v_is_admin  boolean;
  v_covers_mine boolean;
  v_has_foreign boolean;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_guardian_id AND role = 'guardian') THEN
    RAISE EXCEPTION 'guardian_not_found';
  END IF;

  v_is_admin := public.is_admin(v_caller);

  -- Does the guardian cover at least one student the caller teaches?
  SELECT EXISTS (
    SELECT 1
      FROM public.guardian_students gs
      JOIN public.course_memberships cm ON cm.student_id = gs.student_id
      JOIN public.courses c ON c.id = cm.course_id
     WHERE gs.guardian_id = p_guardian_id AND c.teacher_id = v_caller
  ) INTO v_covers_mine;

  -- Does the guardian cover any student NOT in one of the caller's courses?
  SELECT EXISTS (
    SELECT 1
      FROM public.guardian_students gs
     WHERE gs.guardian_id = p_guardian_id
       AND NOT EXISTS (
         SELECT 1
           FROM public.course_memberships cm
           JOIN public.courses c ON c.id = cm.course_id
          WHERE cm.student_id = gs.student_id AND c.teacher_id = v_caller
       )
  ) INTO v_has_foreign;

  IF NOT (v_is_admin OR (v_covers_mine AND NOT v_has_foreign)) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  -- Deleting the auth user cascades to profiles (which fires the 0050
  -- BEFORE-DELETE audit/snapshot trigger) and to guardian_students.
  DELETE FROM auth.users WHERE id = p_guardian_id;

  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (v_caller, 'guardian.delete', 'profile', p_guardian_id::text, '{}'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.delete_guardian(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_guardian(uuid) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0243_guardian_crud.sql
-- =============================================================================
