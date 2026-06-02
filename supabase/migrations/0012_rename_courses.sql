-- =============================================================================
-- Migration: 0012_rename_courses.sql
-- Description: Rename `classes` → `courses` and `class_memberships` →
--              `course_memberships`. FK column `class_id` → `course_id` on
--              course_memberships, assignments, and course_modules.
--              Helper `is_teacher_of_class` → `is_teacher_of_course`.
--              RPCs `join_class_by_code` → `join_course_by_code`,
--              `regenerate_class_join_code` → `regenerate_course_join_code`,
--              `reorder_modules` parameter `p_class_id` → `p_course_id`.
--              `admin_dashboard_stats` JSON key `'classes'` → `'courses'`.
--
-- Risk surface: table renames that break RLS, FK constraints, indexes,
--              trigger functions, and RPCs. All RLS policies that reference
--              the affected tables or helper functions are dropped first and
--              recreated after the renames so no policy is left pointing at a
--              nonexistent object name.
--
-- Platform: Supabase (PostgreSQL 15+)
-- Note: Supabase wraps each migration in a transaction automatically.
-- =============================================================================


-- =============================================================================
-- STEP 1: DROP ALL RLS POLICIES TOUCHING classes / class_memberships
--         (from migrations 0001, 0002, 0004, 0009, 0010, 0011)
-- We drop by the latest name each policy carried at the time of this migration.
-- DROP POLICY IF EXISTS is safe — a missing policy is not an error.
-- =============================================================================

-- ---- profiles ----
DROP POLICY IF EXISTS "profiles: teacher sees enrolled students"   ON public.profiles;
DROP POLICY IF EXISTS "profiles: staff reads all"                  ON public.profiles;
DROP POLICY IF EXISTS "profiles: staff updates all"               ON public.profiles;

-- ---- classes (to be renamed) ----
DROP POLICY IF EXISTS "classes: teacher sees own"                  ON public.classes;
DROP POLICY IF EXISTS "classes: student sees enrolled"             ON public.classes;
DROP POLICY IF EXISTS "classes: teacher or admin creates"          ON public.classes;
DROP POLICY IF EXISTS "classes: staff reads all"                   ON public.classes;
DROP POLICY IF EXISTS "classes: staff updates"                     ON public.classes;
DROP POLICY IF EXISTS "classes: staff deletes"                     ON public.classes;
-- Older policy names from 0001 that 0010 may not have fully purged
DROP POLICY IF EXISTS "classes: admin reads all"                   ON public.classes;
DROP POLICY IF EXISTS "classes: owning teacher or admin updates"   ON public.classes;
DROP POLICY IF EXISTS "classes: owning teacher or admin deletes"   ON public.classes;

-- ---- class_memberships (to be renamed) ----
DROP POLICY IF EXISTS "memberships: student sees own"              ON public.class_memberships;
DROP POLICY IF EXISTS "memberships: teacher sees class roster"     ON public.class_memberships;
DROP POLICY IF EXISTS "memberships: admin reads all"               ON public.class_memberships;
DROP POLICY IF EXISTS "memberships: student self-enrolls"          ON public.class_memberships;
DROP POLICY IF EXISTS "memberships: teacher enrolls student"       ON public.class_memberships;
DROP POLICY IF EXISTS "memberships: admin enrolls anyone"          ON public.class_memberships;
DROP POLICY IF EXISTS "memberships: staff enrolls anyone"          ON public.class_memberships;
DROP POLICY IF EXISTS "memberships: student leaves class"          ON public.class_memberships;
DROP POLICY IF EXISTS "memberships: teacher removes student"       ON public.class_memberships;
DROP POLICY IF EXISTS "memberships: admin removes anyone"          ON public.class_memberships;
DROP POLICY IF EXISTS "memberships: staff removes anyone"          ON public.class_memberships;

