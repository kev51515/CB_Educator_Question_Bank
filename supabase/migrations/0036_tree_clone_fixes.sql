-- =============================================================================
-- Migration: 0036_tree_clone_fixes.sql
-- Description: Three correctness fixes flagged by the backend wiring audit.
--   (1) Add deferrable UNIQUE constraints on (parent, position) for
--       course_modules, portfolio_items, and module_items so two concurrent
--       moves cannot land on the same slot, while still allowing the
--       multi-row position shuffles done inside a single transaction.
--   (2) Replace duplicate_module() with a recursive version that walks the
--       entire subtree (children + their items), not just the top-level
--       items, using a temp old_id → new_id map.
--   (3) Replace clone_course() with a tree-aware version that preserves the
--       parent_module_id / parent_item_id relationships across the clone for
--       both course_modules and portfolio_items.
-- =============================================================================


-- =============================================================================
-- SECTION 1: Renumber any legacy duplicates so the UNIQUE constraints below
-- can be added. No-op on clean data.
-- =============================================================================

WITH renum AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY course_id, parent_module_id
           ORDER BY position, created_at
         ) AS rn
  FROM public.course_modules
)
UPDATE public.course_modules m
   SET position = renum.rn
  FROM renum
 WHERE m.id = renum.id
   AND m.position IS DISTINCT FROM renum.rn;

WITH renum AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY template_id, parent_item_id
           ORDER BY position, created_at
         ) AS rn
  FROM public.portfolio_items
)
UPDATE public.portfolio_items p
   SET position = renum.rn
  FROM renum
 WHERE p.id = renum.id
   AND p.position IS DISTINCT FROM renum.rn;

WITH renum AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY module_id
           ORDER BY position, created_at
         ) AS rn
  FROM public.module_items
)
UPDATE public.module_items mi
   SET position = renum.rn
  FROM renum
 WHERE mi.id = renum.id
   AND mi.position IS DISTINCT FROM renum.rn;


-- =============================================================================
-- SECTION 2: Deferrable UNIQUE constraints on (parent, position)
-- =============================================================================

ALTER TABLE public.course_modules
  DROP CONSTRAINT IF EXISTS course_modules_position_unique;
ALTER TABLE public.course_modules
  ADD  CONSTRAINT course_modules_position_unique
  UNIQUE (course_id, parent_module_id, position) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.portfolio_items
  DROP CONSTRAINT IF EXISTS portfolio_items_position_unique;
ALTER TABLE public.portfolio_items
  ADD  CONSTRAINT portfolio_items_position_unique
  UNIQUE (template_id, parent_item_id, position) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.module_items
  DROP CONSTRAINT IF EXISTS module_items_position_unique;
ALTER TABLE public.module_items
  ADD  CONSTRAINT module_items_position_unique
  UNIQUE (module_id, position) DEFERRABLE INITIALLY DEFERRED;


-- =============================================================================
-- SECTION 3: Recursive duplicate_module()
-- =============================================================================

