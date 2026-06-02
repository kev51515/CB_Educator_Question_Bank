-- =============================================================================
-- Migration: 0001_init.sql
-- Description: Foundation schema — identity, class structure, RLS, helper fns
-- Platform: Supabase (PostgreSQL 15+)
-- Note: Supabase wraps each migration in a transaction automatically.
-- =============================================================================


-- =============================================================================
-- SECTION 1: ENUM TYPES
-- Intentionally NOT using IF NOT EXISTS — a duplicate means a migration
-- collision, which should fail loudly rather than silently succeed.
-- =============================================================================

CREATE TYPE public.user_role AS ENUM ('student', 'teacher', 'admin');


-- =============================================================================
-- SECTION 2: UPDATED_AT TRIGGER FUNCTION
-- Shared by every table that needs updated_at housekeeping.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
  -- No SECURITY DEFINER needed — caller context is fine for DML triggers.
  SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- =============================================================================
-- SECTION 3: PROFILES TABLE
-- One row per auth.users row. Created by trigger on auth.users INSERT.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id           uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        text        NOT NULL,
  display_name text,
  role         public.user_role NOT NULL DEFAULT 'student',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Why: updated_at should always reflect the last time a row was touched.
CREATE OR REPLACE TRIGGER trg_profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- SECTION 4: CLASSES TABLE
-- Teacher-owned classroom entity.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.classes (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id  uuid    NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  name        text    NOT NULL,
  description text,
  -- Human-friendly join code. Application generates structured codes like
  -- 'ABCD-1234'; the default covers ad-hoc manual inserts during development.
  join_code   text    UNIQUE NOT NULL
                      DEFAULT upper(substr(md5(random()::text), 1, 8)),
  archived    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Why: teacher_id is queried constantly (owner checks, student lookups).
CREATE INDEX IF NOT EXISTS idx_classes_teacher_id ON public.classes(teacher_id);

CREATE OR REPLACE TRIGGER trg_classes_set_updated_at
  BEFORE UPDATE ON public.classes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- SECTION 5: CLASS_MEMBERSHIPS TABLE
-- Student ↔ Class many-to-many join.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.class_memberships (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id   uuid        NOT NULL REFERENCES public.classes(id)   ON DELETE CASCADE,
  student_id uuid        NOT NULL REFERENCES public.profiles(id)  ON DELETE CASCADE,
  joined_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, student_id)
);

-- Why: student-centric lookups ("what classes am I in?") hit student_id.
CREATE INDEX IF NOT EXISTS idx_class_memberships_student_id
  ON public.class_memberships(student_id);

-- Why: class-centric lookups ("who is in this class?") hit class_id.
-- Also covers the FK itself so Postgres doesn't do a full seqscan on cascade.
CREATE INDEX IF NOT EXISTS idx_class_memberships_class_id
  ON public.class_memberships(class_id);

-- RLS
ALTER TABLE public.class_memberships ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- SECTION 6: SECURITY DEFINER HELPER FUNCTIONS
-- Centralise repeated policy logic in stable, inlineable functions.
-- All use SET search_path to prevent search_path injection.
-- =============================================================================

-- public.is_admin(uid)
-- Returns true when the given UUID belongs to a profile with role='admin'.
-- Why SECURITY DEFINER: policies run as the calling user, who may not have
-- direct SELECT on profiles. SECURITY DEFINER escalates to the function
-- owner (postgres / service role) for this single targeted lookup.
CREATE OR REPLACE FUNCTION public.is_admin(uid uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = uid
      AND role = 'admin'
  );
$$;

-- public.is_teacher_of_class(uid, class_id)
-- Returns true when uid is the teacher_id of the given class.
CREATE OR REPLACE FUNCTION public.is_teacher_of_class(uid uuid, p_class_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.classes
    WHERE id         = p_class_id
      AND teacher_id = uid
  );
$$;

-- public.is_student_in_class(uid, class_id)
-- Returns true when uid has a membership row for the given class.
CREATE OR REPLACE FUNCTION public.is_student_in_class(uid uuid, p_class_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.class_memberships
    WHERE class_id   = p_class_id
      AND student_id = uid
  );
$$;


-- =============================================================================
-- SECTION 7: AUTO-PROFILE TRIGGER
-- Fires on auth.users INSERT and mirrors the row into public.profiles.
-- Uses SECURITY DEFINER so it can INSERT into profiles without an end-user
-- INSERT policy (end users must never directly insert into profiles).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    -- Gracefully fall back to NULL when the key is absent.
    NULLIF(trim(NEW.raw_user_meta_data->>'display_name'), ''),
    COALESCE(
      (NEW.raw_user_meta_data->>'role')::public.user_role,
      'student'::public.user_role
    )
  )
  ON CONFLICT (id) DO NOTHING; -- idempotent against duplicate-fire edge cases
  RETURN NEW;