-- ---- assignments (all policies — drop everything and recreate cleanly) ----
DROP POLICY IF EXISTS "assignments: teacher of class reads"        ON public.assignments;
DROP POLICY IF EXISTS "assignments: teacher of class creates"      ON public.assignments;
DROP POLICY IF EXISTS "assignments: teacher of class inserts"      ON public.assignments;
DROP POLICY IF EXISTS "assignments: teacher of class updates"      ON public.assignments;
DROP POLICY IF EXISTS "assignments: teacher of class deletes"      ON public.assignments;
DROP POLICY IF EXISTS "assignments: enrolled student reads"        ON public.assignments;
DROP POLICY IF EXISTS "assignments: admin reads all"               ON public.assignments;
DROP POLICY IF EXISTS "assignments: staff reads all"               ON public.assignments;
DROP POLICY IF EXISTS "assignments: staff updates"                 ON public.assignments;
DROP POLICY IF EXISTS "assignments: staff deletes"                 ON public.assignments;

-- ---- assignment_attempts (drop all and recreate cleanly) ----
DROP POLICY IF EXISTS "attempts: teacher of class reads"           ON public.assignment_attempts;
DROP POLICY IF EXISTS "attempts: teacher of course reads"          ON public.assignment_attempts;
DROP POLICY IF EXISTS "attempts: student starts own"               ON public.assignment_attempts;
DROP POLICY IF EXISTS "attempts: student reads own"                ON public.assignment_attempts;
DROP POLICY IF EXISTS "attempts: student updates in-progress own"  ON public.assignment_attempts;
DROP POLICY IF EXISTS "attempts: teacher of class deletes"         ON public.assignment_attempts;
DROP POLICY IF EXISTS "attempts: staff deletes"                    ON public.assignment_attempts;
DROP POLICY IF EXISTS "attempts: staff reads all"                  ON public.assignment_attempts;

-- ---- course_modules (references is_teacher_of_class and is_student_in_class) ----
DROP POLICY IF EXISTS "course_modules: teacher of class reads"    ON public.course_modules;
DROP POLICY IF EXISTS "course_modules: enrolled student reads"    ON public.course_modules;
DROP POLICY IF EXISTS "course_modules: staff reads all"           ON public.course_modules;
DROP POLICY IF EXISTS "course_modules: staff inserts"             ON public.course_modules;
DROP POLICY IF EXISTS "course_modules: staff updates"             ON public.course_modules;
DROP POLICY IF EXISTS "course_modules: staff deletes"             ON public.course_modules;

-- ---- module_items (references is_teacher_of_class and is_student_in_class indirectly) ----
DROP POLICY IF EXISTS "module_items: teacher of class reads"      ON public.module_items;
DROP POLICY IF EXISTS "module_items: enrolled student reads"      ON public.module_items;
DROP POLICY IF EXISTS "module_items: staff reads all"             ON public.module_items;
DROP POLICY IF EXISTS "module_items: staff inserts"               ON public.module_items;
DROP POLICY IF EXISTS "module_items: staff updates"               ON public.module_items;
DROP POLICY IF EXISTS "module_items: staff deletes"               ON public.module_items;


-- =============================================================================
-- STEP 2: DROP HELPER FUNCTIONS THAT REFERENCE THE OLD TABLE / COLUMN NAMES
-- DROP FUNCTION removes the object so CREATE OR REPLACE in step 4 is a clean
-- install rather than a body-only replacement (avoids stale argument names).
-- is_student_in_class is not renamed (callers in 0011 policies still use the
-- same logic) but its body references class_memberships so it must be replaced.
-- =============================================================================

DROP FUNCTION IF EXISTS public.is_teacher_of_class(uuid, uuid);
-- Keep is_student_in_class name but replace body after table rename (step 4).


-- =============================================================================
-- STEP 3: ALTER TABLE RENAMES
-- Order matters: rename the child table (class_memberships) before the parent
-- (classes) to avoid FK name confusion, then rename columns and constraints.
-- Supabase auto-wraps in a transaction so all-or-nothing.
-- =============================================================================

