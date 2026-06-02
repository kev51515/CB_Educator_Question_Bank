-- 0025_discussions.sql
-- Per-course threaded discussions: topics + posts (with optional nested replies).
--
-- Critical: SELECT/INSERT policies use the SECURITY DEFINER helpers
-- public.is_student_in_class() and public.is_staff() (introduced in 0009 /
-- 0013) rather than inline EXISTS queries against profiles/enrollments. That
-- pattern is what caused the recursion bugs fixed by 0008 and 0013, so we
-- keep policy bodies short and route everything through the helpers. The
-- helper is named "in_class" for legacy reasons even though the URL/table is
-- "course" — see migration 0012.

CREATE TABLE IF NOT EXISTS public.discussion_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  title text NOT NULL,
  body text NOT NULL,
  pinned boolean NOT NULL DEFAULT false,
  locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS discussion_topics_course_idx
  ON public.discussion_topics (course_id, pinned DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS public.discussion_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.discussion_topics(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  body text NOT NULL,
  parent_post_id uuid REFERENCES public.discussion_posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS discussion_posts_topic_idx
  ON public.discussion_posts (topic_id, created_at);

-- updated_at triggers — public.set_updated_at() was introduced earlier
-- (see migrations 0015/0016/0017 which all use it).
CREATE OR REPLACE TRIGGER trg_discussion_topics_updated
  BEFORE UPDATE ON public.discussion_topics
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trg_discussion_posts_updated
  BEFORE UPDATE ON public.discussion_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.discussion_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discussion_posts  ENABLE ROW LEVEL SECURITY;

-- Topics ---------------------------------------------------------------------
DROP POLICY IF EXISTS "topics: enrolled or staff reads" ON public.discussion_topics;
CREATE POLICY "topics: enrolled or staff reads"
  ON public.discussion_topics FOR SELECT
  USING (
    public.is_student_in_class((SELECT auth.uid()), course_id)
    OR public.is_staff((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "topics: enrolled or staff writes" ON public.discussion_topics;
CREATE POLICY "topics: enrolled or staff writes"
  ON public.discussion_topics FOR INSERT
  WITH CHECK (
    (
      public.is_student_in_class((SELECT auth.uid()), course_id)
      OR public.is_staff((SELECT auth.uid()))
    )
    AND author_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "topics: author or staff updates" ON public.discussion_topics;
CREATE POLICY "topics: author or staff updates"
  ON public.discussion_topics FOR UPDATE
  USING (author_id = (SELECT auth.uid()) OR public.is_staff((SELECT auth.uid())))
  WITH CHECK (author_id = (SELECT auth.uid()) OR public.is_staff((SELECT auth.uid())));

DROP POLICY IF EXISTS "topics: author or staff deletes" ON public.discussion_topics;
CREATE POLICY "topics: author or staff deletes"
  ON public.discussion_topics FOR DELETE
  USING (author_id = (SELECT auth.uid()) OR public.is_staff((SELECT auth.uid())));

-- Posts ----------------------------------------------------------------------
-- Reads inherit from the topic's course — we look up the topic row and let
-- its RLS-aware course membership decide. Posts themselves don't carry
-- course_id to avoid denormalization drift.
DROP POLICY IF EXISTS "posts: course members read" ON public.discussion_posts;
CREATE POLICY "posts: course members read"
  ON public.discussion_posts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.discussion_topics t
      WHERE t.id = topic_id
        AND (
          public.is_student_in_class((SELECT auth.uid()), t.course_id)
          OR public.is_staff((SELECT auth.uid()))
        )
    )
  );

DROP POLICY IF EXISTS "posts: course members write" ON public.discussion_posts;
CREATE POLICY "posts: course members write"
  ON public.discussion_posts FOR INSERT
  WITH CHECK (
    author_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.discussion_topics t
      WHERE t.id = topic_id
        AND t.locked = false
        AND (
          public.is_student_in_class((SELECT auth.uid()), t.course_id)
          OR public.is_staff((SELECT auth.uid()))
        )
    )
  );

DROP POLICY IF EXISTS "posts: author or staff updates" ON public.discussion_posts;
CREATE POLICY "posts: author or staff updates"
  ON public.discussion_posts FOR UPDATE
  USING (author_id = (SELECT auth.uid()) OR public.is_staff((SELECT auth.uid())))
  WITH CHECK (author_id = (SELECT auth.uid()) OR public.is_staff((SELECT auth.uid())));

DROP POLICY IF EXISTS "posts: author or staff deletes" ON public.discussion_posts;
CREATE POLICY "posts: author or staff deletes"
  ON public.discussion_posts FOR DELETE
  USING (author_id = (SELECT auth.uid()) OR public.is_staff((SELECT auth.uid())));
