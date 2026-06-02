-- =============================================================================
-- Migration: 0063_portfolio_import.sql
-- Description: Cross-course portfolio item import. A teacher who owns BOTH the
--   source course AND the target course can deep-clone selected portfolio
--   items (including their subtrees) from one course's template into another.
--   Student submissions and feedback are NOT cloned — this is a template-level
--   operation. The cloned items get fresh uuids and are appended at the end
--   of the target template's existing items at each depth (max(position) + N).
--
-- WHY:
--   Workstream B of the May-2026 wider-workflow audit identified portfolio
--   item reuse as a top friction point — teachers running multiple SAT
--   prep cohorts re-create the same "personal statement / activities list /
--   letters of rec" checklist by hand for every new course. The existing
--   course-clone (mig 0018) only fires at course creation; this RPC lets a
--   teacher pull items into a LIVE course on demand.
--
-- WATCH-OUTS (documented per CLAUDE.md migration drift discipline):
--   - SECURITY DEFINER + SET search_path: required, mirrors 0035 conventions
--     so RLS doesn't block the cross-template INSERT.
--   - We authorize via is_teacher_of_class against BOTH source and target —
--     NOT just is_staff — so an admin who teaches neither can't trigger.
--     (Admins who teach can; admins who don't teach can't.)
--   - Two-pass copy: pass 1 inserts items into a temp mapping; pass 2 rewrites
--     parent_item_id from old → new id. Without pass 2 the cloned subtree
--     would still point at the SOURCE template's parents.
--   - Positions in the target template start at (max(target.position at that
--     level) + 1) and increment per inserted root sibling, preserving the
--     source's intra-subtree ordering verbatim.
--   - Idempotency: re-running mints fresh uuids each time. That's expected —
--     the operator is responsible for not clicking twice. Audit log shows
--     duplicates.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.import_portfolio_items(
  p_source_template_id uuid,
  p_target_template_id uuid,
  p_item_ids           uuid[]
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller             uuid := auth.uid();
  v_source_course_id   uuid;
  v_target_course_id   uuid;
  v_imported           integer := 0;
  v_root_base_position integer;
  v_root_count         integer := 0;
  v_row                record;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Defensive: reject self-import (no behavioral reason to clone into self,
  -- and silently doubling items is a footgun).
  IF p_source_template_id = p_target_template_id THEN
    RAISE EXCEPTION 'same_template';
  END IF;

  -- Empty list → nothing to do.
  IF p_item_ids IS NULL OR coalesce(array_length(p_item_ids, 1), 0) = 0 THEN
    RETURN 0;
  END IF;

  -- ---- Authorization: caller must teach BOTH source and target courses ----
  SELECT course_id INTO v_source_course_id
    FROM public.portfolio_templates
   WHERE id = p_source_template_id;
  IF v_source_course_id IS NULL THEN
    RAISE EXCEPTION 'source_not_found';
  END IF;

  SELECT course_id INTO v_target_course_id
    FROM public.portfolio_templates
   WHERE id = p_target_template_id;
  IF v_target_course_id IS NULL THEN
    RAISE EXCEPTION 'target_not_found';
  END IF;

  IF NOT public.is_teacher_of_class(v_caller, v_source_course_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF NOT public.is_teacher_of_class(v_caller, v_target_course_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  -- ---- Resolve roots: validate each picked id belongs to source template --
  -- We tolerate caller passing a child item id — it just imports that subtree
  -- with the child becoming a new root in the target. (Discard duplicates.)
  CREATE TEMP TABLE _import_roots ON COMMIT DROP AS
  SELECT DISTINCT pi.id
    FROM public.portfolio_items pi
   WHERE pi.template_id = p_source_template_id
     AND pi.id = ANY (p_item_ids);

  IF NOT EXISTS (SELECT 1 FROM _import_roots) THEN
    -- All ids invalid (wrong template). Don't raise — return 0 so the caller
    -- can surface "nothing to import" if they want to.
    RETURN 0;
  END IF;

  -- ---- Compute the next root-level position in the target ---------------
  -- Sibling positions in a level are not guaranteed gap-free, so we take max.
  SELECT coalesce(max(position), 0) INTO v_root_base_position
    FROM public.portfolio_items
   WHERE template_id = p_target_template_id
     AND parent_item_id IS NULL;

  -- ---- Collect descendants of each picked root --------------------------
  -- Recursive CTE walks down. We capture old id, old parent, depth, and
  -- the root-rank (1..N) of the originating picked root so that the
  -- subtree's root-level position can be re-anchored cleanly in the target.
  CREATE TEMP TABLE _import_walk ON COMMIT DROP AS
  WITH RECURSIVE roots AS (
    SELECT pi.*,
           row_number() OVER (ORDER BY pi.position, pi.id) AS root_rank,
           0::int                                          AS depth
      FROM public.portfolio_items pi
      JOIN _import_roots r ON r.id = pi.id
  ),
  walk AS (
    SELECT r.id, r.template_id, r.position, r.title, r.prompt, r.item_type,
           r.required, r.due_at, r.settings, r.parent_item_id,
           r.root_rank, r.depth
      FROM roots r
    UNION ALL
    SELECT pi.id, pi.template_id, pi.position, pi.title, pi.prompt, pi.item_type,
           pi.required, pi.due_at, pi.settings, pi.parent_item_id,
           w.root_rank, w.depth + 1
      FROM public.portfolio_items pi
      JOIN walk w ON pi.parent_item_id = w.id
     WHERE pi.template_id = p_source_template_id
  )
  SELECT * FROM walk;

  -- ---- ID map: old_id → new_id ------------------------------------------
  -- gen_random_uuid() is stable per row (one call per row, no replays), so
  -- this gives us the canonical map for pass 2.
  CREATE TEMP TABLE _import_idmap ON COMMIT DROP AS
  SELECT w.id AS old_id,
         gen_random_uuid() AS new_id,
         w.root_rank,
         w.depth,
         w.position AS old_position,
         w.parent_item_id AS old_parent_id,
         w.title, w.prompt, w.item_type, w.required, w.due_at, w.settings
    FROM _import_walk w;

  -- ---- Pass 1: insert all new items with parent_item_id = NULL ----------
  -- Roots get position = base + root_rank. Non-roots keep their source
  -- position (intra-subtree ordering preserved); they'll get their parent
  -- patched in pass 2.
  INSERT INTO public.portfolio_items (
    id, template_id, position, title, prompt, item_type,
    required, due_at, settings, parent_item_id
  )
  SELECT m.new_id,
         p_target_template_id,
         CASE
           WHEN m.depth = 0 THEN v_root_base_position + m.root_rank::int
           ELSE m.old_position
         END,
         m.title,
         m.prompt,
         m.item_type,
         m.required,
         m.due_at,
         m.settings,
         NULL  -- patched in pass 2
    FROM _import_idmap m;

  GET DIAGNOSTICS v_imported = ROW_COUNT;

  -- ---- Pass 2: rewrite parent_item_id using the id map ------------------
  -- Roots stay NULL. Non-roots map their old parent → new parent.
  UPDATE public.portfolio_items pi
     SET parent_item_id = parent_map.new_parent_id
    FROM (
      SELECT child.new_id  AS new_id,
             parent.new_id AS new_parent_id
        FROM _import_idmap child
        JOIN _import_idmap parent ON parent.old_id = child.old_parent_id
       WHERE child.depth > 0
    ) AS parent_map
   WHERE pi.id = parent_map.new_id;

  -- ---- Audit ------------------------------------------------------------
  -- Do not log item bodies / prompts (PII-adjacent + noisy). Just counts +
  -- which templates were involved + which root ids were picked.
  PERFORM public.audit_record(
    'portfolio_import',
    'portfolio_template',
    p_target_template_id::text,
    jsonb_build_object(
      'source_template_id', p_source_template_id,
      'source_course_id',   v_source_course_id,
      'target_course_id',   v_target_course_id,
      'picked_root_ids',    to_jsonb(p_item_ids),
      'imported_count',     v_imported
    )
  );

  RETURN v_imported;
END;
$$;

-- Idempotent grant. The function is re-creatable; the grant must be too.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'import_portfolio_items'
  ) THEN
    RAISE EXCEPTION 'import_portfolio_items did not get created';
  END IF;
END$$;

REVOKE ALL ON FUNCTION public.import_portfolio_items(uuid, uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_portfolio_items(uuid, uuid, uuid[]) TO authenticated;

COMMENT ON FUNCTION public.import_portfolio_items(uuid, uuid, uuid[]) IS
  'Workstream B (May 2026 audit): deep-clone selected portfolio_items (+ their subtrees) from one template into another. Submissions and feedback are NOT cloned. Caller must teach both source and target courses. Returns the count of items (including descendants) imported.';
