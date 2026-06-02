-- =============================================================================
-- Migration: 0010_cross_staff_writes.sql
-- Description: Cross-staff write parity.
--
--   With migration 0009, all staff (teachers + admins) can READ everything.
--   This migration grants all staff WRITE access to each other's classes,
--   assignments, and memberships.
--
--   Combined effect: a teacher functions as a co-admin on the entire LMS —
--   appropriate for the current two-operator deployment where a husband-wife
--   team runs all day-to-day operations together.
--
--   Reverse by swapping `is_staff` back to the original ownership-OR-admin
--   checks (teacher_id = auth.uid() OR is_admin(auth.uid()) style) in each
--   policy and restoring the is_teacher_of_class guard in the RPC.
--
-- Platform: Supabase (PostgreSQL 15+)
-- Note: Supabase wraps each migration in a transaction automatically.
--
-- WHAT THIS MIGRATION TOUCHES:
--   1. classes UPDATE + DELETE  (was: owning-teacher-or-admin, now: is_staff)
--   2. class_memberships INSERT + DELETE  (was: is_teacher_of_class-or-admin,
--      now: is_staff, consolidating the three INSERT/DELETE policies into two)
--   3. assignments UPDATE + DELETE  (was: is_teacher_of_class-or-admin,
--      now: is_staff)
--   4. assignment_attempts DELETE  (was: is_teacher_of_class-or-admin,
--      now: is_staff)
--   5. regenerate_class_join_code RPC  (was: is_teacher_of_class-or-is_admin,
--      now: is_staff)
--
-- WHAT THIS MIGRATION DOES NOT TOUCH:
--   - INSERT policies that anchor created_by/teacher_id to auth.uid() —
--     attribution integrity is preserved.
--   - Student-scoped policies (starts own, updates own, leaves class) —
--     students are unaffected.
--   - SELECT policies — already is_staff from 0009.
--   - bootstrap_first_admin — still admin-specific by design.
--   - Role enum, profile schema, or any data rows.
-- =============================================================================


-- =============================================================================
-- SECTION 1: classes — UPDATE and DELETE
-- =============================================================================

-- ---- UPDATE ----

DROP POLICY IF EXISTS "classes: owning teacher or admin updates" ON public.classes;
DROP POLICY IF EXISTS "classes: staff updates" ON public.classes;
CREATE POLICY "classes: staff updates"
  ON public.classes
  FOR UPDATE
  USING (
    -- Why: any staff member may edit any class — the husband-wife team needs
    -- to manage each other's classes without friction. is_staff is evaluated
    -- once per statement via the (SELECT …) sub-select.
    public.is_staff((SELECT auth.uid()))
  )
  WITH CHECK (
    -- Why: post-update guard ensures the row still satisfies staff ownership
    -- and, critically, that teacher_id remains non-null and references a valid
    -- profile (the FK enforces the reference; the IS NOT NULL guard makes the
    -- intent explicit and prevents accidentally nulling the column).
    public.is_staff((SELECT auth.uid()))
    AND teacher_id IS NOT NULL
  );

-- ---- DELETE ----

DROP POLICY IF EXISTS "classes: owning teacher or admin deletes" ON public.classes;
DROP POLICY IF EXISTS "classes: staff deletes" ON public.classes;
CREATE POLICY "classes: staff deletes"
  ON public.classes
  FOR DELETE
  USING (
    -- Why: any staff member may delete any class — mirrors the UPDATE relaxation
    -- above so the two operations stay in sync.
    public.is_staff((SELECT auth.uid()))
  );


-- =============================================================================
-- SECTION 2: class_memberships — INSERT and DELETE
--
-- 0001 had three INSERT policies for memberships:
--   "memberships: student self-enrolls"   (unchanged — student-scoped)
--   "memberships: teacher enrolls student" (was is_teacher_of_class)
--   "memberships: admin enrolls anyone"    (was is_admin)
--
-- We collapse the latter two into a single "staff enrolls anyone" policy and
-- do the same for the DELETE side.
-- =============================================================================

-- ---- INSERT ----

-- Drop both old teacher + admin INSERT policies; replace with one staff policy.
DROP POLICY IF EXISTS "memberships: teacher enrolls student" ON public.class_memberships;
DROP POLICY IF EXISTS "memberships: admin enrolls anyone"    ON public.class_memberships;
DROP POLICY IF EXISTS "memberships: staff enrolls anyone"    ON public.class_memberships;
CREATE POLICY "memberships: staff enrolls anyone"
  ON public.class_memberships
  FOR INSERT
  WITH CHECK (
    -- Why: any staff member (teacher or admin) may add a student to any class.
    -- The previous policy restricted the teacher to is_teacher_of_class; that
    -- was the only ownership guard — students still self-enroll via the
    -- separate "memberships: student self-enrolls" policy which remains untouched.
    public.is_staff((SELECT auth.uid()))
  );

-- ---- DELETE ----

DROP POLICY IF EXISTS "memberships: teacher removes student" ON public.class_memberships;
DROP POLICY IF EXISTS "memberships: admin removes anyone"    ON public.class_memberships;
DROP POLICY IF EXISTS "memberships: staff removes anyone"    ON public.class_memberships;
CREATE POLICY "memberships: staff removes anyone"
  ON public.class_memberships
  FOR DELETE
  USING (
    -- Why: mirrors the INSERT relaxation — any staff member may unenroll a
    -- student from any class. Students may still leave classes themselves via
    -- "memberships: student leaves class" which is untouched.
    public.is_staff((SELECT auth.uid()))
  );


