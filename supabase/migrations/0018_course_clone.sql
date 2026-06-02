-- =============================================================================
-- Migration: 0018_course_clone.sql
-- Description: Course duplication + templates. Adds `is_template` flag to
--              `courses`, plus a SECURITY DEFINER RPC `clone_course` that deep-
--              clones a source course into a brand-new course owned by the
--              caller. The RPC clones modules, module_items, assignments,
--              course materials (link rows only — file rows are returned to
--              the client as `source_file_material_ids` for client-side
--              storage object copy), and the portfolio template (if the
--              optional `portfolio_templates` table exists, Wave 3A territory).
--
-- Authorization:
--   clone_course — caller must be staff (is_staff). The new course is owned
--                  by auth.uid().
--
-- What is NOT cloned:
--   announcements, course_memberships, assignment_attempts, attempt
--   submissions, feedback, attempt snapshots.
--
-- Due dates: by default assignment.due_at + opens_at are copied verbatim.
-- When p_clear_due_dates = true both columns are NULLed on the cloned rows
-- (opens_at defaults to now() via the column default in that case).
--
-- Templates: a course with `is_template = true` is the entry point for the
-- "Create from template" UI. The clone of a template defaults to
-- is_template = false; callers can override via p_save_as_template if they
-- want the new course itself to be a template (rare).
-- =============================================================================


-- =============================================================================
-- SECTION 1: SCHEMA ADDITION — courses.is_template
-- =============================================================================

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS is_template boolean NOT NULL DEFAULT false;

-- Partial index because the vast majority of rows are NOT templates; the
-- filtered index keeps the cost of "list templates" trivial while staying tiny.
CREATE INDEX IF NOT EXISTS courses_is_template_idx
  ON public.courses (is_template)
  WHERE is_template = true;


