-- =============================================================================
-- Migration: 0011_modules.sql
-- Description: Canvas-style Modules: the primary unit of content organization
--              inside a course. Two tables: course_modules (the collapsible
--              "Day 1 / Day 2" sections) and module_items (the rows inside
--              them — assignments, headers, links; pages/files deferred).
--
-- Note on naming: the DB table is still `classes` (Wave 1D will rename to
-- `courses`). New tables use the `course_*` prefix to align with the
-- intended target naming, but the FK still references `classes(id)`.
--
-- Authorization:
--   SELECT — teacher of class OR enrolled student OR staff (mirrors 0004
--            assignments SELECT pattern).
--   INSERT / UPDATE / DELETE — staff only (matches the cross-staff write
--            parity from 0010).
--
-- Two helper RPCs in SECTION 6 (`reorder_modules`, `reorder_module_items`)
-- accept an ordered uuid[] and rewrite the `position` column atomically.
-- SECURITY DEFINER + is_staff guard, so a single round-trip handles drag-
-- and-drop reorder without N writes.
-- =============================================================================


-- =============================================================================
-- SECTION 1: course_modules TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.course_modules (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Why `classes`: the table rename to `courses` is Wave 1D. Until then the
  -- FK target stays `classes(id)`. Client code already uses Course/Module
  -- vocabulary; the DB will catch up.
  class_id    uuid        NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  -- Sort order within a class. Re-sequenced by reorder_modules() so gaps are
  -- fine but the natural state is dense.
  position    integer     NOT NULL DEFAULT 0,
  published   boolean     NOT NULL DEFAULT false,
  -- Optional release date — when non-null, UI treats the module as "scheduled
  -- to open". RLS does NOT enforce this gate yet; it's display-only for v1.
  opens_at    timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_course_modules_class_position
  ON public.course_modules(class_id, position);

CREATE OR REPLACE TRIGGER trg_course_modules_set_updated_at
  BEFORE UPDATE ON public.course_modules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.course_modules ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- SECTION 2: module_items TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.module_items (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id   uuid        NOT NULL REFERENCES public.course_modules(id) ON DELETE CASCADE,
  position    integer     NOT NULL DEFAULT 0,
  -- v1 surface: assignment / header / link. page + file are reserved for a
  -- later migration that introduces the supporting tables.
  item_type   text        NOT NULL
                          CHECK (item_type IN ('assignment','header','link','page','file')),
  -- Soft FK: when item_type='assignment' this references public.assignments.id
  -- and the BEFORE-trigger below verifies the cross-class match. We can't put
  -- a hard FK on it because item_type='header' / 'link' rows have a NULL ref.
  item_ref_id uuid,
  -- Display title; for assignments it's a copy of the assignment.title at
  -- insert time so the teacher can override (e.g., "Week 1 Diagnostic" vs
  -- the assignment's "Reading & Writing Diagnostic").
  title       text        NOT NULL,
  -- Used for item_type='link'. NULL for assignment/header.
  url         text,
  -- 0-5 indent levels matching Canvas. Higher = deeper visual nesting.
  indent      integer     NOT NULL DEFAULT 0 CHECK (indent BETWEEN 0 AND 5),
  published   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_module_items_module_position
  ON public.module_items(module_id, position);

CREATE OR REPLACE TRIGGER trg_module_items_set_updated_at
  BEFORE UPDATE ON public.module_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.module_items ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- SECTION 3: cross-class validation trigger
--
-- When item_type='assignment', item_ref_id MUST point at an assignment whose
-- class_id matches the parent module's class_id. We do this in a BEFORE
-- INSERT OR UPDATE trigger because:
--   (a) the constraint spans two tables (module_items → course_modules →
--       classes vs. assignments → classes), which a CHECK can't express.
--   (b) a hard FK on item_ref_id would forbid the 'header' / 'link' shapes
--       that legitimately carry NULL.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.module_items_validate_assignment_ref()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_module_class_id uuid;
  v_ref_class_id    uuid;
BEGIN
  -- Only assignment rows need the cross-class match. Headers and links carry
  -- a NULL ref by design.
  IF NEW.item_type <> 'assignment' THEN
    RETURN NEW;
  END IF;

  IF NEW.item_ref_id IS NULL THEN
    RAISE EXCEPTION 'mismatched_assignment'
      USING HINT = 'assignment items require item_ref_id';
  END IF;

  SELECT class_id INTO v_module_class_id
    FROM public.course_modules
   WHERE id = NEW.module_id;

  SELECT class_id INTO v_ref_class_id
    FROM public.assignments
   WHERE id = NEW.item_ref_id;

  IF v_module_class_id IS NULL OR v_ref_class_id IS NULL
     OR v_module_class_id <> v_ref_class_id THEN
    RAISE EXCEPTION 'mismatched_assignment'
      USING HINT = 'assignment.class_id must match the module.class_id';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_module_items_validate_assignment_ref
  ON public.module_items;
CREATE TRIGGER trg_module_items_validate_assignment_ref
  BEFORE INSERT OR UPDATE ON public.module_items
  FOR EACH ROW EXECUTE FUNCTION public.module_items_validate_assignment_ref();


-- =============================================================================
-- SECTION 4: RLS POLICIES — course_modules
-- =============================================================================

-- ---- SELECT ----

DROP POLICY IF EXISTS "course_modules: teacher of class reads" ON public.course_modules;
CREATE POLICY "course_modules: teacher of class reads"
  ON public.course_modules
  FOR SELECT
  USING (
    public.is_teacher_of_class((SELECT auth.uid()), class_id)
  );

DROP POLICY IF EXISTS "course_modules: enrolled student reads" ON public.course_modules;
CREATE POLICY "course_modules: enrolled student reads"
  ON public.course_modules
  FOR SELECT
  USING (
    public.is_student_in_class((SELECT auth.uid()), class_id)
  );

DROP POLICY IF EXISTS "course_modules: staff reads all" ON public.course_modules;
CREATE POLICY "course_modules: staff reads all"
  ON public.course_modules
  FOR SELECT
  USING (
    public.is_staff((SELECT auth.uid()))
  );

-- ---- INSERT ----

DROP POLICY IF EXISTS "course_modules: staff inserts" ON public.course_modules;
CREATE POLICY "course_modules: staff inserts"
  ON public.course_modules
  FOR INSERT
  WITH CHECK (
    public.is_staff((SELECT auth.uid()))
  );

-- ---- UPDATE ----

DROP POLICY IF EXISTS "course_modules: staff updates" ON public.course_modules;
CREATE POLICY "course_modules: staff updates"
  ON public.course_modules
  FOR UPDATE
  USING (
    public.is_staff((SELECT auth.uid()))
  )
  WITH CHECK (
    public.is_staff((SELECT auth.uid()))
  );

-- ---- DELETE ----

DROP POLICY IF EXISTS "course_modules: staff deletes" ON public.course_modules;
CREATE POLICY "course_modules: staff deletes"
  ON public.course_modules
  FOR DELETE
  USING (
    public.is_staff((SELECT auth.uid()))
  );


-- =============================================================================
-- SECTION 5: RLS POLICIES — module_items
--
-- SELECT visibility piggybacks on course_modules: a row is visible if the
-- caller can see the parent module. We re-use the same teacher / student /
-- staff helpers, walking item → module → class.
-- =============================================================================

-- ---- SELECT ----

DROP POLICY IF EXISTS "module_items: teacher of class reads" ON public.module_items;
CREATE POLICY "module_items: teacher of class reads"
  ON public.module_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM public.course_modules m
       WHERE m.id = module_items.module_id
         AND public.is_teacher_of_class((SELECT auth.uid()), m.class_id)
    )
  );

DROP POLICY IF EXISTS "module_items: enrolled student reads" ON public.module_items;
CREATE POLICY "module_items: enrolled student reads"
  ON public.module_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM public.course_modules m
       WHERE m.id = module_items.module_id
         AND public.is_student_in_class((SELECT auth.uid()), m.class_id)
    )
  );

