-- =============================================================================
-- Migration: 0130_course_sharing.sql
-- Description: Course sharing (co-management) + scope course visibility so each
--              educator sees only courses they OWN or that another educator has
--              SHARED with them. Admins still see/manage everything.
--
-- WHY: until now every staff member saw and could edit EVERY course (the 0012
-- "courses: staff reads all" SELECT + "staff updates/deletes" + the 0010
-- cross-staff write parity). For a growing roster of educators that's wrong —
-- an educator should only see their own courses plus ones explicitly shared
-- with them.
--
-- DESIGN (minimal-ripple, by intent):
--   1. A `course_shares(course_id, recipient_id)` grant table.
--   2. Extend the existing SECURITY DEFINER helper `is_teacher_of_course` to
--      return true for a share recipient as well as the owner. Because nearly
--      every course-scoped RLS policy + RPC already routes through this helper
--      (assignments, attempts, modules, module_items, roster, announcements,
--      notes, portfolio import via the 0068 shim, the test RPCs 0089/0090/0091,
--      etc.), co-management "just works" for a shared course with no further
--      policy edits. THIS is the whole reason the change stays small.
--   3. Tighten the COURSES table SELECT/UPDATE/DELETE + COURSE_MEMBERSHIPS
--      write policies from `is_staff` (any staff) to owner-or-shared / admin.
--      The courses-table SELECT is the UI chokepoint: a course a teacher can't
--      SELECT can't be opened, so its assignments/modules/materials tabs never
--      render even though those downstream tables still carry their pre-existing
--      "staff reads all" policies.
--
-- DELIBERATELY NOT TIGHTENED HERE (separate hardening pass, documented):
--   - Downstream content tables (assignments, course_modules, module_items,
--     course_materials, discussions, announcements) keep their `is_staff`
--     "reads all" policies. course_materials in particular uses `is_staff` as
--     its ONLY teacher-read path (no teacher-of-course policy), so flipping it
--     blindly would break a teacher reading their OWN materials. They're
--     reachable only through a now-scoped course, so the UI is gated regardless.
--   - The 0067 managed-student RPCs (`is_staff` gated, SECURITY DEFINER) and
--     other staff-wide RPCs are out of scope.
--
-- Co-management grants the recipient full CONTENT control (modules, assignments,
-- grades, roster, announcements) but NOT destruction of the course container:
-- DELETE stays owner-or-admin only, and only the OWNER (or an admin) may grant
-- or revoke shares (no re-sharing chains).
--
-- Forward-only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 1: course_shares grant table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.course_shares (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id    uuid NOT NULL REFERENCES public.courses(id)  ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shared_by    uuid          REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, recipient_id)
);

CREATE INDEX IF NOT EXISTS course_shares_recipient_idx ON public.course_shares (recipient_id);
CREATE INDEX IF NOT EXISTS course_shares_course_idx    ON public.course_shares (course_id);

ALTER TABLE public.course_shares ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- STEP 2: extend is_teacher_of_course to include share recipients
-- SECURITY DEFINER → both lookups bypass RLS, so no recursion when this helper
-- is itself used inside courses / course_shares policies.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_teacher_of_course(uid uuid, p_course_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.courses
    WHERE id         = p_course_id
      AND teacher_id = uid
  )
  OR EXISTS (
    SELECT 1
    FROM public.course_shares
    WHERE course_id    = p_course_id
      AND recipient_id = uid
  );
$$;

-- -----------------------------------------------------------------------------
-- STEP 3: course_shares RLS — owner/co-teacher of the course (or admin) may
-- read the share list. All writes go through the SECURITY DEFINER RPCs below,
-- so there is intentionally NO user-facing INSERT/UPDATE/DELETE policy.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "course_shares: course teacher or admin reads" ON public.course_shares;
CREATE POLICY "course_shares: course teacher or admin reads"
  ON public.course_shares
  FOR SELECT
  USING (
    public.is_teacher_of_course((SELECT auth.uid()), course_id)
    OR public.is_admin((SELECT auth.uid()))
  );

-- -----------------------------------------------------------------------------
-- STEP 4: scope the COURSES table policies
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "courses: staff reads all" ON public.courses;
DROP POLICY IF EXISTS "courses: teacher sees own" ON public.courses;
DROP POLICY IF EXISTS "courses: staff updates"   ON public.courses;
DROP POLICY IF EXISTS "courses: staff deletes"   ON public.courses;

-- SELECT: teacher sees courses they own OR that were shared with them.
CREATE POLICY "courses: teacher sees own or shared"
  ON public.courses
  FOR SELECT
  USING (
    public.is_teacher_of_course((SELECT auth.uid()), id)
  );

