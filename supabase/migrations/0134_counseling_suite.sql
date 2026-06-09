-- =============================================================================
-- Migration: 0134_counseling_suite.sql
-- Description: Data model for the Counseling course type (0133) — the four
-- counselor surfaces: student digital profile, college list + application
-- tracker (one unified table), counselor tasks, and meeting notes.
--
-- All tables are course + student scoped. Access uses the existing SECURITY
-- DEFINER helper is_teacher_of_course(uid, course_id) (extended for shares in
-- 0130) + is_admin, plus a student-own-row read where the student should see
-- their own data. Meeting notes are counselor-private (no student access).
--
-- RLS note: is_teacher_of_course re-queries the COURSES table (not these
-- tables), and course_id always references an already-committed course, so the
-- INSERT...RETURNING self-reference gotcha from 0132 does NOT apply here.
--
-- Forward-only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. counseling_profiles — per (course, student) digital profile
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.counseling_profiles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id     uuid NOT NULL REFERENCES public.courses(id)  ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  grad_year     integer,
  gpa           numeric(4, 2),
  intended_major text,
  goals         text,
  activities    jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{name, role, hours_per_week}]
  test_scores   jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {sat, act, ...}
  updated_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, student_id)
);
CREATE INDEX IF NOT EXISTS counseling_profiles_course_student_idx
  ON public.counseling_profiles (course_id, student_id);
ALTER TABLE public.counseling_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cprofiles: counselor manages" ON public.counseling_profiles;
CREATE POLICY "cprofiles: counselor manages" ON public.counseling_profiles
  FOR ALL
  USING (public.is_teacher_of_course((SELECT auth.uid()), course_id) OR public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_teacher_of_course((SELECT auth.uid()), course_id) OR public.is_admin((SELECT auth.uid())));
DROP POLICY IF EXISTS "cprofiles: student reads own" ON public.counseling_profiles;
CREATE POLICY "cprofiles: student reads own" ON public.counseling_profiles
  FOR SELECT USING (student_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "cprofiles: student updates own" ON public.counseling_profiles;
CREATE POLICY "cprofiles: student updates own" ON public.counseling_profiles
  FOR UPDATE USING (student_id = (SELECT auth.uid()))
  WITH CHECK (student_id = (SELECT auth.uid()));

-- -----------------------------------------------------------------------------
-- 2. college_applications — unified college LIST (tier + notes) and APPLICATION
--    TRACKER (plan + deadline + status + decision)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.college_applications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id     uuid NOT NULL REFERENCES public.courses(id)  ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  college_name  text NOT NULL,
  tier          text CHECK (tier IN ('reach', 'target', 'safety', 'likely')),
  plan          text CHECK (plan IN ('ED', 'ED2', 'EA', 'REA', 'RD', 'rolling')),
  deadline      date,
  status        text NOT NULL DEFAULT 'considering'
                  CHECK (status IN ('considering', 'in_progress', 'submitted',
                                    'accepted', 'rejected', 'waitlisted',
                                    'deferred', 'enrolled')),
  notes         text,
  submitted_at  timestamptz,
  created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS college_applications_course_student_idx
  ON public.college_applications (course_id, student_id);
ALTER TABLE public.college_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "capps: counselor manages" ON public.college_applications;
CREATE POLICY "capps: counselor manages" ON public.college_applications
  FOR ALL
  USING (public.is_teacher_of_course((SELECT auth.uid()), course_id) OR public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_teacher_of_course((SELECT auth.uid()), course_id) OR public.is_admin((SELECT auth.uid())));
DROP POLICY IF EXISTS "capps: student reads own" ON public.college_applications;
CREATE POLICY "capps: student reads own" ON public.college_applications
  FOR SELECT USING (student_id = (SELECT auth.uid()));

-- -----------------------------------------------------------------------------
-- 3. counseling_tasks — counselor-assigned to-dos for a student
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.counseling_tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id     uuid NOT NULL REFERENCES public.courses(id)  ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title         text NOT NULL,
  details       text,
  due_date      date,
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  assigned_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS counseling_tasks_course_student_idx
  ON public.counseling_tasks (course_id, student_id);
ALTER TABLE public.counseling_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ctasks: counselor manages" ON public.counseling_tasks;
CREATE POLICY "ctasks: counselor manages" ON public.counseling_tasks
  FOR ALL
  USING (public.is_teacher_of_course((SELECT auth.uid()), course_id) OR public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_teacher_of_course((SELECT auth.uid()), course_id) OR public.is_admin((SELECT auth.uid())));
DROP POLICY IF EXISTS "ctasks: student reads own" ON public.counseling_tasks;
CREATE POLICY "ctasks: student reads own" ON public.counseling_tasks
  FOR SELECT USING (student_id = (SELECT auth.uid()));

-- -----------------------------------------------------------------------------
-- 4. counseling_meetings — dated advising-session notes (counselor-private)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.counseling_meetings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id     uuid NOT NULL REFERENCES public.courses(id)  ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  met_on        date NOT NULL DEFAULT current_date,
  summary       text,
  next_steps    text,
  created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS counseling_meetings_course_student_idx
  ON public.counseling_meetings (course_id, student_id, met_on DESC);
ALTER TABLE public.counseling_meetings ENABLE ROW LEVEL SECURITY;

-- Counselor-private: only a teacher of the course (or admin) can read/write.
-- No student-read policy by design (advising notes).
DROP POLICY IF EXISTS "cmeetings: counselor manages" ON public.counseling_meetings;
CREATE POLICY "cmeetings: counselor manages" ON public.counseling_meetings
  FOR ALL
  USING (public.is_teacher_of_course((SELECT auth.uid()), course_id) OR public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_teacher_of_course((SELECT auth.uid()), course_id) OR public.is_admin((SELECT auth.uid())));

-- -----------------------------------------------------------------------------
-- updated_at touch triggers (reuse the existing set_updated_at fn)
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_cprofiles_updated_at ON public.counseling_profiles;
CREATE TRIGGER trg_cprofiles_updated_at BEFORE UPDATE ON public.counseling_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_capps_updated_at ON public.college_applications;
CREATE TRIGGER trg_capps_updated_at BEFORE UPDATE ON public.college_applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_ctasks_updated_at ON public.counseling_tasks;
CREATE TRIGGER trg_ctasks_updated_at BEFORE UPDATE ON public.counseling_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_cmeetings_updated_at ON public.counseling_meetings;
CREATE TRIGGER trg_cmeetings_updated_at BEFORE UPDATE ON public.counseling_meetings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- END OF MIGRATION 0134_counseling_suite.sql
-- =============================================================================