-- =============================================================================
-- SECTION 3: assignments — UPDATE and DELETE
-- =============================================================================

-- ---- UPDATE ----

DROP POLICY IF EXISTS "assignments: teacher of class updates" ON public.assignments;
DROP POLICY IF EXISTS "assignments: staff updates"            ON public.assignments;
CREATE POLICY "assignments: staff updates"
  ON public.assignments
  FOR UPDATE
  USING (
    -- Why: any staff member may edit any assignment. Previously only the
    -- teacher who owns the parent class (or an admin) could do so; the
    -- co-operator model requires both teachers to have full edit access.
    public.is_staff((SELECT auth.uid()))
  )
  WITH CHECK (
    -- Why: post-update guard prevents an assignment from being silently moved
    -- to a class the staff member cannot see. is_staff covers both operators
    -- equally; we do NOT re-check class ownership because the co-operator
    -- model grants symmetric access across all classes.
    public.is_staff((SELECT auth.uid()))
  );

-- ---- DELETE ----

DROP POLICY IF EXISTS "assignments: teacher of class deletes" ON public.assignments;
DROP POLICY IF EXISTS "assignments: staff deletes"            ON public.assignments;
CREATE POLICY "assignments: staff deletes"
  ON public.assignments
  FOR DELETE
  USING (
    -- Why: mirrors the UPDATE relaxation — hard-delete access follows the same
    -- staff gate so the two operations stay in sync and neither operator is
    -- blocked from cleaning up the other's assignments.
    public.is_staff((SELECT auth.uid()))
  );


-- =============================================================================
-- SECTION 4: assignment_attempts — DELETE
-- =============================================================================

DROP POLICY IF EXISTS "attempts: teacher of class deletes" ON public.assignment_attempts;
DROP POLICY IF EXISTS "attempts: staff deletes"            ON public.assignment_attempts;
CREATE POLICY "attempts: staff deletes"
  ON public.assignment_attempts
  FOR DELETE
  USING (
    -- Why: any staff member may delete an attempt for cleanup (e.g., a student
    -- got confused and started a duplicate, or needs a reset). Previously this
    -- required being the teacher of the specific class; the co-operator model
    -- removes that restriction. Students are still NOT granted delete access —
    -- submitted attempts are grading records.
    public.is_staff((SELECT auth.uid()))
  );


-- =============================================================================
-- SECTION 5: regenerate_class_join_code RPC — swap authorization guard
--
-- Body is identical to the 0007 definition; only the IF NOT (...) guard
-- changes from is_teacher_of_class + is_admin to is_staff.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.regenerate_class_join_code(p_class_id uuid)
  RETURNS TABLE (
    id          uuid,
    teacher_id  uuid,
    name        text,
    description text,
    join_code   text,
    archived    boolean,
    created_at  timestamptz,
    updated_at  timestamptz
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller    uuid := auth.uid();
  -- Why this alphabet: visually unambiguous characters only. O/0, I/1, and L
  -- are dropped so dictating a code over the phone is robust.
  v_alphabet  constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_alpha_len constant integer := length(v_alphabet);
  v_new_code  text;
  v_attempt   integer := 0;
  v_max       constant integer := 5;
  v_inserted  boolean := false;
  v_i         integer;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING HINT = 'You must be signed in.';
  END IF;

  -- Why: was is_teacher_of_class(v_caller, p_class_id) OR is_admin(v_caller).
  -- Now: is_staff(v_caller) — any staff member may regenerate the join code
  -- for any class, matching the co-operator model established in 0009/0010.
  IF NOT public.is_staff(v_caller) THEN
    RAISE EXCEPTION 'not_authorized'
      USING HINT = 'Only staff can regenerate the join code.';
  END IF;

  WHILE v_attempt < v_max AND NOT v_inserted LOOP
    v_attempt := v_attempt + 1;

    -- Build "XXXX-XXXX" using random sampling from the legible alphabet.
    -- random() returns [0,1); floor * len yields an unbiased index in
    -- [0, v_alpha_len). The first/second halves are joined with a dash so
    -- the code matches the format teachers already see in the UI.
    v_new_code := '';
    FOR v_i IN 1..4 LOOP
      v_new_code := v_new_code
        || substr(v_alphabet, floor(random() * v_alpha_len)::int + 1, 1);
    END LOOP;
    v_new_code := v_new_code || '-';
    FOR v_i IN 1..4 LOOP
      v_new_code := v_new_code
        || substr(v_alphabet, floor(random() * v_alpha_len)::int + 1, 1);
    END LOOP;

    BEGIN
      UPDATE public.classes
         SET join_code = v_new_code
       WHERE classes.id = p_class_id;
      v_inserted := true;
    EXCEPTION
      WHEN unique_violation THEN
        -- Collision: try again with a fresh code on the next loop iteration.
        v_inserted := false;
    END;
  END LOOP;

  IF NOT v_inserted THEN
    RAISE EXCEPTION 'join_code_collision'
      USING HINT = 'Could not generate a unique join code after several attempts.';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.teacher_id,
    c.name,
    c.description,
    c.join_code,
    c.archived,
    c.created_at,
    c.updated_at
  FROM public.classes c
  WHERE c.id = p_class_id;
END;
$$;

-- Preserve the same grant surface as 0007.
REVOKE ALL ON FUNCTION public.regenerate_class_join_code(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.regenerate_class_join_code(uuid) TO authenticated;


-- =============================================================================
-- END OF MIGRATION 0010_cross_staff_writes.sql
-- =============================================================================
