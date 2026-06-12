-- Migration: 0207_course_modules_position_partial_unique.sql
--
-- Fix "duplicate key value violates unique constraint
--   course_modules_position_unique" when adding a SUBMODULE.
--
-- Same root cause as 0206 (which fixed the sibling table module_items), one
-- table over: 0202 gave course_modules a `deleted_at` soft-delete and hid
-- trashed rows from every SELECT (RLS), but the constraint from 0036 —
--   UNIQUE (course_id, parent_module_id, position) DEFERRABLE INITIALLY DEFERRED
-- still counted trashed rows. A trashed submodule keeps reserving its slot, so
-- inserting a new submodule at that position collides.
--
-- (The client also computed the new submodule position as `siblings.length`
-- over LIVE rows, which collides whenever live positions aren't dense-from-0 —
-- e.g. submodules sitting at {1,2} → length 2 → collides with the live row at
-- position 2. That's fixed in the same commit by switching the client to
-- max(live position)+1, the inherently-collision-free append the top-level
-- create + module_items already use. This migration makes the DB side robust
-- so a trashed row can never reserve a slot regardless of the client.)
--
-- Fix: swap the plain UNIQUE for a PARTIAL DEFERRABLE EXCLUSION constraint that
-- ignores trashed rows, mirroring 0206:
--   * EXCLUDE USING gist over (course_id, parent_module_id, position) — needs
--     btree_gist for the `=` equality opclasses on uuid + integer.
--   * WHERE (deleted_at IS NULL) — trashed rows drop out of the check.
--   * DEFERRABLE INITIALLY DEFERRED — move_module / reorder shift positions in
--     single-statement permutations that transiently collide; deferring to
--     COMMIT keeps those legal.
--   * A NULL parent_module_id (top-level module) does not conflict under gist
--     `=` (NULL = NULL is NULL), exactly reproducing the original constraint's
--     default NULLS-DISTINCT behaviour — so top-level modules keep their prior
--     (unenforced) semantics and nothing regresses there.
--
-- Knock-on: restore_content (0202/0206) brought a module back by clearing
-- deleted_at while KEEPING its old position — which could now collide with a
-- live row that took that slot while it was trashed. Re-append a restored
-- module at max(live sibling position)+1 within its (course, parent) group, the
-- same safe spot 0206 uses for module_items.
--
-- Forward-only. Idempotent (CREATE EXTENSION IF NOT EXISTS / DROP CONSTRAINT
-- IF EXISTS / OR REPLACE).
-- =============================================================================

-- btree_gist supplies the gist `=` opclasses for uuid + integer used below.
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
-- Make those opclasses resolvable (Supabase keeps extensions in `extensions`).
SET search_path = public, extensions, auth;

ALTER TABLE public.course_modules
  DROP CONSTRAINT IF EXISTS course_modules_position_unique;

ALTER TABLE public.course_modules
  ADD CONSTRAINT course_modules_position_unique
  EXCLUDE USING gist (
    course_id        WITH =,
    parent_module_id WITH =,
    position         WITH =
  )
  WHERE (deleted_at IS NULL)
  DEFERRABLE INITIALLY DEFERRED;

-- -----------------------------------------------------------------------------
-- restore_content: re-append a restored module at end-of-(course,parent) so a
-- slot freed (and possibly refilled) while trashed can't collide on restore.
-- Identical to 0206 except the 'module' branch recomputes `position`.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restore_content(p_kind text, p_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_course uuid;
  v_label  text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  CASE p_kind
    WHEN 'assignment' THEN
      SELECT course_id, title INTO v_course, v_label FROM public.assignments WHERE id = p_id;
    WHEN 'module' THEN
      SELECT course_id, name INTO v_course, v_label FROM public.course_modules WHERE id = p_id;
    WHEN 'module_item' THEN
      SELECT m.course_id, i.title INTO v_course, v_label
        FROM public.module_items i JOIN public.course_modules m ON m.id = i.module_id
       WHERE i.id = p_id;
    WHEN 'material' THEN
      SELECT course_id, title INTO v_course, v_label FROM public.course_materials WHERE id = p_id;
    WHEN 'announcement' THEN
      SELECT course_id, title INTO v_course, v_label FROM public.course_announcements WHERE id = p_id;
    WHEN 'topic' THEN
      SELECT course_id, title INTO v_course, v_label FROM public.discussion_topics WHERE id = p_id;
    ELSE
      RAISE EXCEPTION 'invalid_kind' USING ERRCODE = '22023';
  END CASE;

  IF v_course IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = '22023';
  END IF;
  IF NOT (public.is_teacher_of_course(v_uid, v_course) OR public.is_admin(v_uid)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  CASE p_kind
    WHEN 'assignment' THEN
      UPDATE public.assignments SET deleted_at = NULL, deleted_by = NULL
       WHERE id = p_id AND deleted_at IS NOT NULL;
      -- Re-append each restored link at end-of-module (live rows only). The
      -- subquery sees the pre-statement snapshot, where these rows are still
      -- trashed, so they're excluded from the max.
      UPDATE public.module_items mi
         SET deleted_at = NULL, deleted_by = NULL,
             position = COALESCE((
               SELECT max(x.position) + 1 FROM public.module_items x
                WHERE x.module_id = mi.module_id AND x.deleted_at IS NULL
             ), 0)
       WHERE mi.item_type = 'assignment' AND mi.item_ref_id = p_id AND mi.deleted_at IS NOT NULL;
    WHEN 'module' THEN
      -- Re-append the restored module at end-of-(course, parent), live rows
      -- only. IS NOT DISTINCT FROM matches the NULL-parent (top-level) group.
      UPDATE public.course_modules m
         SET deleted_at = NULL, deleted_by = NULL,
             position = COALESCE((
               SELECT max(x.position) + 1 FROM public.course_modules x
                WHERE x.course_id = m.course_id
                  AND x.parent_module_id IS NOT DISTINCT FROM m.parent_module_id
                  AND x.deleted_at IS NULL
             ), 0)
       WHERE m.id = p_id AND m.deleted_at IS NOT NULL;
    WHEN 'module_item' THEN
      UPDATE public.module_items mi
         SET deleted_at = NULL, deleted_by = NULL,
             position = COALESCE((
               SELECT max(x.position) + 1 FROM public.module_items x
                WHERE x.module_id = mi.module_id AND x.deleted_at IS NULL
             ), 0)
       WHERE mi.id = p_id AND mi.deleted_at IS NOT NULL;
    WHEN 'material' THEN
      UPDATE public.course_materials SET deleted_at = NULL, deleted_by = NULL
       WHERE id = p_id AND deleted_at IS NOT NULL;
    WHEN 'announcement' THEN
      UPDATE public.course_announcements SET deleted_at = NULL, deleted_by = NULL
       WHERE id = p_id AND deleted_at IS NOT NULL;
    WHEN 'topic' THEN
      UPDATE public.discussion_topics SET deleted_at = NULL, deleted_by = NULL
       WHERE id = p_id AND deleted_at IS NOT NULL;
  END CASE;

  PERFORM public.audit_record(
    'content.restore', p_kind, p_id::text,
    jsonb_build_object('label', v_label, 'course_id', v_course)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.restore_content(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_content(text, uuid) TO authenticated;

-- END OF MIGRATION 0207_course_modules_position_partial_unique.sql