-- 3a. Rename tables
ALTER TABLE public.class_memberships RENAME TO course_memberships;
ALTER TABLE public.classes            RENAME TO courses;

-- 3b. Rename the FK column class_id → course_id on course_memberships
ALTER TABLE public.course_memberships RENAME COLUMN class_id TO course_id;

-- 3c. Rename the FK column class_id → course_id on assignments
ALTER TABLE public.assignments RENAME COLUMN class_id TO course_id;

-- 3d. Rename the FK column class_id → course_id on course_modules
ALTER TABLE public.course_modules RENAME COLUMN class_id TO course_id;

-- 3e. Rename the UNIQUE constraint on course_memberships
--     Original: class_memberships_class_id_student_id_key
ALTER TABLE public.course_memberships
  RENAME CONSTRAINT class_memberships_class_id_student_id_key
               TO   course_memberships_course_id_student_id_key;

-- 3f. Rename FK constraints on course_memberships
ALTER TABLE public.course_memberships
  RENAME CONSTRAINT class_memberships_class_id_fkey
               TO   course_memberships_course_id_fkey;

ALTER TABLE public.course_memberships
  RENAME CONSTRAINT class_memberships_student_id_fkey
               TO   course_memberships_student_id_fkey;

-- 3g. Rename FK constraint on assignments
ALTER TABLE public.assignments
  RENAME CONSTRAINT assignments_class_id_fkey
               TO   assignments_course_id_fkey;

-- 3h. Rename FK constraint on course_modules
ALTER TABLE public.course_modules
  RENAME CONSTRAINT course_modules_class_id_fkey
               TO   course_modules_course_id_fkey;

-- 3i. Rename indexes on course_memberships
ALTER INDEX public.idx_class_memberships_student_id
  RENAME TO idx_course_memberships_student_id;

ALTER INDEX public.idx_class_memberships_class_id
  RENAME TO idx_course_memberships_course_id;

-- 3j. Rename index on courses (was classes)
ALTER INDEX public.idx_classes_teacher_id
  RENAME TO idx_courses_teacher_id;

-- 3k. Rename the course_modules composite index
ALTER INDEX public.idx_course_modules_class_position
  RENAME TO idx_course_modules_course_position;

-- 3l. Rename the courses updated_at trigger (cosmetic — does not affect function)
ALTER TRIGGER trg_classes_set_updated_at ON public.courses
  RENAME TO trg_courses_set_updated_at;


-- =============================================================================
-- STEP 4: RECREATE HELPER FUNCTIONS WITH UPDATED TABLE / COLUMN REFERENCES
-- =============================================================================

-- ---- is_teacher_of_course(uid, course_id) ----
-- Replaces is_teacher_of_class. Now queries public.courses.
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
  );
$$;

-- ---- is_student_in_class(uid, course_id) ----
-- Name preserved (0011 policies call it by this name); body updated to query
-- public.course_memberships with column course_id.
CREATE OR REPLACE FUNCTION public.is_student_in_class(uid uuid, p_class_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.course_memberships
    WHERE course_id  = p_class_id
      AND student_id = uid
  );
$$;


-- =============================================================================
-- STEP 5: RECREATE ALL DROPPED RLS POLICIES WITH UPDATED NAMES
-- =============================================================================

-- ---- profiles ----

CREATE POLICY "profiles: teacher sees enrolled students"
  ON public.profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.course_memberships cm
      JOIN public.courses c ON c.id = cm.course_id
      WHERE cm.student_id = profiles.id
        AND c.teacher_id  = (SELECT auth.uid())
    )
  );

CREATE POLICY "profiles: staff reads all"
  ON public.profiles
  FOR SELECT
  USING (
    public.is_staff((SELECT auth.uid()))
  );

CREATE POLICY "profiles: staff updates all"
  ON public.profiles
  FOR UPDATE
  USING (
    public.is_staff((SELECT auth.uid()))
  )
  WITH CHECK (
    public.is_staff((SELECT auth.uid()))
  );

