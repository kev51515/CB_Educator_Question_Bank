-- =============================================================================
-- Migration: 0034_modules_tree.sql
-- Description: Promote course_modules to a tree. parent_module_id is NULL for
--   top-level modules; the tree is per-course. position remains unique within
--   a (course_id, parent_module_id) sibling group. Reordering / moving across
--   levels is mediated by RPCs that renumber siblings densely and reject
--   cycles.
-- =============================================================================

-- ---- 1. Column + index ---------------------------------------------------
ALTER TABLE public.course_modules
  ADD COLUMN IF NOT EXISTS parent_module_id uuid REFERENCES public.course_modules(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS course_modules_parent_position_idx
  ON public.course_modules (course_id, parent_module_id, position);

-- ---- 2. Cycle guard trigger ---------------------------------------------
-- Block any UPDATE that would set parent_module_id to a descendant of self.
CREATE OR REPLACE FUNCTION public.prevent_module_cycle() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_walk uuid := NEW.parent_module_id;
BEGIN
  IF NEW.parent_module_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.parent_module_id = NEW.id THEN
    RAISE EXCEPTION 'cycle: a module cannot be its own parent';
  END IF;
  -- Walk up the chain; if we encounter NEW.id we have a cycle.
  FOR i IN 1..50 LOOP   -- depth cap
    EXIT WHEN v_walk IS NULL;
    IF v_walk = NEW.id THEN
      RAISE EXCEPTION 'cycle: cannot nest a module under its descendant';
    END IF;
    SELECT parent_module_id INTO v_walk
      FROM public.course_modules WHERE id = v_walk;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_module_cycle ON public.course_modules;
CREATE TRIGGER trg_prevent_module_cycle
  BEFORE INSERT OR UPDATE OF parent_module_id ON public.course_modules
  FOR EACH ROW EXECUTE FUNCTION public.prevent_module_cycle();

-- ---- 3. RPC: reorder_modules_at_level -----------------------------------
-- Replaces the older `reorder_modules`. Reorders siblings within a level.
-- p_parent_id may be NULL for the root level.
CREATE OR REPLACE FUNCTION public.reorder_modules_at_level(
  p_course_id   uuid,
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

  -- Verify every id belongs to the specified parent + course.
  IF EXISTS (
    SELECT 1
    FROM unnest(p_ordered_ids) AS oid(id)
    LEFT JOIN public.course_modules m ON m.id = oid.id
    WHERE m.id IS NULL
       OR m.course_id <> p_course_id
       OR m.parent_module_id IS DISTINCT FROM p_parent_id
  ) THEN
    RAISE EXCEPTION 'ordered_ids must all be siblings at the specified level';
  END IF;

  FOREACH v_id IN ARRAY p_ordered_ids LOOP
    UPDATE public.course_modules SET position = v_pos WHERE id = v_id;
    v_pos := v_pos + 1;
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION public.reorder_modules_at_level(uuid, uuid, uuid[]) TO authenticated;

-- ---- 4. RPC: move_module ------------------------------------------------
-- Move a module to a new (parent, position). Renumbers source siblings
-- (closing the gap) and target siblings (opening the slot) atomically.
CREATE OR REPLACE FUNCTION public.move_module(
  p_module_id        uuid,
  p_new_parent_id    uuid,   -- NULL for top-level
  p_new_position     int     -- 1-based; clamped to [1, count+1]
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller       uuid := auth.uid();
  v_course_id    uuid;
  v_old_parent   uuid;
  v_old_position int;
  v_sibling_count int;
  v_target_pos   int;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_staff(v_caller) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT course_id, parent_module_id, position
    INTO v_course_id, v_old_parent, v_old_position
  FROM public.course_modules WHERE id = p_module_id;

  IF v_course_id IS NULL THEN RAISE EXCEPTION 'module_not_found'; END IF;

  -- Verify the new parent (if any) is in the same course.
  IF p_new_parent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.course_modules
     WHERE id = p_new_parent_id AND course_id = v_course_id
  ) THEN
    RAISE EXCEPTION 'invalid_parent';
  END IF;

  -- Clamp the target position to a valid range in the destination.
  SELECT COUNT(*) INTO v_sibling_count
    FROM public.course_modules
   WHERE course_id = v_course_id
     AND parent_module_id IS NOT DISTINCT FROM p_new_parent_id
     AND id <> p_module_id;
  v_target_pos := GREATEST(1, LEAST(p_new_position, v_sibling_count + 1));

  IF v_old_parent IS NOT DISTINCT FROM p_new_parent_id THEN
    -- Same level: shift the affected range.
    IF v_old_position < v_target_pos THEN
      UPDATE public.course_modules
         SET position = position - 1
       WHERE course_id = v_course_id
         AND parent_module_id IS NOT DISTINCT FROM p_new_parent_id
         AND position > v_old_position
         AND position <= v_target_pos;
    ELSIF v_old_position > v_target_pos THEN
      UPDATE public.course_modules
         SET position = position + 1
       WHERE course_id = v_course_id
         AND parent_module_id IS NOT DISTINCT FROM p_new_parent_id
         AND position >= v_target_pos
         AND position < v_old_position;
    END IF;
  ELSE
    -- Cross-level: close the gap in the source, open the slot in the dest.
    UPDATE public.course_modules
       SET position = position - 1
     WHERE course_id = v_course_id
       AND parent_module_id IS NOT DISTINCT FROM v_old_parent
       AND position > v_old_position;

    UPDATE public.course_modules
       SET position = position + 1
     WHERE course_id = v_course_id
       AND parent_module_id IS NOT DISTINCT FROM p_new_parent_id
       AND position >= v_target_pos;
  END IF;

  -- Apply the move. The cycle-prevention trigger fires here.
  UPDATE public.course_modules
     SET parent_module_id = p_new_parent_id,
         position = v_target_pos
   WHERE id = p_module_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.move_module(uuid, uuid, int) TO authenticated;

-- ---- 5. View: module_tree ------------------------------------------------
-- Convenience: depth-first walk with a depth column. Helps the client render
-- without recursion. RLS pass-through via underlying table.
CREATE OR REPLACE VIEW public.module_tree AS
WITH RECURSIVE walk AS (
  SELECT m.*, 0 AS depth, ARRAY[m.position]::int[] AS path
    FROM public.course_modules m
   WHERE m.parent_module_id IS NULL
  UNION ALL
  SELECT m.*, w.depth + 1, w.path || m.position
    FROM public.course_modules m
    JOIN walk w ON m.parent_module_id = w.id
)
SELECT * FROM walk;

GRANT SELECT ON public.module_tree TO authenticated;