DROP POLICY IF EXISTS "module_items: staff reads all" ON public.module_items;
CREATE POLICY "module_items: staff reads all"
  ON public.module_items
  FOR SELECT
  USING (
    public.is_staff((SELECT auth.uid()))
  );

-- ---- INSERT ----

DROP POLICY IF EXISTS "module_items: staff inserts" ON public.module_items;
CREATE POLICY "module_items: staff inserts"
  ON public.module_items
  FOR INSERT
  WITH CHECK (
    public.is_staff((SELECT auth.uid()))
  );

-- ---- UPDATE ----

DROP POLICY IF EXISTS "module_items: staff updates" ON public.module_items;
CREATE POLICY "module_items: staff updates"
  ON public.module_items
  FOR UPDATE
  USING (
    public.is_staff((SELECT auth.uid()))
  )
  WITH CHECK (
    public.is_staff((SELECT auth.uid()))
  );

-- ---- DELETE ----

DROP POLICY IF EXISTS "module_items: staff deletes" ON public.module_items;
CREATE POLICY "module_items: staff deletes"
  ON public.module_items
  FOR DELETE
  USING (
    public.is_staff((SELECT auth.uid()))
  );


-- =============================================================================
-- SECTION 6: helper RPCs — reorder_modules / reorder_module_items
--
-- Both take an ordered uuid[] and rewrite the `position` column to match the
-- array index. SECURITY DEFINER + an explicit is_staff guard so the caller
-- can't bypass RLS. The single statement-style UPDATE uses unnest() WITH
-- ORDINALITY to atomically assign new positions in one pass.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.reorder_modules(
  p_class_id     uuid,
  p_ordered_ids  uuid[]
)
  RETURNS TABLE (
    module_id     uuid,
    class_id      uuid,
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

  -- Why unnest WITH ORDINALITY: it gives us the 1-based array index alongside
  -- each id in a single set, which we then UPDATE against. The WHERE clause
  -- pins us to the requested class so a stray id from another class can't be
  -- silently re-positioned by this call.
  WITH ord AS (
    SELECT t.id, t.idx
      FROM unnest(p_ordered_ids) WITH ORDINALITY AS t(id, idx)
  )
  UPDATE public.course_modules m
     SET position = ord.idx - 1
    FROM ord
   WHERE m.id = ord.id
     AND m.class_id = p_class_id;

  RETURN QUERY
  SELECT m.id AS module_id, m.class_id, m.position AS new_position
    FROM public.course_modules m
   WHERE m.class_id = p_class_id
   ORDER BY m.position;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_modules(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_modules(uuid, uuid[]) TO authenticated;


CREATE OR REPLACE FUNCTION public.reorder_module_items(
  p_module_id    uuid,
  p_ordered_ids  uuid[]
)
  RETURNS TABLE (
    item_id       uuid,
    module_id     uuid,
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
      USING HINT = 'Only staff can reorder module items.';
  END IF;

  WITH ord AS (
    SELECT t.id, t.idx
      FROM unnest(p_ordered_ids) WITH ORDINALITY AS t(id, idx)
  )
  UPDATE public.module_items mi
     SET position = ord.idx - 1
    FROM ord
   WHERE mi.id = ord.id
     AND mi.module_id = p_module_id;

  RETURN QUERY
  SELECT mi.id AS item_id, mi.module_id, mi.position AS new_position
    FROM public.module_items mi
   WHERE mi.module_id = p_module_id
   ORDER BY mi.position;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_module_items(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_module_items(uuid, uuid[]) TO authenticated;


-- =============================================================================
-- END OF MIGRATION 0011_modules.sql
-- =============================================================================