-- ---- courses (formerly classes) ----

CREATE POLICY "courses: teacher sees own"
  ON public.courses
  FOR SELECT
  USING (
    teacher_id = (SELECT auth.uid())
  );

CREATE POLICY "courses: student sees enrolled"
  ON public.courses
  FOR SELECT
  USING (
    public.is_student_in_class((SELECT auth.uid()), id)
  );

CREATE POLICY "courses: staff reads all"
  ON public.courses
  FOR SELECT
  USING (
    public.is_staff((SELECT auth.uid()))
  );

CREATE POLICY "courses: teacher or admin creates"
  ON public.courses
  FOR INSERT
  WITH CHECK (
    (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id   = (SELECT auth.uid())
          AND role = 'teacher'
      )
      AND teacher_id = (SELECT auth.uid())
    )
    OR public.is_admin((SELECT auth.uid()))
  );

CREATE POLICY "courses: staff updates"
  ON public.courses
  FOR UPDATE
  USING (
    public.is_staff((SELECT auth.uid()))
  )
  WITH CHECK (
    public.is_staff((SELECT auth.uid()))
    AND teacher_id IS NOT NULL
  );

CREATE POLICY "courses: staff deletes"
  ON public.courses
  FOR DELETE
  USING (
    public.is_staff((SELECT auth.uid()))
  );

-- ---- course_memberships (formerly class_memberships) ----

CREATE POLICY "memberships: student sees own"
  ON public.course_memberships
  FOR SELECT
  USING (
    student_id = (SELECT auth.uid())
  );

CREATE POLICY "memberships: teacher sees class roster"
  ON public.course_memberships
  FOR SELECT
  USING (
    public.is_teacher_of_course((SELECT auth.uid()), course_id)
  );

CREATE POLICY "memberships: staff reads all"
  ON public.course_memberships
  FOR SELECT
  USING (
    public.is_staff((SELECT auth.uid()))
  );

CREATE POLICY "memberships: staff enrolls anyone"
  ON public.course_memberships
  FOR INSERT
  WITH CHECK (
    public.is_staff((SELECT auth.uid()))
  );

CREATE POLICY "memberships: student leaves class"
  ON public.course_memberships
  FOR DELETE
  USING (
    student_id = (SELECT auth.uid())
  );

CREATE POLICY "memberships: staff removes anyone"
  ON public.course_memberships
  FOR DELETE
  USING (
    public.is_staff((SELECT auth.uid()))
  );

-- ---- assignments ----
-- All assignments policies were dropped in step 1. Recreate the full set
-- using is_teacher_of_course, is_student_in_class (updated body), and the
-- course_memberships table name.

-- SELECT: teacher of course reads own assignments
CREATE POLICY "assignments: teacher of course reads"
  ON public.assignments
  FOR SELECT
  USING (
    public.is_teacher_of_course((SELECT auth.uid()), course_id)
  );

-- SELECT: enrolled student reads assignments in their courses
CREATE POLICY "assignments: enrolled student reads"
  ON public.assignments
  FOR SELECT
  USING (
    public.is_student_in_class((SELECT auth.uid()), course_id)
  );

-- SELECT: staff reads all
CREATE POLICY "assignments: staff reads all"
  ON public.assignments
  FOR SELECT
  USING (
    public.is_staff((SELECT auth.uid()))
  );

-- INSERT: teacher of course (or admin) creates assignment; created_by must = caller
CREATE POLICY "assignments: teacher of course inserts"
  ON public.assignments
  FOR INSERT
  WITH CHECK (
    (
      public.is_teacher_of_course((SELECT auth.uid()), course_id)
      AND created_by = (SELECT auth.uid())
    )
    OR (
      public.is_admin((SELECT auth.uid()))
      AND created_by = (SELECT auth.uid())
    )
  );