CREATE OR REPLACE FUNCTION public.duplicate_module(p_module_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller   uuid := auth.uid();
  v_source   public.course_modules%ROWTYPE;
  v_root_id  uuid;
  v_next_pos int;
  v_new_child uuid;
  r          RECORD;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_staff(v_caller) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT * INTO v_source FROM public.course_modules WHERE id = p_module_id;
  IF v_source.id IS NULL THEN RAISE EXCEPTION 'module_not_found'; END IF;

  -- Next slot among the source's siblings.
  SELECT coalesce(MAX(position), 0) + 1 INTO v_next_pos
    FROM public.course_modules
   WHERE course_id = v_source.course_id
     AND parent_module_id IS NOT DISTINCT FROM v_source.parent_module_id;

  -- old_id -> new_id map for the whole subtree.
  CREATE TEMP TABLE _mod_map (old_id uuid PRIMARY KEY, new_id uuid NOT NULL)
    ON COMMIT DROP;

  -- Root copy at the next sibling slot, name + ' (copy)'.
  INSERT INTO public.course_modules (
    course_id, parent_module_id, name, position, published, opens_at, lock_at
  )
  VALUES (
    v_source.course_id, v_source.parent_module_id,
    v_source.name || ' (copy)', v_next_pos,
    v_source.published, v_source.opens_at, v_source.lock_at
  )
  RETURNING id INTO v_root_id;
  INSERT INTO _mod_map VALUES (v_source.id, v_root_id);

  -- Walk descendants depth-first; insert each and record the id mapping.
  FOR r IN
    WITH RECURSIVE walk AS (
      SELECT m.id, m.parent_module_id, m.course_id, m.name, m.position,
             m.published, m.opens_at, m.lock_at,
             1 AS depth, ARRAY[m.position]::int[] AS path
        FROM public.course_modules m
       WHERE m.parent_module_id = v_source.id
      UNION ALL
      SELECT m.id, m.parent_module_id, m.course_id, m.name, m.position,
             m.published, m.opens_at, m.lock_at,
             w.depth + 1, w.path || m.position
        FROM public.course_modules m
        JOIN walk w ON m.parent_module_id = w.id
    )
    SELECT * FROM walk ORDER BY depth, position
  LOOP
    INSERT INTO public.course_modules (
      course_id, parent_module_id, name, position, published, opens_at, lock_at
    )
    VALUES (
      r.course_id,
      (SELECT new_id FROM _mod_map WHERE old_id = r.parent_module_id),
      r.name, r.position, r.published, r.opens_at, r.lock_at
    )
    RETURNING id INTO v_new_child;
    INSERT INTO _mod_map VALUES (r.id, v_new_child);
  END LOOP;

  -- Copy items for every module in the map.
  INSERT INTO public.module_items (
    module_id, position, item_type, item_ref_id, title, url, indent, published
  )
  SELECT mm.new_id, mi.position, mi.item_type, mi.item_ref_id,
         mi.title, mi.url, mi.indent, mi.published
    FROM public.module_items mi
    JOIN _mod_map mm ON mm.old_id = mi.module_id;

  RETURN v_root_id;
END;
$$;
REVOKE ALL ON FUNCTION public.duplicate_module(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.duplicate_module(uuid) TO authenticated;


-- =============================================================================
-- SECTION 4: Tree-aware clone_course()
--
-- Rewritten in the LOOP style used by duplicate_module above so the
-- old_id → new_id mapping is reliable. Both course_modules and
-- portfolio_items are cloned level-by-level, with parent_*_id remapped
-- via the temp maps.
-- =============================================================================

DROP FUNCTION IF EXISTS public.clone_course(uuid, text, boolean, boolean);
CREATE FUNCTION public.clone_course(
  p_source_id        uuid,
  p_new_name         text,
  p_clear_due_dates  boolean DEFAULT false,
  p_save_as_template boolean DEFAULT false
)
RETURNS TABLE (new_course_id uuid, source_file_material_ids uuid[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller        uuid := auth.uid();
  v_new_course_id uuid;
  v_new_join_code text;
  v_source_desc   text;
  v_file_ids      uuid[];
  v_src_tpl_id    uuid;
  v_new_tpl_id    uuid;
  v_new_id        uuid;
  r               RECORD;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_staff(v_caller) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT description INTO v_source_desc
    FROM public.courses WHERE id = p_source_id;
  IF v_source_desc IS NULL AND NOT EXISTS (
    SELECT 1 FROM public.courses WHERE id = p_source_id
  ) THEN
    RAISE EXCEPTION 'source_not_found';
  END IF;

  v_new_join_code := upper(translate(substr(md5(random()::text), 1, 8),
                                     'O0IL1', 'XAYZB'));

  INSERT INTO public.courses (
    teacher_id, name, description, join_code, archived, is_template
  )
  VALUES (
    v_caller, p_new_name, v_source_desc, v_new_join_code, false, p_save_as_template
  )
  RETURNING id INTO v_new_course_id;

  -- ---- Modules: clone the tree level-by-level, remap parent_module_id -----
  CREATE TEMP TABLE _module_map (old_id uuid PRIMARY KEY, new_id uuid NOT NULL)
    ON COMMIT DROP;

  -- Walk source modules depth-first; insert each with mapped parent_module_id.
  FOR r IN
    WITH RECURSIVE walk AS (
      SELECT m.id, m.parent_module_id, m.course_id, m.name, m.position,
             m.published, m.opens_at, m.lock_at,
             1 AS depth, ARRAY[m.position]::int[] AS path
        FROM public.course_modules m
       WHERE m.course_id = p_source_id
         AND m.parent_module_id IS NULL
      UNION ALL
      SELECT m.id, m.parent_module_id, m.course_id, m.name, m.position,
             m.published, m.opens_at, m.lock_at,
             w.depth + 1, w.path || m.position
        FROM public.course_modules m
        JOIN walk w ON m.parent_module_id = w.id
       WHERE m.course_id = p_source_id
    )
    SELECT * FROM walk ORDER BY depth, position
  LOOP
    INSERT INTO public.course_modules (
      course_id, parent_module_id, name, position, published, opens_at, lock_at
    )
    VALUES (
      v_new_course_id,
      (SELECT new_id FROM _module_map WHERE old_id = r.parent_module_id),
      r.name, r.position, r.published, r.opens_at, r.lock_at
    )
    RETURNING id INTO v_new_id;
    INSERT INTO _module_map VALUES (r.id, v_new_id);
  END LOOP;

  -- ---- Assignments: clone with optional due-date clearing -----------------
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

  -- ---- Module items: clone, remap module_id + item_ref_id (assignments) --
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

  -- ---- Portfolio: clone template + items as a tree ------------------------
  SELECT id INTO v_src_tpl_id
    FROM public.portfolio_templates
   WHERE course_id = p_source_id;

  IF v_src_tpl_id IS NOT NULL THEN
    INSERT INTO public.portfolio_templates (course_id, name, description, published)
    SELECT v_new_course_id, name, description, published
      FROM public.portfolio_templates
     WHERE id = v_src_tpl_id
    RETURNING id INTO v_new_tpl_id;

    CREATE TEMP TABLE _portfolio_item_map (old_id uuid PRIMARY KEY, new_id uuid NOT NULL)
      ON COMMIT DROP;

    FOR r IN
      WITH RECURSIVE walk AS (
        SELECT pi.id, pi.parent_item_id, pi.template_id, pi.position,
               pi.title, pi.prompt, pi.item_type, pi.required, pi.due_at, pi.settings,
               1 AS depth, ARRAY[pi.position]::int[] AS path
          FROM public.portfolio_items pi
         WHERE pi.template_id = v_src_tpl_id
           AND pi.parent_item_id IS NULL
        UNION ALL
        SELECT pi.id, pi.parent_item_id, pi.template_id, pi.position,
               pi.title, pi.prompt, pi.item_type, pi.required, pi.due_at, pi.settings,
               w.depth + 1, w.path || pi.position
          FROM public.portfolio_items pi
          JOIN walk w ON pi.parent_item_id = w.id
         WHERE pi.template_id = v_src_tpl_id
      )
      SELECT * FROM walk ORDER BY depth, position
    LOOP
      INSERT INTO public.portfolio_items (
        template_id, parent_item_id, position, title, prompt,
        item_type, required, due_at, settings
      )
      VALUES (
        v_new_tpl_id,
        (SELECT new_id FROM _portfolio_item_map WHERE old_id = r.parent_item_id),
        r.position, r.title, r.prompt, r.item_type, r.required,
        CASE WHEN p_clear_due_dates THEN NULL ELSE r.due_at END,
        r.settings
      )
      RETURNING id INTO v_new_id;
      INSERT INTO _portfolio_item_map VALUES (r.id, v_new_id);
    END LOOP;
  END IF;

  -- ---- Course materials: link rows only -----------------------------------
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

  SELECT coalesce(array_agg(id ORDER BY position, created_at), ARRAY[]::uuid[])
    INTO v_file_ids
    FROM public.course_materials
   WHERE course_id = p_source_id AND kind = 'file';

  RETURN QUERY SELECT v_new_course_id, v_file_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.clone_course(uuid, text, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clone_course(uuid, text, boolean, boolean) TO authenticated;


-- =============================================================================
-- END OF MIGRATION 0036_tree_clone_fixes.sql
-- =============================================================================
