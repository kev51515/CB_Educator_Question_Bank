-- =============================================================================
-- Migration: 0035_portfolio_tree.sql
-- Description: Promote portfolio_items to a tree. parent_item_id is NULL for
--   top-level items; the tree is per-template. position remains unique within
--   a (template_id, parent_item_id) sibling group. RPCs mirror Wave 10A's
--   modules tree (reorder_portfolio_items_at_level + move_portfolio_item).
-- =============================================================================

-- ---- 1. Column + index ---------------------------------------------------
ALTER TABLE public.portfolio_items
  ADD COLUMN IF NOT EXISTS parent_item_id uuid REFERENCES public.portfolio_items(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS portfolio_items_parent_position_idx
  ON public.portfolio_items (template_id, parent_item_id, position);

-- ---- 2. Cycle guard -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_portfolio_item_cycle() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_walk uuid := NEW.parent_item_id;
BEGIN
  IF NEW.parent_item_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.parent_item_id = NEW.id THEN
    RAISE EXCEPTION 'cycle: a portfolio item cannot be its own parent';
  END IF;
  FOR i IN 1..50 LOOP
    EXIT WHEN v_walk IS NULL;
    IF v_walk = NEW.id THEN
      RAISE EXCEPTION 'cycle: cannot nest a portfolio item under its descendant';
    END IF;
    SELECT parent_item_id INTO v_walk
      FROM public.portfolio_items WHERE id = v_walk;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_portfolio_item_cycle ON public.portfolio_items;
CREATE TRIGGER trg_prevent_portfolio_item_cycle
  BEFORE INSERT OR UPDATE OF parent_item_id ON public.portfolio_items
  FOR EACH ROW EXECUTE FUNCTION public.prevent_portfolio_item_cycle();

-- ---- 3. RPC: reorder_portfolio_items_at_level ---------------------------
CREATE OR REPLACE FUNCTION public.reorder_portfolio_items_at_level(
  p_template_id uuid,
  p_parent_id   uuid,
  p_ordered_ids uuid[]
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_id     uuid;
  v_pos    int := 1;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_staff(v_caller) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(p_ordered_ids) AS oid(id)
    LEFT JOIN public.portfolio_items pi ON pi.id = oid.id
    WHERE pi.id IS NULL
       OR pi.template_id <> p_template_id
       OR pi.parent_item_id IS DISTINCT FROM p_parent_id
  ) THEN
    RAISE EXCEPTION 'ordered_ids must all be siblings at the specified level';
  END IF;

  FOREACH v_id IN ARRAY p_ordered_ids LOOP
    UPDATE public.portfolio_items SET position = v_pos WHERE id = v_id;
    v_pos := v_pos + 1;
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION public.reorder_portfolio_items_at_level(uuid, uuid, uuid[]) TO authenticated;

-- ---- 4. RPC: move_portfolio_item ----------------------------------------
CREATE OR REPLACE FUNCTION public.move_portfolio_item(
  p_item_id        uuid,
  p_new_parent_id  uuid,
  p_new_position   int
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller        uuid := auth.uid();
  v_template_id   uuid;
  v_old_parent    uuid;
  v_old_position  int;
  v_sibling_count int;
  v_target_pos    int;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_staff(v_caller) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT template_id, parent_item_id, position
    INTO v_template_id, v_old_parent, v_old_position
  FROM public.portfolio_items WHERE id = p_item_id;

  IF v_template_id IS NULL THEN RAISE EXCEPTION 'item_not_found'; END IF;

  IF p_new_parent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.portfolio_items
     WHERE id = p_new_parent_id AND template_id = v_template_id
  ) THEN
    RAISE EXCEPTION 'invalid_parent';
  END IF;

  SELECT COUNT(*) INTO v_sibling_count
    FROM public.portfolio_items
   WHERE template_id = v_template_id
     AND parent_item_id IS NOT DISTINCT FROM p_new_parent_id
     AND id <> p_item_id;
  v_target_pos := GREATEST(1, LEAST(p_new_position, v_sibling_count + 1));

  IF v_old_parent IS NOT DISTINCT FROM p_new_parent_id THEN
    IF v_old_position < v_target_pos THEN
      UPDATE public.portfolio_items
         SET position = position - 1
       WHERE template_id = v_template_id
         AND parent_item_id IS NOT DISTINCT FROM p_new_parent_id
         AND position > v_old_position
         AND position <= v_target_pos;
    ELSIF v_old_position > v_target_pos THEN
      UPDATE public.portfolio_items
         SET position = position + 1
       WHERE template_id = v_template_id
         AND parent_item_id IS NOT DISTINCT FROM p_new_parent_id
         AND position >= v_target_pos
         AND position < v_old_position;
    END IF;
  ELSE
    UPDATE public.portfolio_items
       SET position = position - 1
     WHERE template_id = v_template_id
       AND parent_item_id IS NOT DISTINCT FROM v_old_parent
       AND position > v_old_position;

    UPDATE public.portfolio_items
       SET position = position + 1
     WHERE template_id = v_template_id
       AND parent_item_id IS NOT DISTINCT FROM p_new_parent_id
       AND position >= v_target_pos;
  END IF;

  UPDATE public.portfolio_items
     SET parent_item_id = p_new_parent_id,
         position = v_target_pos
   WHERE id = p_item_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.move_portfolio_item(uuid, uuid, int) TO authenticated;

-- ---- 5. View: portfolio_item_tree ----------------------------------------
CREATE OR REPLACE VIEW public.portfolio_item_tree AS
WITH RECURSIVE walk AS (
  SELECT pi.*, 0 AS depth, ARRAY[pi.position]::int[] AS path
    FROM public.portfolio_items pi
   WHERE pi.parent_item_id IS NULL
  UNION ALL
  SELECT pi.*, w.depth + 1, w.path || pi.position
    FROM public.portfolio_items pi
    JOIN walk w ON pi.parent_item_id = w.id
)
SELECT * FROM walk;

GRANT SELECT ON public.portfolio_item_tree TO authenticated;