-- UPDATE: staff updates
CREATE POLICY "assignments: staff updates"
  ON public.assignments
  FOR UPDATE
  USING (
    public.is_staff((SELECT auth.uid()))
  )
  WITH CHECK (
    public.is_staff((SELECT auth.uid()))
  );

-- DELETE: staff deletes
CREATE POLICY "assignments: staff deletes"
  ON public.assignments
  FOR DELETE
  USING (
    public.is_staff((SELECT auth.uid()))
  );

-- ---- assignment_attempts ----
-- All affected policies dropped in step 1; recreate the full set.

-- SELECT: student reads own attempts
CREATE POLICY "attempts: student reads own"
  ON public.assignment_attempts
  FOR SELECT
  USING (
    student_id = (SELECT auth.uid())
  );

-- SELECT: teacher of course reads attempts for their assignments
CREATE POLICY "attempts: teacher of course reads"
  ON public.assignment_attempts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.assignments a
      WHERE a.id = assignment_attempts.assignment_id
        AND public.is_teacher_of_course((SELECT auth.uid()), a.course_id)
    )
  );

-- SELECT: staff reads all
CREATE POLICY "attempts: staff reads all"
  ON public.assignment_attempts
  FOR SELECT
  USING (
    public.is_staff((SELECT auth.uid()))
  );

-- INSERT: student starts own attempt (must be enrolled in the course)
CREATE POLICY "attempts: student starts own"
  ON public.assignment_attempts
  FOR INSERT
  WITH CHECK (
    student_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.assignments a
      JOIN public.course_memberships cm ON cm.course_id = a.course_id
      WHERE a.id = assignment_attempts.assignment_id
        AND cm.student_id = (SELECT auth.uid())
    )
  );

-- UPDATE: student updates in-progress own attempt
CREATE POLICY "attempts: student updates in-progress own"
  ON public.assignment_attempts
  FOR UPDATE
  USING (
    student_id = (SELECT auth.uid())
    AND submitted_at IS NULL
  )
  WITH CHECK (
    student_id = (SELECT auth.uid())
  );

-- DELETE: staff deletes
CREATE POLICY "attempts: staff deletes"
  ON public.assignment_attempts
  FOR DELETE
  USING (
    public.is_staff((SELECT auth.uid()))
  );

-- ---- course_modules ----

CREATE POLICY "course_modules: teacher of class reads"
  ON public.course_modules
  FOR SELECT
  USING (
    public.is_teacher_of_course((SELECT auth.uid()), course_id)
  );

CREATE POLICY "course_modules: enrolled student reads"
  ON public.course_modules
  FOR SELECT
  USING (
    public.is_student_in_class((SELECT auth.uid()), course_id)
  );

CREATE POLICY "course_modules: staff reads all"
  ON public.course_modules
  FOR SELECT
  USING (
    public.is_staff((SELECT auth.uid()))
  );

CREATE POLICY "course_modules: staff inserts"
  ON public.course_modules
  FOR INSERT
  WITH CHECK (
    public.is_staff((SELECT auth.uid()))
  );

CREATE POLICY "course_modules: staff updates"
  ON public.course_modules
  FOR UPDATE
  USING (
    public.is_staff((SELECT auth.uid()))
  )
  WITH CHECK (
    public.is_staff((SELECT auth.uid()))
  );

CREATE POLICY "course_modules: staff deletes"
  ON public.course_modules
  FOR DELETE
  USING (
    public.is_staff((SELECT auth.uid()))
  );

-- ---- module_items ----

CREATE POLICY "module_items: teacher of class reads"
  ON public.module_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM public.course_modules m
       WHERE m.id = module_items.module_id
         AND public.is_teacher_of_course((SELECT auth.uid()), m.course_id)
    )
  );

CREATE POLICY "module_items: enrolled student reads"
  ON public.module_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM public.course_modules m
       WHERE m.id = module_items.module_id
         AND public.is_student_in_class((SELECT auth.uid()), m.course_id)
    )
  );

