-- 0204_teacher_item_annotations.sql
-- Teacher review annotations — highlights / underlines / per-question notes a
-- teacher makes while reviewing a test (or, later, an assignment) WITH a class.
--
-- Scoping is the point: one row per (teacher, course, item). The same test
-- slug is routinely linked from several courses via module_items; a teacher's
-- annotations for course A must never surface while reviewing with course B.
--
-- Storage is one jsonb map per row (question_id → { highlights[], note }) —
-- the exact client-side AnnotationStore shape (viewer/src/fulltest/
-- annotations.ts) — written whole on a debounce. Row-per-highlight would buy
-- nothing here: annotations are only ever read/written as a set by their
-- author, and the map for a 98-question test measures a few KB.
--
-- Privacy mirrors teacher_student_notes (0062): author-only, even for admins.
-- The husband-and-wife team are both admins and both teach — each keeps their
-- own annotations.

CREATE TABLE IF NOT EXISTS public.teacher_item_annotations (
  teacher_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id   uuid        NOT NULL REFERENCES public.courses(id)  ON DELETE CASCADE,
  -- 'test' keys by test slug; 'assignment' (reserved) keys by assignment uuid.
  item_kind   text        NOT NULL CHECK (item_kind IN ('test', 'assignment')),
  item_key    text        NOT NULL CHECK (char_length(item_key) BETWEEN 1 AND 120),
  -- question_id → { highlights: [{field,start,end,color,deco?}], note }
  annotations jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  -- Soft ceiling: a saved map should never approach this; reject runaway
  -- payloads (a bug, not a use case) before they bloat the row.
  CONSTRAINT teacher_item_annotations_size CHECK (octet_length(annotations::text) <= 262144),
  PRIMARY KEY (teacher_id, course_id, item_kind, item_key)
);

CREATE OR REPLACE TRIGGER trg_teacher_item_annotations_set_updated_at
  BEFORE UPDATE ON public.teacher_item_annotations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.teacher_item_annotations ENABLE ROW LEVEL SECURITY;

-- Author-only on every verb. INSERT additionally requires actually teaching
-- the course (SECURITY DEFINER helper per CLAUDE.md — never inline a profiles
-- EXISTS in WITH CHECK).
DROP POLICY IF EXISTS "item_annotations: author reads" ON public.teacher_item_annotations;
CREATE POLICY "item_annotations: author reads"
  ON public.teacher_item_annotations FOR SELECT
  USING (teacher_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "item_annotations: author inserts" ON public.teacher_item_annotations;
CREATE POLICY "item_annotations: author inserts"
  ON public.teacher_item_annotations FOR INSERT
  WITH CHECK (
    teacher_id = (SELECT auth.uid())
    AND public.is_teacher_of_course((SELECT auth.uid()), course_id)
  );

DROP POLICY IF EXISTS "item_annotations: author updates" ON public.teacher_item_annotations;
CREATE POLICY "item_annotations: author updates"
  ON public.teacher_item_annotations FOR UPDATE
  USING (teacher_id = (SELECT auth.uid()))
  WITH CHECK (teacher_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "item_annotations: author deletes" ON public.teacher_item_annotations;
CREATE POLICY "item_annotations: author deletes"
  ON public.teacher_item_annotations FOR DELETE
  USING (teacher_id = (SELECT auth.uid()));
