-- =============================================================================
-- Migration: 0017_portfolio.sql
-- Description: Portfolio feature — per-course teacher-curated checklist of
--              submissions for college admissions prep. A teacher defines a
--              template (one per course) of REQUIREMENTS (items). Students
--              fill in each requirement over time (text, file, link, choice,
--              etc.). Teacher sees a completion overview and can leave inline
--              feedback per submission. Submissions are PRIVATE per student.
--
-- Tables:
--   portfolio_templates    — one per course (UNIQUE(course_id))
--   portfolio_items        — ordered checklist items in a template
--   portfolio_submissions  — one student's response to one item (UNIQUE pair)
--   portfolio_feedback     — teacher inline comments on a submission (append-only)
--
-- Storage bucket: `portfolio-files` (private). Path = `{course_id}/{student_id}/{uuid}-{filename}`.
--
-- RLS recursion notes (CRITICAL — see 0008 / 0013 / 0015 history):
--   The INSERT / UPDATE WITH CHECK clauses MUST use SECURITY DEFINER helpers
--   (is_staff, is_student_in_class, is_teacher_of_course) rather than inline
--   `EXISTS (SELECT … FROM profiles …)` subqueries. The latter re-enters the
--   profiles RLS layer and triggers 42P17 infinite recursion.
-- =============================================================================