CREATE POLICY "module_items: staff reads all"
  ON public.module_items
  FOR SELECT
  USING (
    public.is_staff((SELECT auth.uid()))
  );

CREATE POLICY "module_items: staff inserts"
  ON public.module_items
  FOR INSERT
  WITH CHECK (
    public.is_staff((SELECT auth.uid()))
  );

CREATE POLICY "module_items: staff updates"
  ON public.module_items
  FOR UPDATE
  USING (
    public.is_staff((SELECT auth.uid()))
  )
  WITH CHECK (
    public.is_staff((SELECT auth.uid()))
  );

CREATE POLICY "module_items: staff deletes"
  ON public.module_items
  FOR DELETE
  USING (
    public.is_staff((SELECT auth.uid()))
  );


-- =============================================================================
-- STEP 6: RECREATE RPCS WITH UPDATED TABLE / COLUMN NAMES AND NEW NAMES
-- =============================================================================

-- ---- join_course_by_code (was join_class_by_code) ----

DROP FUNCTION IF EXISTS public.join_class_by_code(text);

CREATE OR REPLACE FUNCTION public.join_course_by_code(p_code text)
  RETURNS TABLE (
    id                   uuid,
    name                 text,
    description          text,
    join_code            text,
    teacher_display_name text
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller    uuid := auth.uid();
  v_course_id uuid;
  v_normalized text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING HINT = 'You must be signed in to join a course.';
  END IF;

  v_normalized := upper(trim(coalesce(p_code, '')));

  IF v_normalized = '' THEN
    RAISE EXCEPTION 'invalid_join_code'
      USING HINT = 'Join code is required.';
  END IF;

  SELECT c.id
    INTO v_course_id
    FROM public.courses c
   WHERE upper(c.join_code) = v_normalized
     AND c.archived = false
   LIMIT 1;

  IF v_course_id IS NULL THEN
    RAISE EXCEPTION 'invalid_join_code'
      USING HINT = 'No active course found for that code.';
  END IF;

  INSERT INTO public.course_memberships (course_id, student_id)
  VALUES (v_course_id, v_caller)
  ON CONFLICT (course_id, student_id) DO NOTHING;

  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.description,
    c.join_code,
    p.display_name AS teacher_display_name
  FROM public.courses c
  JOIN public.profiles p ON p.id = c.teacher_id
  WHERE c.id = v_course_id;
END;
$$;

REVOKE ALL ON FUNCTION public.join_course_by_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_course_by_code(text) TO authenticated;


-- ---- quick_start_with_code (body updated; function name unchanged) ----

CREATE OR REPLACE FUNCTION public.quick_start_with_code(
  p_code  text,
  p_name  text,
  p_email text
)
  RETURNS TABLE (
    class_id             uuid,
    class_name           text,
    teacher_display_name text
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller     uuid := auth.uid();
  v_course_id  uuid;
  v_class_name text;
  v_teacher    text;
  v_norm_code  text;
  v_norm_name  text;
  v_norm_email text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING HINT = 'You must be signed in (anonymously is fine) to use quick start.';
  END IF;

  v_norm_code  := upper(trim(coalesce(p_code, '')));
  v_norm_name  := trim(coalesce(p_name, ''));
  v_norm_email := lower(trim(coalesce(p_email, '')));

  IF v_norm_name = '' THEN
    RAISE EXCEPTION 'invalid_name'
      USING HINT = 'Please enter your full name.';
  END IF;

  IF v_norm_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'invalid_email'
      USING HINT = 'That email does not look right.';
  END IF;

  IF v_norm_code = '' THEN
    RAISE EXCEPTION 'invalid_join_code'
      USING HINT = 'Join code is required.';
  END IF;

  SELECT c.id, c.name
    INTO v_course_id, v_class_name
    FROM public.courses c
   WHERE upper(c.join_code) = v_norm_code
     AND c.archived = false
   LIMIT 1;

  IF v_course_id IS NULL THEN
    RAISE EXCEPTION 'invalid_join_code'
      USING HINT = 'No active course found for that code.';
  END IF;

  UPDATE public.profiles
     SET display_name = v_norm_name,
         email        = v_norm_email,
         updated_at   = now()
   WHERE id = v_caller;

  INSERT INTO public.course_memberships (course_id, student_id)
  VALUES (v_course_id, v_caller)
  ON CONFLICT (course_id, student_id) DO NOTHING;

  SELECT p.display_name
    INTO v_teacher
    FROM public.courses c
    JOIN public.profiles p ON p.id = c.teacher_id
   WHERE c.id = v_course_id;

  RETURN QUERY SELECT v_course_id, v_class_name, v_teacher;
END;
$$;

REVOKE ALL ON FUNCTION public.quick_start_with_code(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quick_start_with_code(text, text, text) TO authenticated;


-- ---- regenerate_course_join_code (was regenerate_class_join_code) ----

DROP FUNCTION IF EXISTS public.regenerate_class_join_code(uuid);

CREATE OR REPLACE FUNCTION public.regenerate_course_join_code(p_course_id uuid)
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

  IF NOT public.is_staff(v_caller) THEN
    RAISE EXCEPTION 'not_authorized'
      USING HINT = 'Only staff can regenerate the join code.';
  END IF;

  WHILE v_attempt < v_max AND NOT v_inserted LOOP
    v_attempt := v_attempt + 1;

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
      UPDATE public.courses
         SET join_code = v_new_code
       WHERE courses.id = p_course_id;
      v_inserted := true;
    EXCEPTION
      WHEN unique_violation THEN
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
  FROM public.courses c
  WHERE c.id = p_course_id;
END;
$$;

REVOKE ALL ON FUNCTION public.regenerate_course_join_code(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.regenerate_course_join_code(uuid) TO authenticated;


-- ---- admin_dashboard_stats (JSON key 'classes' → 'courses') ----

CREATE OR REPLACE FUNCTION public.admin_dashboard_stats()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_staff(v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  WITH
    users_roles AS (
      SELECT
        count(*) FILTER (WHERE role = 'student') AS students,
        count(*) FILTER (WHERE role = 'teacher') AS teachers,
        count(*) FILTER (WHERE role = 'admin')   AS admins
      FROM public.profiles
    ),
    courses_agg AS (
      SELECT
        count(*) FILTER (WHERE archived = false) AS active,
        count(*) FILTER (WHERE archived = true)  AS archived
      FROM public.courses
    ),
    memberships_agg AS (
      SELECT count(*) AS total FROM public.course_memberships
    ),
    assignments_src AS (
      SELECT
        count(*) FILTER (WHERE source_id = 'cb')    AS cb,
        count(*) FILTER (WHERE source_id = 'sat')   AS sat,
        count(*) FILTER (WHERE source_id = 'mixed') AS mixed
      FROM public.assignments
    ),
    attempts_agg AS (
      SELECT
        count(*) FILTER (WHERE submitted_at IS NULL)     AS in_progress,
        count(*) FILTER (WHERE submitted_at IS NOT NULL) AS completed,
        avg(score_percent) FILTER (WHERE submitted_at IS NOT NULL) AS avg_score
      FROM public.assignment_attempts
    ),
    recent_signups AS (
      SELECT count(*) AS c
      FROM public.profiles
      WHERE created_at >= now() - interval '7 days'
    ),
    recent_attempts AS (
      SELECT count(*) AS c
      FROM public.assignment_attempts
      WHERE submitted_at IS NOT NULL
        AND submitted_at >= now() - interval '7 days'
    ),
    teacher_activity AS (
      SELECT
        p.id,
        p.display_name,
        p.email,
        (SELECT count(*) FROM public.courses c WHERE c.teacher_id = p.id) AS classes_count,
        (SELECT count(*) FROM public.assignments a WHERE a.created_by = p.id) AS assignments_count
      FROM public.profiles p
      WHERE p.role IN ('teacher', 'admin')
    ),
    top_teachers AS (
      SELECT jsonb_agg(t ORDER BY t.classes_count DESC, t.assignments_count DESC) FILTER (
        WHERE t.classes_count > 0 OR t.assignments_count > 0
      ) AS rows
      FROM (
        SELECT id, display_name, email, classes_count, assignments_count
        FROM teacher_activity
        ORDER BY classes_count DESC, assignments_count DESC
        LIMIT 5
      ) t
    ),
    student_activity AS (
      SELECT
        p.id,
        p.display_name,
        p.email,
        count(aa.id) AS completed_attempts
      FROM public.profiles p
      JOIN public.assignment_attempts aa
        ON aa.student_id = p.id AND aa.submitted_at IS NOT NULL
      WHERE p.role = 'student'
      GROUP BY p.id, p.display_name, p.email
      ORDER BY completed_attempts DESC
      LIMIT 5
    ),
    top_students AS (
      SELECT jsonb_agg(s) AS rows FROM student_activity s
    )
  SELECT jsonb_build_object(
    'users_by_role', jsonb_build_object(
      'student', (SELECT students FROM users_roles),
      'teacher', (SELECT teachers FROM users_roles),
      'admin',   (SELECT admins   FROM users_roles)
    ),
    'courses', jsonb_build_object(
      'active',   (SELECT active   FROM courses_agg),
      'archived', (SELECT archived FROM courses_agg)
    ),
    'memberships', (SELECT total FROM memberships_agg),
    'assignments_by_source', jsonb_build_object(
      'cb',    (SELECT cb    FROM assignments_src),
      'sat',   (SELECT sat   FROM assignments_src),
      'mixed', (SELECT mixed FROM assignments_src)
    ),
    'attempts', jsonb_build_object(
      'in_progress', (SELECT in_progress FROM attempts_agg),
      'completed',   (SELECT completed   FROM attempts_agg)
    ),
    'avg_score', (SELECT avg_score FROM attempts_agg),
    'recent_signups_count',  (SELECT c FROM recent_signups),
    'recent_attempts_count', (SELECT c FROM recent_attempts),
    'most_active_teachers',  COALESCE((SELECT rows FROM top_teachers), '[]'::jsonb),
    'most_active_students',  COALESCE((SELECT rows FROM top_students), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_dashboard_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_stats() TO authenticated;


-- ---- reorder_modules (parameter p_class_id → p_course_id, return col class_id → course_id) ----
-- Must DROP before CREATE OR REPLACE because the return type changes.

DROP FUNCTION IF EXISTS public.reorder_modules(uuid, uuid[]);

CREATE OR REPLACE FUNCTION public.reorder_modules(
  p_course_id    uuid,
  p_ordered_ids  uuid[]
)
  RETURNS TABLE (
    module_id     uuid,
    course_id     uuid,
    new_position  integer
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING HINT = 'You must be signed in.';
  END IF;

  IF NOT public.is_staff(v_caller) THEN
    RAISE EXCEPTION 'not_authorized'
      USING HINT = 'Only staff can reorder modules.';
  END IF;

  WITH ord AS (
    SELECT t.id, t.idx
      FROM unnest(p_ordered_ids) WITH ORDINALITY AS t(id, idx)
  )
  UPDATE public.course_modules m
     SET position = ord.idx - 1
    FROM ord
   WHERE m.id = ord.id
     AND m.course_id = p_course_id;

  RETURN QUERY
  SELECT m.id AS module_id, m.course_id, m.position AS new_position
    FROM public.course_modules m
   WHERE m.course_id = p_course_id
   ORDER BY m.position;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_modules(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_modules(uuid, uuid[]) TO authenticated;


-- =============================================================================
-- END OF MIGRATION 0012_rename_courses.sql
-- =============================================================================
