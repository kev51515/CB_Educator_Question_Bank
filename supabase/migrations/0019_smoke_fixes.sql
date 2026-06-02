-- =============================================================================
-- Migration: 0019_smoke_fixes.sql
-- Description: Three bug fixes surfaced by smoke-features.mjs.
--
--   (1) Wave 1D rename regression: the trigger function
--       `module_items_validate_assignment_ref()` from 0011 still references
--       `class_id` on `courses` and `assignments`. Migration 0012 renamed
--       those columns to `course_id` but didn't update this trigger body.
--       Any INSERT into module_items raises "column class_id does not exist".
--
--   (2) `portfolio_items.settings` was NOT NULL with DEFAULT '{}'. PostgREST
--       batch inserts use the union of keys and write explicit NULL for
--       missing fields, defeating the DEFAULT. Relax the constraint: keep
--       the DEFAULT, drop NOT NULL. Existing rows already comply.
--
--   (3) The portfolio clone block in 0018's `clone_course()` was written
--       against a guessed portfolio schema (`portfolio_template_items`,
--       columns `label`, ...). The actual schema (0017) is `portfolio_items`
--       with `title/prompt/item_type/required/due_at/settings`. The block
--       silently swallowed errors via EXCEPTION WHEN OTHERS, so clones
--       returned an id but did not actually carry the portfolio. Rewrite
--       the block to match the real schema.
-- =============================================================================


-- =============================================================================
-- 1. Fix module_items_validate_assignment_ref()
-- =============================================================================

CREATE OR REPLACE FUNCTION public.module_items_validate_assignment_ref()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_module_course_id uuid;
  v_ref_course_id    uuid;
BEGIN
  -- Only assignment items carry a meaningful ref into another table.
  IF NEW.item_type <> 'assignment' THEN
    RETURN NEW;
  END IF;

  IF NEW.item_ref_id IS NULL THEN
    RAISE EXCEPTION 'item_ref_id required for assignment items'
      USING HINT = 'set item_ref_id to an assignment.id in the same course';
  END IF;

  SELECT course_id INTO v_module_course_id
  FROM public.course_modules
  WHERE id = NEW.module_id;

  SELECT course_id INTO v_ref_course_id
  FROM public.assignments
  WHERE id = NEW.item_ref_id;

  IF v_module_course_id IS NULL OR v_ref_course_id IS NULL
     OR v_module_course_id <> v_ref_course_id THEN
    RAISE EXCEPTION 'mismatched_assignment'
      USING HINT = 'assignment.course_id must match the module.course_id';
  END IF;

  RETURN NEW;
END;
$$;


-- =============================================================================
-- 2. portfolio_items.settings: allow NULL (DEFAULT '{}' still applies for
--    single-row inserts that omit the column entirely).
-- =============================================================================

ALTER TABLE public.portfolio_items
  ALTER COLUMN settings DROP NOT NULL;


-- =============================================================================
-- 3. Rewrite portfolio clone block inside clone_course().
--    We CREATE OR REPLACE the whole function with a corrected portfolio
--    section. The rest of the body is preserved verbatim from 0018; if a
--    future migration further evolves the function, it must respect this
--    portfolio block too.
-- =============================================================================

