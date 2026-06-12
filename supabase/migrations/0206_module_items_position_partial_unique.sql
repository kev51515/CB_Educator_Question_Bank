-- =============================================================================
-- Migration: 0206_module_items_position_partial_unique.sql
-- Description: Fix "duplicate key value violates unique constraint
--   module_items_position_unique" when adding an item (e.g. a Full-Test) to a
--   module that *looks* empty.
--
-- Root cause: 0202 gave module_items a `deleted_at` soft-delete and hid trashed
--   rows from every SELECT (RLS) — so a module whose only item was trashed shows
--   "No items yet". But the uniqueness guard from 0036,
--     UNIQUE (module_id, position) DEFERRABLE INITIALLY DEFERRED,
--   still counted the trashed row. The client appends at max(live position)+1 = 0
--   for an empty-looking module, which collides with the trashed row still
--   sitting at position 0.
--
-- Fix: make the guard ignore trashed rows. A partial UNIQUE *index* can't be
--   DEFERRABLE, and reorder_module_items (0011) rewrites all positions in a
--   single `UPDATE … SET position = idx-1` permutation that transiently collides
--   — it RELIES on deferral. The one construct that is both partial AND
--   deferrable is an EXCLUSION constraint with `=` (needs btree_gist for the gist
--   equality opclasses). Same name, same (module_id, position) semantics, plus
--   `WHERE deleted_at IS NULL` so trashed rows no longer reserve a slot.
--   Existing live rows were already unique under the old constraint, so the new
--   constraint validates without conflict.
--
-- Knock-on fix: restore_content (0202) brought a module_item back by clearing
--   deleted_at while KEEPING its old position. Pre-0204 that was always safe
--   (the trashed row blocked anyone from taking the slot); now the slot may have
--   been refilled, so restore could collide. restore_content is updated to
--   re-append a restored item at max(live position)+1 in its module — the safe,
--   predictable place — for both the 'module_item' and 'assignment' paths.
--
-- Forward-only. Idempotent (IF NOT EXISTS / DROP CONSTRAINT IF EXISTS / OR REPLACE).
-- =============================================================================

-- btree_gist supplies the gist `=` opclasses for uuid + integer used below.
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
-- Make those opclasses resolvable (Supabase keeps extensions in `extensions`).
SET search_path = public, extensions, auth;

ALTER TABLE public.module_items
  DROP CONSTRAINT IF EXISTS module_items_position_unique;

ALTER TABLE public.module_items
  ADD CONSTRAINT module_items_position_unique
  EXCLUDE USING gist (module_id WITH =, position WITH =)
  WHERE (deleted_at IS NULL)
  DEFERRABLE INITIALLY DEFERRED;

-- -----------------------------------------------------------------------------
-- restore_content: re-append restored module_items at end-of-module so a slot
-- freed (and possibly refilled) while trashed can't collide on restore.
-- Identical to 0202 except the two module_items UPDATEs recompute `position`.
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
      UPDATE public.course_modules SET deleted_at = NULL, deleted_by = NULL
       WHERE id = p_id AND deleted_at IS NOT NULL;
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

-- END OF MIGRATION 0206_module_items_position_partial_unique.sql
