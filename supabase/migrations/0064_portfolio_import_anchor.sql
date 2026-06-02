-- =============================================================================
-- Migration: 0064_portfolio_import_anchor.sql
-- Description: Extends import_portfolio_items (mig 0063) to accept an optional
--   p_target_parent_id so the cloned subtree can land UNDER an existing item
--   in the target template instead of always at root level.
--
-- WHY:
--   0063's own header punted this: "Re-anchoring import depth (everything
--   imports at root level of target; sub-anchor picker is future work)."
--   Workstream B Round 19 closes that gap. The teacher-facing modal now has
--   a parent picker; the RPC gets the new 4th arg to honor it.
--
-- BACKWARD COMPAT:
--   - Old 3-arg callers (mig 0063 era) still work via the default NULL.
--   - When p_target_parent_id IS NULL → behavior identical to 0063 (root land).
--   - When p_target_parent_id IS NOT NULL → cloned roots get parent_item_id =
--     that anchor, and their position is computed as max(siblings_under_anchor
--     in target) + rank, NOT max(root-siblings) + rank.
--
-- WATCH-OUTS (documented per CLAUDE.md migration drift discipline):
--   - We re-CREATE OR REPLACE the function with a 4-arg signature. Postgres
--     accepts a new optional arg with default ONLY if no overload collision
--     exists. 0063 created the 3-arg form. Replacing with a wider signature
--     that has a default for the new arg implicitly subsumes the 3-arg call
--     path. Old PostgREST callers passing only the first three args still
--     resolve cleanly because Postgres fills the default.
--   - We validate that p_target_parent_id (when non-NULL) belongs to the
--     target template. We do NOT need a separate authz step on the parent:
--     belonging-to-target-template plus the existing is_teacher_of_class on
--     target_course is sufficient.
--   - We re-grant on the NEW (4-arg) signature. The OLD (3-arg) signature is
--     dropped because Postgres replaces in-place when arg-count differs — we
--     explicitly DROP the old signature first to avoid lingering overload.
--   - audit_record payload now carries target_parent_id when non-NULL so
--     forensic queries can distinguish root-imports from anchored-imports.
-- =============================================================================

-- Drop the old 3-arg signature explicitly to avoid overload ambiguity. The
-- 4-arg replacement below is the canonical form going forward; old callers
-- that pass only 3 args will resolve via the default on p_target_parent_id.
DROP FUNCTION IF EXISTS public.import_portfolio_items(uuid, uuid, uuid[]);

CREATE OR REPLACE FUNCTION public.import_portfolio_items(
  p_source_template_id uuid,
  p_target_template_id uuid,
  p_item_ids           uuid[],
  p_target_parent_id   uuid DEFAULT NULL
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

  -- ---- NEW (Round 19): validate the optional anchor parent ----------------
  -- When the caller passes a parent id, it MUST exist in the target template.
  -- (Authz on the parent is implicit: it belongs to a template owned by the
  -- target course, and we already verified the caller teaches that course.)
  IF p_target_parent_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.portfolio_items
      WHERE id = p_target_parent_id
        AND template_id = p_target_template_id
    ) THEN
      RAISE EXCEPTION 'parent_not_in_target_template';
    END IF;
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

  -- ---- Compute the next sibling position in the target ------------------
  -- When anchoring under a parent, count siblings under that parent. When
  -- not, count root-level siblings. Sibling positions in a level are not
  -- guaranteed gap-free, so we take max.
  IF p_target_parent_id IS NULL THEN
    SELECT coalesce(max(position), 0) INTO v_root_base_position
      FROM public.portfolio_items
     WHERE template_id = p_target_template_id
       AND parent_item_id IS NULL;
  ELSE
    SELECT coalesce(max(position), 0) INTO v_root_base_position
      FROM public.portfolio_items
     WHERE template_id = p_target_template_id
       AND parent_item_id = p_target_parent_id;
  END IF;

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

  -- ---- Pass 1: insert all new items -------------------------------------
  -- Roots get position = base + root_rank AND parent_item_id = p_target_parent_id
  -- (which is NULL for the default root-level behavior, identical to 0063).
  -- Non-roots keep their source position (intra-subtree ordering preserved);
  -- they'll get their parent patched in pass 2.
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
         CASE
           WHEN m.depth = 0 THEN p_target_parent_id  -- NULL → root, else anchor
           ELSE NULL                                  -- patched in pass 2
         END
    FROM _import_idmap m;

  GET DIAGNOSTICS v_imported = ROW_COUNT;

  -- ---- Pass 2: rewrite parent_item_id using the id map ------------------
  -- Roots already have their parent set above (NULL or anchor). Non-roots
  -- map their old parent → new parent.
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
  -- which templates were involved + which root ids were picked + the anchor
  -- (when present) so forensic queries can tell root-imports apart from
  -- anchored-imports.
  PERFORM public.audit_record(
    'portfolio_import',
    'portfolio_template',
    p_target_template_id::text,
    CASE
      WHEN p_target_parent_id IS NULL THEN
        jsonb_build_object(
          'source_template_id', p_source_template_id,
          'source_course_id',   v_source_course_id,
          'target_course_id',   v_target_course_id,
          'picked_root_ids',    to_jsonb(p_item_ids),
          'imported_count',     v_imported
        )
      ELSE
        jsonb_build_object(
          'source_template_id', p_source_template_id,
          'source_course_id',   v_source_course_id,
          'target_course_id',   v_target_course_id,
          'picked_root_ids',    to_jsonb(p_item_ids),
          'imported_count',     v_imported,
          'target_parent_id',   p_target_parent_id
        )
    END
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

REVOKE ALL ON FUNCTION public.import_portfolio_items(uuid, uuid, uuid[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_portfolio_items(uuid, uuid, uuid[], uuid) TO authenticated;

COMMENT ON FUNCTION public.import_portfolio_items(uuid, uuid, uuid[], uuid) IS
  'Workstream B Round 19 (Jun 2026): deep-clone selected portfolio_items (+ subtrees) from one template into another, optionally anchored under an existing item in the target template (p_target_parent_id defaults NULL = root). Submissions and feedback are NOT cloned. Caller must teach both source and target courses. Returns count imported. Extends mig 0063 — backward-compatible with 3-arg callers.';