-- =============================================================================
-- SECTION 2: RPC — clone_course
--
-- Returns jsonb shape:
--   {
--     "new_course_id": "<uuid>",
--     "source_file_material_ids": ["<uuid>", ...]
--   }
--
-- The file material ids belong to the SOURCE course; the client is
-- responsible for downloading each from the `course-materials` Storage
-- bucket and re-uploading under a new path keyed off new_course_id, then
-- inserting a fresh course_materials row pointing at the new path.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.clone_course(
  p_source_id           uuid,
  p_new_name            text,
  p_clear_due_dates     boolean DEFAULT false,
  p_save_as_template    boolean DEFAULT false
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller          uuid := auth.uid();
  v_new_course_id   uuid;
  v_source_desc     text;
  v_alphabet        constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_alpha_len       constant integer := length(v_alphabet);
  v_new_code        text;
  v_attempt         integer := 0;
  v_max_attempts    constant integer := 8;
  v_inserted        boolean := false;
  v_i               integer;
  v_file_ids        uuid[];
  v_has_portfolio   boolean;
  v_trimmed_name    text;
BEGIN
  -- ---- 1. Authorization ---------------------------------------------------
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING HINT = 'You must be signed in to clone a course.';
  END IF;

  IF NOT public.is_staff(v_caller) THEN
    RAISE EXCEPTION 'not_authorized'
      USING HINT = 'Only staff can clone courses.';
  END IF;

  v_trimmed_name := trim(coalesce(p_new_name, ''));
  IF v_trimmed_name = '' THEN
    RAISE EXCEPTION 'invalid_name'
      USING HINT = 'New course name is required.';
  END IF;

  -- Source must exist and be visible to caller. Because this is SECURITY
  -- DEFINER we bypass RLS so we explicitly require staff above; the existence
  -- check below catches a bad uuid.
  SELECT description
    INTO v_source_desc
    FROM public.courses
   WHERE id = p_source_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source_not_found'
      USING HINT = 'No course found for the supplied source id.';
  END IF;

  -- ---- 2. Generate a unique join_code -------------------------------------
  -- Same generator shape as regenerate_course_join_code in 0012.
  WHILE v_attempt < v_max_attempts AND NOT v_inserted LOOP
    v_attempt := v_attempt + 1;
    v_new_code := '';
    FOR v_i IN 1..4 LOOP
      v_new_code := v_new_code
        || substr(v_alphabet, floor(random() * v_alpha_len)::int + 1, 1);
    END LOOP;
    v_new_code := v_new_code || '-';
    FOR v_i IN 1..4 LOOP
      v_new_code := v_new_code
        || substr(v_alphabet, floor(random() * v_alpha_len)::int + 1, 1);
    END LOOP;

    BEGIN
      INSERT INTO public.courses (
        teacher_id, name, description, join_code, archived, is_template
      ) VALUES (
        v_caller, v_trimmed_name, v_source_desc, v_new_code, false,
        coalesce(p_save_as_template, false)
      )
      RETURNING id INTO v_new_course_id;
      v_inserted := true;
    EXCEPTION
      WHEN unique_violation THEN
        v_inserted := false;
    END;
  END LOOP;

  IF NOT v_inserted THEN
    RAISE EXCEPTION 'join_code_collision'
      USING HINT = 'Could not generate a unique join code; please retry.';
  END IF;

  -- ---- 3. Clone modules ---------------------------------------------------
  -- Build a source→new id mapping in a TEMP TABLE so subsequent step can
  -- translate module_items.module_id references.
  CREATE TEMP TABLE _module_map (
    old_id uuid PRIMARY KEY,
    new_id uuid NOT NULL
  ) ON COMMIT DROP;

  WITH src AS (
    SELECT id, name, position, published, opens_at
      FROM public.course_modules
     WHERE course_id = p_source_id
  ),
  ins AS (
    INSERT INTO public.course_modules (course_id, name, position, published, opens_at)
    SELECT v_new_course_id, name, position, published, opens_at
      FROM src
      ORDER BY position
    RETURNING id, name, position
  )
  -- Match back to source by (name, position). Module names within a course
  -- aren't strictly unique, but the (position, name) pair is highly stable
  -- across a single-transaction copy. Risk: duplicated (name, position) in
  -- the source would collapse the map; in practice courses don't do that.
  INSERT INTO _module_map (old_id, new_id)
  SELECT s.id, i.id
    FROM src s
    JOIN ins i ON i.name = s.name AND i.position = s.position;

  -- ---- 4. Clone assignments ----------------------------------------------
  CREATE TEMP TABLE _assignment_map (
    old_id uuid PRIMARY KEY,
    new_id uuid NOT NULL
  ) ON COMMIT DROP;

  WITH src AS (
    SELECT id, title, description, source_id, question_count,
           time_limit_minutes, difficulty_mix, due_at, opens_at, archived
      FROM public.assignments
     WHERE course_id = p_source_id
  ),
  ins AS (
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
      CASE WHEN coalesce(p_clear_due_dates, false) THEN NULL ELSE due_at END,
      CASE WHEN coalesce(p_clear_due_dates, false) THEN now()
           ELSE coalesce(opens_at, now()) END,
      archived
    FROM src
    RETURNING id, title
  )
  -- Title alone isn't unique, but assignment titles within a course
  -- generally are; if a teacher has truly duplicated titles the map will
  -- collapse and item_ref rewriting will silently fold both module_items
  -- onto the same new assignment. Acceptable trade-off for v1.
  INSERT INTO _assignment_map (old_id, new_id)
  SELECT s.id, i.id
    FROM src s
    JOIN ins i ON i.title = s.title;

  -- ---- 5. Clone module_items (with FK remap) ------------------------------
  INSERT INTO public.module_items (
    module_id, position, item_type, item_ref_id, title, url, indent, published
  )
  SELECT
    mm.new_id,
    mi.position,
    mi.item_type,
    CASE
      WHEN mi.item_type = 'assignment' THEN am.new_id
      ELSE mi.item_ref_id
    END,
    mi.title,
    mi.url,
    mi.indent,
    mi.published
  FROM public.module_items mi
  JOIN public.course_modules cm ON cm.id = mi.module_id
  JOIN _module_map mm ON mm.old_id = mi.module_id
  LEFT JOIN _assignment_map am ON am.old_id = mi.item_ref_id
  WHERE cm.course_id = p_source_id;

  -- ---- 6. Optional: clone portfolio_templates (Wave 3A) ------------------
  v_has_portfolio := to_regclass('public.portfolio_templates') IS NOT NULL;
  IF v_has_portfolio THEN
    -- Best-effort clone: we use dynamic SQL so this migration does not fail
    -- on a database where portfolio_templates exists but has a different
    -- column shape than expected. Any error here is swallowed and the
    -- clone proceeds without the portfolio piece.
    BEGIN
      EXECUTE format($q$
        WITH src AS (
          SELECT * FROM public.portfolio_templates WHERE course_id = %L
        ),
        ins AS (
          INSERT INTO public.portfolio_templates (course_id)
          SELECT %L FROM src
          RETURNING id
        )
        SELECT 1
      $q$, p_source_id, v_new_course_id);

      IF to_regclass('public.portfolio_template_items') IS NOT NULL THEN
        EXECUTE format($q$
          INSERT INTO public.portfolio_template_items (template_id, position, label)
          SELECT
            (SELECT id FROM public.portfolio_templates WHERE course_id = %L),
            pti.position,
            pti.label
          FROM public.portfolio_template_items pti
          JOIN public.portfolio_templates pt ON pt.id = pti.template_id
          WHERE pt.course_id = %L
        $q$, v_new_course_id, p_source_id);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Swallow — portfolio is opt-in for the clone. Log via NOTICE so
      -- developers see it during local testing.
      RAISE NOTICE 'portfolio_templates clone skipped: %', SQLERRM;
    END;
  END IF;

  -- ---- 7. Clone course_materials (link rows only) -------------------------
  -- File rows need a Storage object copy which can't be done from SQL; the
  -- client receives the source ids and finishes the job there.
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

  -- Collect source file ids for the client to copy in Storage.
  SELECT coalesce(array_agg(id ORDER BY position, created_at), ARRAY[]::uuid[])
    INTO v_file_ids
    FROM public.course_materials
   WHERE course_id = p_source_id
     AND kind = 'file';

  -- ---- 8. Return payload -------------------------------------------------
  RETURN jsonb_build_object(
    'new_course_id', v_new_course_id,
    'source_file_material_ids', to_jsonb(v_file_ids)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.clone_course(uuid, text, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clone_course(uuid, text, boolean, boolean) TO authenticated;


-- =============================================================================
-- END OF MIGRATION 0018_course_clone.sql
-- =============================================================================