-- SELECT: admin sees everything (replaces the old is_staff-wide read).
CREATE POLICY "courses: admin reads all"
  ON public.courses
  FOR SELECT
  USING (
    public.is_admin((SELECT auth.uid()))
  );

-- UPDATE: owner, a share recipient (co-manage), or an admin may edit settings.
CREATE POLICY "courses: teacher or admin updates"
  ON public.courses
  FOR UPDATE
  USING (
    public.is_teacher_of_course((SELECT auth.uid()), id)
    OR public.is_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    (
      public.is_teacher_of_course((SELECT auth.uid()), id)
      OR public.is_admin((SELECT auth.uid()))
    )
    AND teacher_id IS NOT NULL
  );

-- DELETE: destroying the course container stays OWNER-or-admin only. A shared
-- co-teacher must not be able to delete a course they don't own.
CREATE POLICY "courses: owner or admin deletes"
  ON public.courses
  FOR DELETE
  USING (
    teacher_id = (SELECT auth.uid())
    OR public.is_admin((SELECT auth.uid()))
  );

-- (Unchanged: "courses: student sees enrolled", "courses: teacher or admin
--  creates" from 0013.)

-- -----------------------------------------------------------------------------
-- STEP 5: scope COURSE_MEMBERSHIPS writes to owner-or-shared / admin
-- "memberships: teacher sees class roster" (is_teacher_of_course) already
-- extends to share recipients; we only need to replace the is_staff-wide ones.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "memberships: staff reads all"     ON public.course_memberships;
DROP POLICY IF EXISTS "memberships: staff enrolls anyone" ON public.course_memberships;
DROP POLICY IF EXISTS "memberships: staff removes anyone"  ON public.course_memberships;

CREATE POLICY "memberships: admin reads all"
  ON public.course_memberships
  FOR SELECT
  USING (
    public.is_admin((SELECT auth.uid()))
  );

CREATE POLICY "memberships: teacher of course or admin enrolls"
  ON public.course_memberships
  FOR INSERT
  WITH CHECK (
    public.is_teacher_of_course((SELECT auth.uid()), course_id)
    OR public.is_admin((SELECT auth.uid()))
  );

CREATE POLICY "memberships: teacher of course or admin removes"
  ON public.course_memberships
  FOR DELETE
  USING (
    public.is_teacher_of_course((SELECT auth.uid()), course_id)
    OR public.is_admin((SELECT auth.uid()))
  );

-- -----------------------------------------------------------------------------
-- STEP 6: share / unshare RPCs (stable string error codes the client switches
-- on, per the project's RPC convention).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.share_course(
  p_course_id   uuid,
  p_recipient_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller         uuid := (SELECT auth.uid());
  v_owner          uuid;
  v_recipient_role text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT teacher_id INTO v_owner FROM public.courses WHERE id = p_course_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'course_not_found';
  END IF;

  -- Only the OWNER or an admin may grant access (no re-sharing by co-teachers).
  IF NOT (v_owner = v_caller OR public.is_admin(v_caller)) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_recipient_id = v_owner THEN
    RAISE EXCEPTION 'cannot_share_with_owner';
  END IF;

  SELECT role INTO v_recipient_role FROM public.profiles WHERE id = p_recipient_id;
  IF v_recipient_role IS NULL THEN
    RAISE EXCEPTION 'recipient_not_found';
  END IF;
  IF v_recipient_role NOT IN ('teacher', 'admin') THEN
    RAISE EXCEPTION 'recipient_not_educator';
  END IF;

  INSERT INTO public.course_shares (course_id, recipient_id, shared_by)
  VALUES (p_course_id, p_recipient_id, v_caller)
  ON CONFLICT (course_id, recipient_id) DO NOTHING;

  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (
    v_caller, 'course.share', 'course', p_course_id::text,
    jsonb_build_object('recipient_id', p_recipient_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.share_course(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.share_course(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.unshare_course(
  p_course_id    uuid,
  p_recipient_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_owner  uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT teacher_id INTO v_owner FROM public.courses WHERE id = p_course_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'course_not_found';
  END IF;

  -- Owner or admin may revoke; a recipient may also remove their OWN access.
  IF NOT (
    v_owner = v_caller
    OR public.is_admin(v_caller)
    OR p_recipient_id = v_caller
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  DELETE FROM public.course_shares
  WHERE course_id = p_course_id AND recipient_id = p_recipient_id;

  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (
    v_caller, 'course.unshare', 'course', p_course_id::text,
    jsonb_build_object('recipient_id', p_recipient_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.unshare_course(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unshare_course(uuid, uuid) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0130_course_sharing.sql
-- =============================================================================