DROP FUNCTION IF EXISTS public.clone_course(uuid, text, boolean, boolean);
CREATE FUNCTION public.clone_course(
  p_source_id          uuid,
  p_new_name           text,
  p_clear_due_dates    boolean DEFAULT false,
  p_save_as_template   boolean DEFAULT false
)
RETURNS TABLE (new_course_id uuid, source_file_material_ids uuid[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller          uuid := auth.uid();
  v_new_course_id   uuid;
  v_new_join_code   text;
  v_source_desc     text;
  v_file_ids        uuid[];
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT public.is_staff(v_caller) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  -- Pull source description for carry-over.
  SELECT description INTO v_source_desc
  FROM public.courses WHERE id = p_source_id;
  IF v_source_desc IS NULL AND NOT EXISTS (
    SELECT 1 FROM public.courses WHERE id = p_source_id
  ) THEN
    RAISE EXCEPTION 'source_not_found';
  END IF;

  -- Unambiguous join_code; retry on the (very rare) collision.
  v_new_join_code := upper(translate(substr(md5(random()::text), 1, 8),
                                     'O0IL1', 'XAYZB'));

  INSERT INTO public.courses (
    teacher_id, name, description, join_code, archived, is_template
  )
  VALUES (
    v_caller, p_new_name, v_source_desc, v_new_join_code, false, p_save_as_template
  )
  RETURNING id INTO v_new_course_id;

  -- ---- 2. Modules: clone with new ids, preserve positions ------------------
  CREATE TEMP TABLE _module_map (old_id uuid PRIMARY KEY, new_id uuid NOT NULL)
    ON COMMIT DROP;

  WITH ins AS (
    INSERT INTO public.course_modules (
      course_id, name, position, published, opens_at
    )
    SELECT v_new_course_id, name, position, published, opens_at
    FROM public.course_modules
    WHERE course_id = p_source_id
    RETURNING id, position
  ),
  src AS (
    SELECT id, position FROM public.course_modules WHERE course_id = p_source_id
  )
  INSERT INTO _module_map (old_id, new_id)
  SELECT s.id, i.id
  FROM src s
  JOIN ins i ON i.position = s.position;

  -- ---- 3. Assignments: clone with optional due-date clearing ---------------
  CREATE TEMP TABLE _assignment_map (old_id uuid PRIMARY KEY, new_id uuid NOT NULL)
    ON COMMIT DROP;

  WITH ins AS (
    INSERT INTO public.assignments (
      course_id, created_by, title, description, source_id, question_count,
      time_limit_minutes, difficulty_mix, due_at, opens_at, archived
    )
    SELECT
      v_new_course_id,
      v_caller,
      title,
      description,
      source_id,
      question_count,
      time_limit_minutes,
      difficulty_mix,
      CASE WHEN p_clear_due_dates THEN NULL ELSE due_at END,
      CASE WHEN p_clear_due_dates THEN now() ELSE opens_at END,
      false
    FROM public.assignments
    WHERE course_id = p_source_id
    RETURNING id, title
  ),
  src AS (
    SELECT id, title FROM public.assignments WHERE course_id = p_source_id
  )
  INSERT INTO _assignment_map (old_id, new_id)
  SELECT s.id, i.id
  FROM src s
  JOIN ins i ON i.title = s.title;

  -- ---- 4. Module items: clone, remap module_id + item_ref_id (assignments) -
  INSERT INTO public.module_items (
    module_id, position, item_type, item_ref_id, title, url, indent, published
  )
  SELECT
    mm.new_id,
    mi.position,
    mi.item_type,
    COALESCE(am.new_id, mi.item_ref_id),
    mi.title,
    mi.url,
    mi.indent,
    mi.published
  FROM public.module_items mi
  JOIN public.course_modules cm ON cm.id = mi.module_id
  JOIN _module_map mm ON mm.old_id = mi.module_id
  LEFT JOIN _assignment_map am ON am.old_id = mi.item_ref_id
  WHERE cm.course_id = p_source_id;

  -- ---- 5. Portfolio: clone template (one row per course) + items -----------
  -- Real schema from migration 0017:
  --   portfolio_templates(id, course_id UNIQUE, name, description, published, …)
  --   portfolio_items(id, template_id, position, title, prompt, item_type,
  --                   required, due_at, settings, …)
  IF EXISTS (
    SELECT 1 FROM public.portfolio_templates WHERE course_id = p_source_id
  ) THEN
    WITH src AS (
      SELECT id, name, description, published
      FROM public.portfolio_templates
      WHERE course_id = p_source_id
    ),
    new_tpl AS (
      INSERT INTO public.portfolio_templates (course_id, name, description, published)
      SELECT v_new_course_id, name, description, published
      FROM src
      RETURNING id
    )
    INSERT INTO public.portfolio_items (
      template_id, position, title, prompt, item_type, required, due_at, settings
    )
    SELECT
      (SELECT id FROM new_tpl),
      pi.position,
      pi.title,
      pi.prompt,
      pi.item_type,
      pi.required,
      CASE WHEN p_clear_due_dates THEN NULL ELSE pi.due_at END,
      pi.settings
    FROM public.portfolio_items pi
    WHERE pi.template_id = (SELECT id FROM src);
  END IF;

  -- ---- 6. Course materials: link rows only -----------------------------
  INSERT INTO public.course_materials (
    course_id, uploader_id, kind, title, description, url, file_path,
    file_size, mime_type, position, published
  )
  SELECT
    v_new_course_id, v_caller, 'link', title, description, url, NULL,
    NULL, NULL, position, published
  FROM public.course_materials
  WHERE course_id = p_source_id
    AND kind = 'link';

  -- ---- 7. Collect file material ids for the client ---------------------
  SELECT coalesce(array_agg(id ORDER BY position, created_at), ARRAY[]::uuid[])
    INTO v_file_ids
  FROM public.course_materials
  WHERE course_id = p_source_id AND kind = 'file';

  RETURN QUERY SELECT v_new_course_id, v_file_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.clone_course(uuid, text, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clone_course(uuid, text, boolean, boolean) TO authenticated;
