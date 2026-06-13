-- =============================================================================
-- Migration: 0241_link_guardian_sibling.sql
-- Description: Let ONE parent/guardian cover MULTIPLE students without minting a
--   duplicate account. The data model already supports it — guardian_students
--   (0153) is a composite-PK many-to-many — but the only provisioning path
--   (create_guardian_for_student, 0155) always creates a NEW guardian (new
--   login code + LINE link). So a parent of two kids became two accounts.
--
--   Two RPCs:
--     • link_guardian_to_student(p_login_code, p_student_id) — attach an
--       EXISTING guardian (found by their login code) to another student.
--       Idempotent (ON CONFLICT DO NOTHING); returns the guardian + whether it
--       was already linked.
--     • guardian_other_students(p_guardian_id, p_student_id) — the OTHER
--       students this guardian covers that the CALLER can see (teaches/admin),
--       so the teacher UI can show "also follows: …".
--
--   Both teacher-gated exactly like 0155 (is_staff + teaches a course the
--   student is in, or admin). Stable string error codes.
--
-- Forward-only. Idempotent (CREATE OR REPLACE). Numbered 0241 (0240 taken).
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- link_guardian_to_student — attach an existing guardian to another student
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

  -- Caller must teach a course this student is in (or be admin) — same gate as
  -- create_guardian_for_student (0155).
  IF NOT (public.is_admin(v_caller) OR EXISTS (
            SELECT 1
              FROM public.course_memberships cm
              JOIN public.courses c ON c.id = cm.course_id
             WHERE cm.student_id = p_student_id
               AND c.teacher_id  = v_caller
          )) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  -- Resolve the existing guardian by login code.
  SELECT p.id, p.display_name, p.login_code
    INTO v_gid, v_gname, v_gcode
    FROM public.profiles p
   WHERE upper(p.login_code) = v_code
     AND p.role = 'guardian'
   LIMIT 1;
  IF v_gid IS NULL THEN
    RAISE EXCEPTION 'guardian_not_found';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.guardian_students
     WHERE guardian_id = v_gid AND student_id = p_student_id
  ) INTO v_exists;

  IF NOT v_exists THEN
    INSERT INTO public.guardian_students (guardian_id, student_id, created_by)
    VALUES (v_gid, p_student_id, v_caller)
    ON CONFLICT (guardian_id, student_id) DO NOTHING;

    INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
    VALUES (
      v_caller, 'guardian.link', 'profile', p_student_id,
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

-- ─────────────────────────────────────────────────────────────────────────────
-- guardian_other_students — the other students a guardian covers (caller-visible)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guardian_other_students(
  p_guardian_id uuid,
  p_student_id  uuid
)
RETURNS TABLE (
  student_id   uuid,
  display_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT public.is_staff(v_caller) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT p.id, p.display_name
    FROM public.guardian_students gs
    JOIN public.profiles p ON p.id = gs.student_id
   WHERE gs.guardian_id = p_guardian_id
     AND gs.student_id <> p_student_id
     AND (
       public.is_admin(v_caller) OR EXISTS (
         SELECT 1
           FROM public.course_memberships cm
           JOIN public.courses c ON c.id = cm.course_id
          WHERE cm.student_id = gs.student_id
            AND c.teacher_id  = v_caller
       )
     )
   ORDER BY p.display_name;
END;
$$;
REVOKE ALL ON FUNCTION public.guardian_other_students(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guardian_other_students(uuid, uuid) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0241_link_guardian_sibling.sql
-- =============================================================================
