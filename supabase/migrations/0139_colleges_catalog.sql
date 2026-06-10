-- =============================================================================
-- Migration: 0139_colleges_catalog.sql
-- Description: A shared COLLEGES catalog (reference database) + let students
-- build their OWN college list.
--
-- 1. public.colleges — a system-wide reference table of institutions with
--    facts (name/location/type/size/admit_rate/website) plus counselor-
--    maintained fields that have no clean public feed: deadlines (per plan),
--    supplemental essay prompts, and application requirements. Read by any
--    authenticated user; managed by ADMINS (the management UI + import script
--    write here). `scorecard_id` links a row to the US Dept. of Education
--    College Scorecard for the optional importer.
-- 2. college_applications.college_id — optional link from a student's list
--    entry to a catalog row (kept nullable so free-text entries still work).
-- 3. Student self-service on college_applications — a student may now
--    INSERT / UPDATE / DELETE their OWN list rows (0134 was counselor-only).
--    The counselor "FOR ALL" policy and student SELECT stay.
--
-- Forward-only.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.colleges (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  aliases       text[] NOT NULL DEFAULT '{}',
  city          text,
  state         text,
  country       text NOT NULL DEFAULT 'USA',
  website       text,
  type          text CHECK (type IN ('public', 'private', 'community', 'other')),
  size          integer,            -- undergrad enrollment
  admit_rate    numeric(4, 3),      -- 0..1
  common_app    boolean NOT NULL DEFAULT false,
  deadlines     jsonb NOT NULL DEFAULT '{}'::jsonb,  -- { "ED": "2025-11-01", "EA": "...", "RD": "..." }
  essay_prompts jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{ "prompt": "...", "words": 250 }]
  requirements  jsonb NOT NULL DEFAULT '{}'::jsonb,  -- { "rec_letters": 2, "test_optional": true, ... }
  notes         text,
  scorecard_id  text UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS colleges_name_idx ON public.colleges (lower(name));
CREATE INDEX IF NOT EXISTS colleges_state_idx ON public.colleges (state);

DROP TRIGGER IF EXISTS trg_colleges_updated_at ON public.colleges;
CREATE TRIGGER trg_colleges_updated_at BEFORE UPDATE ON public.colleges
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.colleges ENABLE ROW LEVEL SECURITY;

-- Any signed-in user can read the catalog (students build lists from it).
DROP POLICY IF EXISTS "colleges: authenticated reads" ON public.colleges;
CREATE POLICY "colleges: authenticated reads" ON public.colleges
  FOR SELECT USING ((SELECT auth.uid()) IS NOT NULL);

-- Only admins manage the catalog (system-wide shared data).
DROP POLICY IF EXISTS "colleges: admin writes" ON public.colleges;
CREATE POLICY "colleges: admin writes" ON public.colleges
  FOR ALL
  USING (public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_admin((SELECT auth.uid())));

-- Optional link from a student's list entry to a catalog row.
ALTER TABLE public.college_applications
  ADD COLUMN IF NOT EXISTS college_id uuid REFERENCES public.colleges(id) ON DELETE SET NULL;

-- ---- Student self-service on their OWN college list (extends 0134) --------
DROP POLICY IF EXISTS "capps: student inserts own" ON public.college_applications;
CREATE POLICY "capps: student inserts own" ON public.college_applications
  FOR INSERT
  WITH CHECK (
    student_id = (SELECT auth.uid())
    AND public.is_student_in_class((SELECT auth.uid()), course_id)
  );

DROP POLICY IF EXISTS "capps: student updates own" ON public.college_applications;
CREATE POLICY "capps: student updates own" ON public.college_applications
  FOR UPDATE
  USING (student_id = (SELECT auth.uid()))
  WITH CHECK (student_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "capps: student deletes own" ON public.college_applications;
CREATE POLICY "capps: student deletes own" ON public.college_applications
  FOR DELETE
  USING (student_id = (SELECT auth.uid()));

-- =============================================================================
-- END OF MIGRATION 0139_colleges_catalog.sql
-- =============================================================================
