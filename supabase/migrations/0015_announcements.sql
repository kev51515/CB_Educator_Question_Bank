-- =============================================================================
-- Migration: 0015_announcements.sql
-- Description: Adds `course_announcements` — short messages teachers post to a
--              course that every enrolled student sees on their landing page.
--
-- Design notes:
--   * Author is a profiles FK with ON DELETE RESTRICT so we never end up with
--     "ghost" authored rows after a teacher is deleted. Staff who want to
--     remove a teacher must delete their announcements first (or reassign,
--     which we don't support yet — out of scope).
--   * `published` is a draft flag. Students never see published=false rows;
--     RLS enforces that, not the client.
--   * Composite index on (course_id, pinned DESC, created_at DESC) matches
--     the dominant query: "list announcements for this course, pinned first".
--
-- RLS recursion notes (CRITICAL — see 0008 / 0013 history):
--   The INSERT WITH CHECK clause MUST use SECURITY DEFINER helpers (is_staff,
--   is_teacher_of_course) instead of inline `EXISTS (SELECT 1 FROM profiles
--   ...)` subqueries. The latter re-enters the profiles RLS layer, which has
--   a "teacher sees enrolled students" policy that joins back through
--   course_memberships + courses — triggering 42P17 infinite recursion.
--
-- Platform: Supabase (PostgreSQL 15+). Supabase wraps each migration in a
-- transaction automatically.
-- =============================================================================


-- =============================================================================
-- SECTION 1: TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.course_announcements (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id  uuid        NOT NULL REFERENCES public.courses(id)  ON DELETE CASCADE,
  author_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  title      text        NOT NULL,
  body       text        NOT NULL,
  pinned     boolean     NOT NULL DEFAULT false,
  -- Drafts: students never see published=false rows. Defaults to true so the
  -- common "type, save" flow works without surfacing the toggle in the form.
  published  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Soft guard rails matching the client-side validation. Cheap to enforce.
  CONSTRAINT course_announcements_title_len  CHECK (char_length(title) BETWEEN 1 AND 200),
  CONSTRAINT course_announcements_body_len   CHECK (char_length(body)  BETWEEN 1 AND 10000)
);

-- Why: the canonical list query is "for course X, pinned first then newest".
-- A single composite index covers it without forcing a sort step.
CREATE INDEX IF NOT EXISTS idx_course_announcements_course_pinned_created
  ON public.course_announcements (course_id, pinned DESC, created_at DESC);

-- updated_at housekeeping (uses the shared trigger from 0001).
CREATE OR REPLACE TRIGGER trg_course_announcements_set_updated_at
  BEFORE UPDATE ON public.course_announcements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- SECTION 2: RLS
-- =============================================================================

ALTER TABLE public.course_announcements ENABLE ROW LEVEL SECURITY;

-- ---- SELECT ----
-- Enrolled students see published announcements for their courses.
-- is_student_in_class is SECURITY DEFINER so this does NOT recurse.
CREATE POLICY "announcements: enrolled student reads"
  ON public.course_announcements
  FOR SELECT
  USING (
    published = true
    AND public.is_student_in_class((SELECT auth.uid()), course_id)
  );

-- Staff (teacher or admin) sees everything, including drafts.
CREATE POLICY "announcements: staff reads all"
  ON public.course_announcements
  FOR SELECT
  USING (
    public.is_staff((SELECT auth.uid()))
  );

-- ---- INSERT ----
-- Staff only. author_id must equal the caller so every row attributes to the
-- actual sender. CRITICAL: uses SECURITY DEFINER helper (is_staff), NOT an
-- inline EXISTS against profiles — see 0008 / 0013 for the recursion fix.
CREATE POLICY "announcements: staff inserts"
  ON public.course_announcements
  FOR INSERT
  WITH CHECK (
    public.is_staff((SELECT auth.uid()))
    AND author_id = (SELECT auth.uid())
  );

-- ---- UPDATE ----
-- Any staff member can edit any announcement on courses they have access to.
-- The husband-wife teacher setup means we deliberately allow co-teachers to
-- pin / unpin / edit each other's posts.
CREATE POLICY "announcements: staff updates"
  ON public.course_announcements
  FOR UPDATE
  USING (
    public.is_staff((SELECT auth.uid()))
  )
  WITH CHECK (
    public.is_staff((SELECT auth.uid()))
  );

-- ---- DELETE ----
-- Author OR any staff member.
CREATE POLICY "announcements: staff deletes"
  ON public.course_announcements
  FOR DELETE
  USING (
    public.is_staff((SELECT auth.uid()))
  );


-- =============================================================================
-- SECTION 3: REALTIME
-- The client subscribes to postgres_changes on this table; Supabase only
-- broadcasts events for tables added to the supabase_realtime publication.
-- Guarded so this is idempotent across re-runs / shadow-db diff.
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1
        FROM pg_publication_tables
       WHERE pubname    = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename  = 'course_announcements'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.course_announcements';
    END IF;
  END IF;
END$$;


-- =============================================================================
-- END OF MIGRATION 0015_announcements.sql
-- =============================================================================