-- =============================================================================
-- SECTION 1: portfolio_templates
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.portfolio_templates (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   uuid        NOT NULL UNIQUE REFERENCES public.courses(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  description text,
  published   boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER trg_portfolio_templates_set_updated_at
  BEFORE UPDATE ON public.portfolio_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.portfolio_templates ENABLE ROW LEVEL SECURITY;

-- SELECT: enrolled student or staff
CREATE POLICY "portfolio_templates: enrolled student reads"
  ON public.portfolio_templates
  FOR SELECT
  USING (public.is_student_in_class((SELECT auth.uid()), course_id));

CREATE POLICY "portfolio_templates: staff reads all"
  ON public.portfolio_templates
  FOR SELECT
  USING (public.is_staff((SELECT auth.uid())));

-- INSERT / UPDATE / DELETE: staff only
CREATE POLICY "portfolio_templates: staff inserts"
  ON public.portfolio_templates
  FOR INSERT
  WITH CHECK (public.is_staff((SELECT auth.uid())));

CREATE POLICY "portfolio_templates: staff updates"
  ON public.portfolio_templates
  FOR UPDATE
  USING (public.is_staff((SELECT auth.uid())))
  WITH CHECK (public.is_staff((SELECT auth.uid())));

CREATE POLICY "portfolio_templates: staff deletes"
  ON public.portfolio_templates
  FOR DELETE
  USING (public.is_staff((SELECT auth.uid())));


-- =============================================================================
-- SECTION 2: portfolio_items
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.portfolio_items (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  uuid        NOT NULL REFERENCES public.portfolio_templates(id) ON DELETE CASCADE,
  position     int         NOT NULL,
  title        text        NOT NULL,
  prompt       text,
  item_type    text        NOT NULL CHECK (item_type IN (
                  'short_text','long_text','file','link','number','date','choice','multi_choice'
                )),
  required     boolean     NOT NULL DEFAULT true,
  due_at       timestamptz,
  settings     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_items_template_position
  ON public.portfolio_items(template_id, position);

CREATE OR REPLACE TRIGGER trg_portfolio_items_set_updated_at
  BEFORE UPDATE ON public.portfolio_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.portfolio_items ENABLE ROW LEVEL SECURITY;

-- SELECT: enrolled student or staff. Visibility flows via the parent
-- template's course_id. We resolve template → course via a SECURITY DEFINER
-- subquery on portfolio_templates (which itself has RLS — but is_staff /
-- is_student_in_class short-circuit before that scan).
CREATE POLICY "portfolio_items: enrolled student reads"
  ON public.portfolio_items
  FOR SELECT
  USING (
    public.is_student_in_class(
      (SELECT auth.uid()),
      (SELECT t.course_id FROM public.portfolio_templates t WHERE t.id = template_id)
    )
  );

CREATE POLICY "portfolio_items: staff reads all"
  ON public.portfolio_items
  FOR SELECT
  USING (public.is_staff((SELECT auth.uid())));

CREATE POLICY "portfolio_items: staff inserts"
  ON public.portfolio_items
  FOR INSERT
  WITH CHECK (public.is_staff((SELECT auth.uid())));

CREATE POLICY "portfolio_items: staff updates"
  ON public.portfolio_items
  FOR UPDATE
  USING (public.is_staff((SELECT auth.uid())))
  WITH CHECK (public.is_staff((SELECT auth.uid())));

CREATE POLICY "portfolio_items: staff deletes"
  ON public.portfolio_items
  FOR DELETE
  USING (public.is_staff((SELECT auth.uid())));


-- =============================================================================
-- SECTION 3: portfolio_submissions
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.portfolio_submissions (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id            uuid        NOT NULL REFERENCES public.portfolio_items(id) ON DELETE CASCADE,
  student_id         uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Only one value_* column is populated based on the parent item's item_type.
  value_text         text,
  value_url          text,
  value_file_path    text,
  value_file_size    int,
  value_file_mime    text,
  value_number       numeric,
  value_date         date,
  value_choice       text,
  value_multi_choice text[],
  status             text        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted')),
  submitted_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT portfolio_submissions_unique_per_student UNIQUE (item_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_portfolio_submissions_student_status
  ON public.portfolio_submissions(student_id, status);

CREATE OR REPLACE TRIGGER trg_portfolio_submissions_set_updated_at
  BEFORE UPDATE ON public.portfolio_submissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.portfolio_submissions ENABLE ROW LEVEL SECURITY;

-- SELECT: the owning student OR staff.
CREATE POLICY "portfolio_submissions: student reads own"
  ON public.portfolio_submissions
  FOR SELECT
  USING (student_id = (SELECT auth.uid()));

CREATE POLICY "portfolio_submissions: staff reads all"
  ON public.portfolio_submissions
  FOR SELECT
  USING (public.is_staff((SELECT auth.uid())));

-- INSERT / UPDATE: the student writes only their own row.
CREATE POLICY "portfolio_submissions: student inserts own"
  ON public.portfolio_submissions
  FOR INSERT
  WITH CHECK (student_id = (SELECT auth.uid()));

CREATE POLICY "portfolio_submissions: student updates own"
  ON public.portfolio_submissions
  FOR UPDATE
  USING (student_id = (SELECT auth.uid()))
  WITH CHECK (student_id = (SELECT auth.uid()));

-- DELETE: owning student OR staff.
CREATE POLICY "portfolio_submissions: student deletes own"
  ON public.portfolio_submissions
  FOR DELETE
  USING (student_id = (SELECT auth.uid()));

CREATE POLICY "portfolio_submissions: staff deletes"
  ON public.portfolio_submissions
  FOR DELETE
  USING (public.is_staff((SELECT auth.uid())));


-- =============================================================================
-- SECTION 4: portfolio_feedback (append-only)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.portfolio_feedback (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid        NOT NULL REFERENCES public.portfolio_submissions(id) ON DELETE CASCADE,
  -- RESTRICT so we never lose the audit trail of who wrote feedback.
  author_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  body          text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_feedback_submission_created
  ON public.portfolio_feedback(submission_id, created_at);

ALTER TABLE public.portfolio_feedback ENABLE ROW LEVEL SECURITY;

-- SELECT: the submission's owning student OR staff.
CREATE POLICY "portfolio_feedback: student reads own"
  ON public.portfolio_feedback
  FOR SELECT
  USING (
    (SELECT s.student_id FROM public.portfolio_submissions s WHERE s.id = submission_id)
      = (SELECT auth.uid())
  );

CREATE POLICY "portfolio_feedback: staff reads all"
  ON public.portfolio_feedback
  FOR SELECT
  USING (public.is_staff((SELECT auth.uid())));

-- INSERT: staff only, author = caller (honest audit column).
CREATE POLICY "portfolio_feedback: staff inserts"
  ON public.portfolio_feedback
  FOR INSERT
  WITH CHECK (
    public.is_staff((SELECT auth.uid()))
    AND author_id = (SELECT auth.uid())
  );

-- DELETE: author OR staff (any staff member can clean up).
CREATE POLICY "portfolio_feedback: author deletes own"
  ON public.portfolio_feedback
  FOR DELETE
  USING (author_id = (SELECT auth.uid()));

CREATE POLICY "portfolio_feedback: staff deletes"
  ON public.portfolio_feedback
  FOR DELETE
  USING (public.is_staff((SELECT auth.uid())));


-- =============================================================================
-- SECTION 5: ensure_portfolio_template RPC (lazy bootstrap)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.ensure_portfolio_template(
  p_course_id uuid,
  p_name      text
)
RETURNS public.portfolio_templates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_row public.portfolio_templates;
BEGIN
  -- Staff-only guard. We bypass RLS via SECURITY DEFINER, so we MUST gate
  -- with an explicit caller check.
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'permission denied: staff only' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row
    FROM public.portfolio_templates
    WHERE course_id = p_course_id;

  IF FOUND THEN
    RETURN v_row;
  END IF;

  INSERT INTO public.portfolio_templates(course_id, name)
  VALUES (p_course_id, COALESCE(NULLIF(trim(p_name), ''), 'Portfolio'))
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_portfolio_template(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_portfolio_template(uuid, text) TO authenticated;


-- =============================================================================
-- SECTION 6: STORAGE BUCKET `portfolio-files`
--
-- Private bucket. Path convention: `{course_id}/{student_id}/{uuid}-{filename}`.
-- The student_id is the SECOND path segment, extracted via
-- (string_to_array(name, '/'))[2]::uuid in policies.
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('portfolio-files', 'portfolio-files', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "portfolio-files: owner or staff reads"   ON storage.objects;
DROP POLICY IF EXISTS "portfolio-files: student inserts own"    ON storage.objects;
DROP POLICY IF EXISTS "portfolio-files: student or staff deletes" ON storage.objects;

-- SELECT — owning student (path segment 2 == auth.uid()) OR staff.
CREATE POLICY "portfolio-files: owner or staff reads"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'portfolio-files'
    AND (
      public.is_staff((SELECT auth.uid()))
      OR (
        (string_to_array(name, '/'))[2] ~ '^[0-9a-fA-F-]{36}$'
        AND ((string_to_array(name, '/'))[2])::uuid = (SELECT auth.uid())
      )
    )
  );

-- INSERT — only the owning student can upload into their own folder.
CREATE POLICY "portfolio-files: student inserts own"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'portfolio-files'
    AND (string_to_array(name, '/'))[2] ~ '^[0-9a-fA-F-]{36}$'
    AND ((string_to_array(name, '/'))[2])::uuid = (SELECT auth.uid())
  );

-- DELETE — owning student OR staff (cleanup).
CREATE POLICY "portfolio-files: student or staff deletes"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'portfolio-files'
    AND (
      public.is_staff((SELECT auth.uid()))
      OR (
        (string_to_array(name, '/'))[2] ~ '^[0-9a-fA-F-]{36}$'
        AND ((string_to_array(name, '/'))[2])::uuid = (SELECT auth.uid())
      )
    )
  );


-- =============================================================================
-- END OF MIGRATION 0017_portfolio.sql
-- =============================================================================