END;
$$;

-- Guard against re-running the migration (idempotent trigger creation).
DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;

CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();


-- =============================================================================
-- SECTION 8: RLS POLICIES — PROFILES
-- =============================================================================

-- ---- SELECT ----

DROP POLICY IF EXISTS "profiles: own row" ON public.profiles;
CREATE POLICY "profiles: own row"
  ON public.profiles
  FOR SELECT
  USING (
    -- Why: every user can always see their own profile (e.g., to populate the
    -- settings page). auth.uid() is wrapped in SELECT per Supabase best
    -- practice so the value is computed once per statement, not per row.
    id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "profiles: teacher sees enrolled students" ON public.profiles;
CREATE POLICY "profiles: teacher sees enrolled students"
  ON public.profiles
  FOR SELECT
  USING (
    -- Why: a teacher needs to read the profiles of students in their classes
    -- (e.g., to display a class roster). We join through class_memberships →
    -- classes to confirm the teacher_id. This is more restrictive than giving
    -- teachers a blanket SELECT on all profiles.
    EXISTS (
      SELECT 1
      FROM public.class_memberships cm
      JOIN public.classes c ON c.id = cm.class_id
      WHERE cm.student_id = profiles.id
        AND c.teacher_id  = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "profiles: admin reads all" ON public.profiles;
CREATE POLICY "profiles: admin reads all"
  ON public.profiles
  FOR SELECT
  USING (
    -- Why: admins need global read access for user management.
    public.is_admin((SELECT auth.uid()))
  );

-- ---- UPDATE ----

DROP POLICY IF EXISTS "profiles: own row update" ON public.profiles;
CREATE POLICY "profiles: own row update"
  ON public.profiles
  FOR UPDATE
  USING (
    -- USING: which rows the user may target.
    id = (SELECT auth.uid())
  )
  WITH CHECK (
    -- WITH CHECK: what the row must look like after the update.
    -- Why: we allow users to update their own profile but must prevent
    -- self-elevation of role. The WITH CHECK approach was chosen over a
    -- trigger because it is declarative and fires before the write is
    -- committed, making the constraint visible in the policy layer rather
    -- than hidden in trigger code. The trade-off is that the error message
    -- ("new row violates row-level security") is less descriptive than a
    -- custom exception; a future RAISE in a trigger could improve UX.
    id   = (SELECT auth.uid())
    AND role = (SELECT role FROM public.profiles WHERE id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "profiles: admin updates all" ON public.profiles;
CREATE POLICY "profiles: admin updates all"
  ON public.profiles
  FOR UPDATE
  USING (
    -- Why: admins may edit any profile (e.g., to change a user's role).
    public.is_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    public.is_admin((SELECT auth.uid()))
  );

-- No INSERT policy — only the SECURITY DEFINER trigger inserts.
-- No DELETE policy — profiles are soft-deleted by cascading auth.users delete.


-- =============================================================================
-- SECTION 9: RLS POLICIES — CLASSES
-- =============================================================================

-- ---- SELECT ----

DROP POLICY IF EXISTS "classes: teacher sees own" ON public.classes;
CREATE POLICY "classes: teacher sees own"
  ON public.classes
  FOR SELECT
  USING (
    -- Why: a teacher can always view the classes they own.
    teacher_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "classes: student sees enrolled" ON public.classes;
CREATE POLICY "classes: student sees enrolled"
  ON public.classes
  FOR SELECT
  USING (
    -- Why: a student should see the classes they have joined (e.g., their
    -- dashboard). Membership is the single source of truth for enrollment.
    public.is_student_in_class((SELECT auth.uid()), id)
  );

DROP POLICY IF EXISTS "classes: admin reads all" ON public.classes;
CREATE POLICY "classes: admin reads all"
  ON public.classes
  FOR SELECT
  USING (
    -- Why: admins need visibility into all classes for moderation.
    public.is_admin((SELECT auth.uid()))
  );

-- ---- INSERT ----

DROP POLICY IF EXISTS "classes: teacher or admin creates" ON public.classes;
CREATE POLICY "classes: teacher or admin creates"
  ON public.classes
  FOR INSERT
  WITH CHECK (
    -- Why: only teachers and admins may create classes. The teacher_id must
    -- equal auth.uid() to prevent a teacher from creating classes impersonating
    -- another teacher. Admins bypass this (e.g., for school-wide setup).
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

-- ---- UPDATE ----

DROP POLICY IF EXISTS "classes: owning teacher or admin updates" ON public.classes;
CREATE POLICY "classes: owning teacher or admin updates"
  ON public.classes
  FOR UPDATE
  USING (
    teacher_id = (SELECT auth.uid())
    OR public.is_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    -- Why: same guard on the post-update row to prevent reassigning teacher_id.
    teacher_id = (SELECT auth.uid())
    OR public.is_admin((SELECT auth.uid()))
  );

-- ---- DELETE ----

DROP POLICY IF EXISTS "classes: owning teacher or admin deletes" ON public.classes;
CREATE POLICY "classes: owning teacher or admin deletes"
  ON public.classes
  FOR DELETE
  USING (
    -- Why: only the creating teacher or an admin may delete a class.
    teacher_id = (SELECT auth.uid())
    OR public.is_admin((SELECT auth.uid()))
  );


-- =============================================================================
-- SECTION 10: RLS POLICIES — CLASS_MEMBERSHIPS
-- =============================================================================

-- ---- SELECT ----

DROP POLICY IF EXISTS "memberships: student sees own" ON public.class_memberships;
CREATE POLICY "memberships: student sees own"
  ON public.class_memberships
  FOR SELECT
  USING (
    -- Why: a student can see their own membership rows (e.g., list their classes).
    student_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "memberships: teacher sees class roster" ON public.class_memberships;
CREATE POLICY "memberships: teacher sees class roster"
  ON public.class_memberships
  FOR SELECT
  USING (
    -- Why: the teacher who owns a class needs to see all membership rows for
    -- that class in order to render the roster and manage enrollments.
    public.is_teacher_of_class((SELECT auth.uid()), class_id)
  );

DROP POLICY IF EXISTS "memberships: admin reads all" ON public.class_memberships;
CREATE POLICY "memberships: admin reads all"
  ON public.class_memberships
  FOR SELECT
  USING (
    public.is_admin((SELECT auth.uid()))
  );

-- ---- INSERT ----

DROP POLICY IF EXISTS "memberships: student self-enrolls" ON public.class_memberships;
CREATE POLICY "memberships: student self-enrolls"
  ON public.class_memberships
  FOR INSERT
  WITH CHECK (
    -- Why: a student may join a class for themselves. The join-code validation
    -- (ensuring the code matches the class) is intentionally deferred to an
    -- application-layer RPC or a future migration — enforcing it purely in an
    -- RLS WITH CHECK would require reading classes here, which is valid but
    -- couples enrollment auth to class lookup. For now the student_id guard
    -- prevents impersonating another student.
    student_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "memberships: teacher enrolls student" ON public.class_memberships;
CREATE POLICY "memberships: teacher enrolls student"
  ON public.class_memberships
  FOR INSERT
  WITH CHECK (
    -- Why: a teacher may add any student to a class they own (e.g., bulk
    -- roster import, manual add). No restriction on student_id here because
    -- the teacher is acting on behalf of the school.
    public.is_teacher_of_class((SELECT auth.uid()), class_id)
  );

DROP POLICY IF EXISTS "memberships: admin enrolls anyone" ON public.class_memberships;
CREATE POLICY "memberships: admin enrolls anyone"
  ON public.class_memberships
  FOR INSERT
  WITH CHECK (
    public.is_admin((SELECT auth.uid()))
  );

-- ---- DELETE ----

DROP POLICY IF EXISTS "memberships: student leaves class" ON public.class_memberships;
CREATE POLICY "memberships: student leaves class"
  ON public.class_memberships
  FOR DELETE
  USING (
    -- Why: a student may remove themselves from a class (drop it).
    student_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "memberships: teacher removes student" ON public.class_memberships;
CREATE POLICY "memberships: teacher removes student"
  ON public.class_memberships
  FOR DELETE
  USING (
    -- Why: a teacher may unenroll a student from their own class.
    public.is_teacher_of_class((SELECT auth.uid()), class_id)
  );

DROP POLICY IF EXISTS "memberships: admin removes anyone" ON public.class_memberships;
CREATE POLICY "memberships: admin removes anyone"
  ON public.class_memberships
  FOR DELETE
  USING (
    public.is_admin((SELECT auth.uid()))
  );


-- =============================================================================
-- END OF MIGRATION 0001_init.sql
-- =============================================================================
