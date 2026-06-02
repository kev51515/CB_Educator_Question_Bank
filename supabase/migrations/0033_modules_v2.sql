-- =============================================================================
-- Migration: 0033_modules_v2.sql
-- Description: Canvas-aligned Modules UX. Adds lock_at, student completion
--   tracking, and 4 RPCs (duplicate_module, move_item_to_module,
--   toggle publish, mark complete) plus an auto-completion trigger that
--   ticks assignment items when the student submits.
-- =============================================================================

-- ---- 1. course_modules.lock_at: end-of-availability for students -----------
ALTER TABLE public.course_modules
  ADD COLUMN IF NOT EXISTS lock_at timestamptz;

-- ---- 2. module_item_completion: per-student per-item progress -------------
CREATE TABLE IF NOT EXISTS public.module_item_completion (
  student_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  module_item_id    uuid NOT NULL REFERENCES public.module_items(id) ON DELETE CASCADE,
  completed_at      timestamptz NOT NULL DEFAULT now(),
  source            text NOT NULL DEFAULT 'manual'   -- 'manual' | 'attempt'
    CHECK (source IN ('manual', 'attempt')),
  PRIMARY KEY (student_id, module_item_id)
);
CREATE INDEX IF NOT EXISTS module_item_completion_student_idx
  ON public.module_item_completion (student_id, completed_at DESC);

ALTER TABLE public.module_item_completion ENABLE ROW LEVEL SECURITY;

-- Students see their own; staff see all (for progress views).
DROP POLICY IF EXISTS "completion: own or staff reads" ON public.module_item_completion;
CREATE POLICY "completion: own or staff reads"
  ON public.module_item_completion FOR SELECT
  USING (student_id = (SELECT auth.uid()) OR public.is_staff((SELECT auth.uid())));

DROP POLICY IF EXISTS "completion: student upserts own" ON public.module_item_completion;
CREATE POLICY "completion: student upserts own"
  ON public.module_item_completion FOR INSERT
  WITH CHECK (student_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "completion: student deletes own" ON public.module_item_completion;
CREATE POLICY "completion: student deletes own"
  ON public.module_item_completion FOR DELETE
  USING (student_id = (SELECT auth.uid()));

-- ---- 3. RPC: duplicate_module ---------------------------------------------
CREATE OR REPLACE FUNCTION public.duplicate_module(p_module_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller       uuid := auth.uid();
  v_source       public.course_modules%ROWTYPE;
  v_new_id       uuid;
  v_next_pos     int;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_staff(v_caller) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT * INTO v_source FROM public.course_modules WHERE id = p_module_id;
  IF v_source.id IS NULL THEN RAISE EXCEPTION 'module_not_found'; END IF;

  SELECT coalesce(MAX(position), 0) + 1 INTO v_next_pos
  FROM public.course_modules WHERE course_id = v_source.course_id;

  INSERT INTO public.course_modules (course_id, name, position, published, opens_at, lock_at)
  VALUES (v_source.course_id, v_source.name || ' (copy)', v_next_pos,
          v_source.published, v_source.opens_at, v_source.lock_at)
  RETURNING id INTO v_new_id;

  INSERT INTO public.module_items (module_id, position, item_type, item_ref_id, title, url, indent, published)
  SELECT v_new_id, position, item_type, item_ref_id, title, url, indent, published
  FROM public.module_items
  WHERE module_id = p_module_id
  ORDER BY position;

  RETURN v_new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.duplicate_module(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.duplicate_module(uuid) TO authenticated;

-- ---- 4. RPC: move_item_to_module ------------------------------------------
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
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_staff(v_caller) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  -- Verify the target module exists.
  IF NOT EXISTS (SELECT 1 FROM public.course_modules WHERE id = p_target_module_id) THEN
    RAISE EXCEPTION 'target_module_not_found';
  END IF;

  UPDATE public.module_items
     SET module_id = p_target_module_id,
         position  = p_position
   WHERE id = p_item_id;
END;
$$;
REVOKE ALL ON FUNCTION public.move_item_to_module(uuid, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.move_item_to_module(uuid, uuid, int) TO authenticated;

-- ---- 5. RPC: toggle_module_publish / toggle_item_publish ------------------
CREATE OR REPLACE FUNCTION public.toggle_module_publish(p_module_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_new    boolean;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_staff(v_caller) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  UPDATE public.course_modules
     SET published = NOT published
   WHERE id = p_module_id
  RETURNING published INTO v_new;

  IF NOT FOUND THEN RAISE EXCEPTION 'module_not_found'; END IF;
  RETURN v_new;
END;
$$;
GRANT EXECUTE ON FUNCTION public.toggle_module_publish(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.toggle_item_publish(p_item_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_new    boolean;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_staff(v_caller) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  UPDATE public.module_items
     SET published = NOT published
   WHERE id = p_item_id
  RETURNING published INTO v_new;

  IF NOT FOUND THEN RAISE EXCEPTION 'item_not_found'; END IF;
  RETURN v_new;
END;
$$;
GRANT EXECUTE ON FUNCTION public.toggle_item_publish(uuid) TO authenticated;

-- ---- 6. RPC: mark_item_complete (student-facing) --------------------------
CREATE OR REPLACE FUNCTION public.mark_item_complete(p_item_id uuid, p_complete boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_complete THEN
    INSERT INTO public.module_item_completion (student_id, module_item_id, source)
    VALUES (v_caller, p_item_id, 'manual')
    ON CONFLICT (student_id, module_item_id) DO NOTHING;
  ELSE
    DELETE FROM public.module_item_completion
     WHERE student_id = v_caller AND module_item_id = p_item_id AND source = 'manual';
    -- Note: we don't undo 'attempt'-sourced completions to keep the audit trail.
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.mark_item_complete(uuid, boolean) TO authenticated;

-- ---- 7. Trigger: auto-complete assignment-type module items on submit -----
-- When an assignment_attempt transitions to submitted_at != NULL, find any
-- module_items whose item_type='assignment' and item_ref_id = the assignment_id,
-- then insert a completion row for the student with source='attempt'.
CREATE OR REPLACE FUNCTION public.auto_complete_assignment_items() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF (NEW.submitted_at IS NOT NULL)
     AND (OLD.submitted_at IS NULL OR OLD.submitted_at IS DISTINCT FROM NEW.submitted_at) THEN
    INSERT INTO public.module_item_completion (student_id, module_item_id, source)
    SELECT NEW.student_id, mi.id, 'attempt'
    FROM public.module_items mi
    WHERE mi.item_type = 'assignment'
      AND mi.item_ref_id = NEW.assignment_id
    ON CONFLICT (student_id, module_item_id) DO UPDATE
      SET source = 'attempt', completed_at = now();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_auto_complete_assignment_items ON public.assignment_attempts;
CREATE TRIGGER trg_auto_complete_assignment_items
  AFTER INSERT OR UPDATE ON public.assignment_attempts
  FOR EACH ROW EXECUTE FUNCTION public.auto_complete_assignment_items();
