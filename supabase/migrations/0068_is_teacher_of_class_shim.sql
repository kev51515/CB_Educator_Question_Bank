-- =============================================================================
-- Migration: 0068_is_teacher_of_class_shim.sql
-- Description: Compatibility shim restoring public.is_teacher_of_class(uuid,uuid).
--
-- WHY: migration 0012 renamed is_teacher_of_class → is_teacher_of_course and
-- DROPPED the old name. The portfolio-import RPCs added later in 0063/0064
-- (import_portfolio_items) still call the OLD name `is_teacher_of_class`.
-- plpgsql resolves referenced functions at call time, so on any database that
-- has 0012 applied (i.e. the cloud project), every import_portfolio_items call
-- fails with `42883: function public.is_teacher_of_class(uuid, uuid) does not
-- exist`. The smoke-features wave63 block caught this once 0062–0064 were
-- finally pushed to remote.
--
-- The cleanest forward-only fix that doesn't rewrite the (already-deployed)
-- 0063/0064 function bodies is to re-introduce is_teacher_of_class as a thin
-- alias delegating to is_teacher_of_course. Late binding means the existing
-- RPCs immediately pick it up — no need to CREATE OR REPLACE them.
--
-- Forward-only.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_teacher_of_class(uid uuid, p_course_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
  -- Delegate to the post-0012 canonical helper. Kept as a compatibility
  -- alias for callers (0063/0064 portfolio import) that reference the
  -- pre-rename name. New code should call is_teacher_of_course directly.
  SELECT public.is_teacher_of_course(uid, p_course_id);
$$;

REVOKE ALL ON FUNCTION public.is_teacher_of_class(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_teacher_of_class(uuid, uuid) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0068_is_teacher_of_class_shim.sql
-- =============================================================================
