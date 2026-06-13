-- 0229_fix_move_item_to_module.sql
-- DnD fix: cross-module item moves threw duplicate-key + left sparse positions.
--
-- move_item_to_module (0033) did a naive single-row UPDATE:
--     UPDATE module_items SET module_id=…, position=p_position WHERE id=…
-- with NO destination renumbering and NO source-gap close. Dropping an item
-- into an OCCUPIED slot of another module violated the partial EXCLUDE
-- constraint `module_items_position_unique` (module_id, position) WHERE
-- deleted_at IS NULL (0206) — the move failed with a duplicate-key toast and
-- the item snapped back. Moving an item OUT of a module also left gaps in the
-- source's positions (0,2,3) which could mis-order or collide on later edits.
--
-- Fix: mirror move_module (0034). Treat p_position as a 0-based ordinal insert
-- point (matching what the client passes — array indices). The EXCLUDE is
-- DEFERRABLE INITIALLY DEFERRED, so the intermediate shifts settle at commit.
--   • cross-module: open the slot in the target (shift positions >= target by
--     +1), move the row, then close the gap in the source (shift positions >
--     old by -1).
--   • same-module: rotate the affected span (kept here so the RPC is correct
--     even if the client routes a same-module drop through it).
-- Clamp the target ordinal to [0, live-sibling-count] so an out-of-range index
-- (e.g. append at .length) lands cleanly at the end.

CREATE OR REPLACE FUNCTION public.move_item_to_module(
  p_item_id           uuid,
  p_target_module_id  uuid,
  p_position          int
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller     uuid := auth.uid();
  v_old_module uuid;
  v_old_pos    int;
  v_count      int;
  v_target_pos int;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_staff(v_caller) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.course_modules WHERE id = p_target_module_id) THEN
    RAISE EXCEPTION 'target_module_not_found';
  END IF;

  SELECT module_id, position
    INTO v_old_module, v_old_pos
    FROM public.module_items
   WHERE id = p_item_id;
  IF v_old_module IS NULL THEN
    RAISE EXCEPTION 'item_not_found';
  END IF;

  -- Live siblings already in the target (the moving item excluded). The valid
  -- ordinal insert range is [0, v_count].
  SELECT COUNT(*) INTO v_count
    FROM public.module_items
   WHERE module_id = p_target_module_id
     AND deleted_at IS NULL
     AND id <> p_item_id;
  v_target_pos := GREATEST(0, LEAST(p_position, v_count));

  IF v_old_module = p_target_module_id THEN
    -- Same-module rotate (no-op when the ordinal doesn't change).
    IF v_old_pos < v_target_pos THEN
      UPDATE public.module_items
         SET position = position - 1
       WHERE module_id = p_target_module_id
         AND deleted_at IS NULL
         AND id <> p_item_id
         AND position > v_old_pos
         AND position <= v_target_pos;
    ELSIF v_old_pos > v_target_pos THEN
      UPDATE public.module_items
         SET position = position + 1
       WHERE module_id = p_target_module_id
         AND deleted_at IS NULL
         AND id <> p_item_id
         AND position >= v_target_pos
         AND position < v_old_pos;
    END IF;
    UPDATE public.module_items SET position = v_target_pos WHERE id = p_item_id;
  ELSE
    -- Cross-module: open the destination slot, move, then close the source gap.
    UPDATE public.module_items
       SET position = position + 1
     WHERE module_id = p_target_module_id
       AND deleted_at IS NULL
       AND position >= v_target_pos;

    UPDATE public.module_items
       SET module_id = p_target_module_id,
           position  = v_target_pos
     WHERE id = p_item_id;

    UPDATE public.module_items
       SET position = position - 1
     WHERE module_id = v_old_module
       AND deleted_at IS NULL
       AND position > v_old_pos;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.move_item_to_module(uuid, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.move_item_to_module(uuid, uuid, int) TO authenticated;
