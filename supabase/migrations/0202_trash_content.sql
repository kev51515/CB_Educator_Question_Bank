-- =============================================================================
-- 0202_trash_content.sql
--
-- Extends the 0198 trash to ALL deletable course content: assignments,
-- modules, module items, materials, announcements, discussion topics.
-- ("It should be for all — but if they're in the trashcan they should not be
--  wired up." — Kevin, 2026-06-12.)
--
-- DESIGN (differs from 0198's courses on one point): for these tables the
-- teacher's read path is the `is_staff` "reads all" policy, so EVERY select
-- policy — staff included — gains `deleted_at IS NULL`. Trashed rows are
-- therefore invisible to ALL direct queries ("not wired up"); the only ways
-- to see or touch them are the SECURITY DEFINER trash RPCs:
--   • trash_content(kind, id)   — soft-delete (+ unwire side effects)
--   • restore_content(kind, id) — bring back
--   • list_trash()              — admin-only unified listing for the Trash
--     page (also returns trashed courses + users so the page is one fetch).
--
-- Unwiring side effects handled inside the RPCs:
--   • Trashing an ASSIGNMENT also soft-deletes its module_items rows
--     (item_type='assignment' ref) so no dead link is left in Modules;
--     restore brings those rows back.
--   • A trashed MODULE hides its items via the amended item policies
--     (the EXISTS now requires the parent module to be live).
--   • Trashing a MATERIAL keeps its storage object (needed for restore);
--     the 90-day purge deletes the DB row and leaves the blob orphaned —
--     accepted cost, noted here for the record.
--
-- purge_trash() (0198) is extended to hard-delete all six kinds after the
-- same 90-day window. Authz for trash/restore = teacher-of-course OR admin,
-- mirroring the live delete policies. All operations audited
-- (content.trash / content.restore with kind in details).
--
-- All functions SECURITY DEFINER + SET search_path = public, auth. Stable
-- error codes: not_authenticated / not_authorized / invalid_kind / not_found.
-- Idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Columns + partial indexes
-- -----------------------------------------------------------------------------
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.course_modules
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.module_items
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.course_materials
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.course_announcements
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.discussion_topics
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS assignments_deleted_at_idx          ON public.assignments (deleted_at)          WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS course_modules_deleted_at_idx       ON public.course_modules (deleted_at)       WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS module_items_deleted_at_idx         ON public.module_items (deleted_at)         WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS course_materials_deleted_at_idx     ON public.course_materials (deleted_at)     WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS course_announcements_deleted_at_idx ON public.course_announcements (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS discussion_topics_deleted_at_idx    ON public.discussion_topics (deleted_at)    WHERE deleted_at IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. SELECT policies — recreated from their LIVE definitions (dumped from
--    pg_policies on prod, 2026-06-12) with `deleted_at IS NULL` added.
--    Staff policies are filtered too (see header); trash access is RPC-only.
-- -----------------------------------------------------------------------------

-- assignments
DROP POLICY IF EXISTS "assignments: teacher of course reads" ON public.assignments;
CREATE POLICY "assignments: teacher of course reads"
  ON public.assignments FOR SELECT
  USING (deleted_at IS NULL AND public.is_teacher_of_course((SELECT auth.uid()), course_id));

DROP POLICY IF EXISTS "assignments: enrolled student reads" ON public.assignments;
CREATE POLICY "assignments: enrolled student reads"
  ON public.assignments FOR SELECT
  USING (deleted_at IS NULL AND public.is_student_in_class((SELECT auth.uid()), course_id));

DROP POLICY IF EXISTS "assignments: staff reads all" ON public.assignments;
CREATE POLICY "assignments: staff reads all"
  ON public.assignments FOR SELECT
  USING (deleted_at IS NULL AND public.is_staff((SELECT auth.uid())));

-- course_modules
DROP POLICY IF EXISTS "course_modules: teacher of class reads" ON public.course_modules;
CREATE POLICY "course_modules: teacher of class reads"
  ON public.course_modules FOR SELECT
  USING (deleted_at IS NULL AND public.is_teacher_of_course((SELECT auth.uid()), course_id));

DROP POLICY IF EXISTS "course_modules: enrolled student reads" ON public.course_modules;
CREATE POLICY "course_modules: enrolled student reads"
  ON public.course_modules FOR SELECT
  USING (deleted_at IS NULL AND public.is_student_in_class((SELECT auth.uid()), course_id));

DROP POLICY IF EXISTS "course_modules: staff reads all" ON public.course_modules;
CREATE POLICY "course_modules: staff reads all"
  ON public.course_modules FOR SELECT
  USING (deleted_at IS NULL AND public.is_staff((SELECT auth.uid())));

-- module_items — the parent-module EXISTS also requires the module to be
-- live, so a trashed module's items vanish without their own deleted_at.
DROP POLICY IF EXISTS "module_items: teacher of class reads" ON public.module_items;
CREATE POLICY "module_items: teacher of class reads"
  ON public.module_items FOR SELECT
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.course_modules m
      WHERE m.id = module_items.module_id
        AND m.deleted_at IS NULL
        AND public.is_teacher_of_course((SELECT auth.uid()), m.course_id)
    )
  );

DROP POLICY IF EXISTS "module_items: enrolled student reads" ON public.module_items;
CREATE POLICY "module_items: enrolled student reads"
  ON public.module_items FOR SELECT
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.course_modules m
      WHERE m.id = module_items.module_id
        AND m.deleted_at IS NULL
        AND public.is_student_in_class((SELECT auth.uid()), m.course_id)
    )
  );

DROP POLICY IF EXISTS "module_items: staff reads all" ON public.module_items;
CREATE POLICY "module_items: staff reads all"
  ON public.module_items FOR SELECT
  USING (deleted_at IS NULL AND public.is_staff((SELECT auth.uid())));

-- course_materials
DROP POLICY IF EXISTS "course_materials: enrolled student reads" ON public.course_materials;
CREATE POLICY "course_materials: enrolled student reads"
  ON public.course_materials FOR SELECT
  USING (deleted_at IS NULL AND public.is_student_in_class((SELECT auth.uid()), course_id));

DROP POLICY IF EXISTS "course_materials: staff reads all" ON public.course_materials;
CREATE POLICY "course_materials: staff reads all"
  ON public.course_materials FOR SELECT
  USING (deleted_at IS NULL AND public.is_staff((SELECT auth.uid())));

-- course_announcements
DROP POLICY IF EXISTS "announcements: enrolled student reads" ON public.course_announcements;
CREATE POLICY "announcements: enrolled student reads"
  ON public.course_announcements FOR SELECT
  USING (
    deleted_at IS NULL
    AND published = true
    AND public.is_student_in_class((SELECT auth.uid()), course_id)
  );

DROP POLICY IF EXISTS "announcements: staff reads all" ON public.course_announcements;
CREATE POLICY "announcements: staff reads all"
  ON public.course_announcements FOR SELECT
  USING (deleted_at IS NULL AND public.is_staff((SELECT auth.uid())));

-- discussion_topics
DROP POLICY IF EXISTS "topics: enrolled or staff reads" ON public.discussion_topics;
CREATE POLICY "topics: enrolled or staff reads"
  ON public.discussion_topics FOR SELECT
  USING (
    deleted_at IS NULL
    AND (
      public.is_student_in_class((SELECT auth.uid()), course_id)
      OR public.is_staff((SELECT auth.uid()))
    )
  );

-- -----------------------------------------------------------------------------
-- 3. trash_content / restore_content — one RPC pair, explicit per-kind SQL
--    (no dynamic SQL). Authz: teacher-of-owning-course OR admin.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trash_content(p_kind text, p_id uuid)
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
      UPDATE public.assignments SET deleted_at = now(), deleted_by = v_uid
       WHERE id = p_id AND deleted_at IS NULL;
      -- Unwire: hide the Modules rows that point at this assignment so no
      -- dead link remains. Restore brings them back (same ref match).
      UPDATE public.module_items SET deleted_at = now(), deleted_by = v_uid
       WHERE item_type = 'assignment' AND item_ref_id = p_id AND deleted_at IS NULL;
    WHEN 'module' THEN
      UPDATE public.course_modules SET deleted_at = now(), deleted_by = v_uid
       WHERE id = p_id AND deleted_at IS NULL;
    WHEN 'module_item' THEN
      UPDATE public.module_items SET deleted_at = now(), deleted_by = v_uid
       WHERE id = p_id AND deleted_at IS NULL;
    WHEN 'material' THEN
      UPDATE public.course_materials SET deleted_at = now(), deleted_by = v_uid
       WHERE id = p_id AND deleted_at IS NULL;
    WHEN 'announcement' THEN
      UPDATE public.course_announcements SET deleted_at = now(), deleted_by = v_uid
       WHERE id = p_id AND deleted_at IS NULL;
    WHEN 'topic' THEN
      UPDATE public.discussion_topics SET deleted_at = now(), deleted_by = v_uid
       WHERE id = p_id AND deleted_at IS NULL;
  END CASE;

  PERFORM public.audit_record(
    'content.trash', p_kind, p_id::text,
    jsonb_build_object('label', v_label, 'course_id', v_course, 'purge_after_days', 90)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.trash_content(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trash_content(text, uuid) TO authenticated;

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
      UPDATE public.module_items SET deleted_at = NULL, deleted_by = NULL
       WHERE item_type = 'assignment' AND item_ref_id = p_id AND deleted_at IS NOT NULL;
    WHEN 'module' THEN
      UPDATE public.course_modules SET deleted_at = NULL, deleted_by = NULL
       WHERE id = p_id AND deleted_at IS NOT NULL;
    WHEN 'module_item' THEN
      UPDATE public.module_items SET deleted_at = NULL, deleted_by = NULL
       WHERE id = p_id AND deleted_at IS NOT NULL;
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

-- -----------------------------------------------------------------------------
-- 4. list_trash — admin-only unified listing for the Trash page (one fetch:
--    courses + users + all six content kinds, newest first).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_trash()
  RETURNS TABLE (kind text, id uuid, label text, context text, deleted_at timestamptz)
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT 'course'::text, c.id, c.name,
           COALESCE(p.display_name, '—'), c.deleted_at
      FROM public.courses c LEFT JOIN public.profiles p ON p.id = c.teacher_id
     WHERE c.deleted_at IS NOT NULL
  UNION ALL
    SELECT 'user'::text, u.id, COALESCE(u.display_name, u.email),
           u.email || ' · ' || u.role || ' · sign-in blocked while in trash', u.deleted_at
      FROM public.profiles u
     WHERE u.deleted_at IS NOT NULL
  UNION ALL
    SELECT 'assignment'::text, a.id, a.title, c.name, a.deleted_at
      FROM public.assignments a JOIN public.courses c ON c.id = a.course_id
     WHERE a.deleted_at IS NOT NULL
  UNION ALL
    SELECT 'module'::text, m.id, m.name, c.name, m.deleted_at
      FROM public.course_modules m JOIN public.courses c ON c.id = m.course_id
     WHERE m.deleted_at IS NOT NULL
  UNION ALL
    -- Items hidden as a SIDE EFFECT (assignment unwire / module cascade)
    -- are excluded: they restore with their parent, and listing them
    -- individually would invite restoring a dead link on its own.
    SELECT 'module_item'::text, i.id, i.title, c.name || ' · ' || m.name, i.deleted_at
      FROM public.module_items i
      JOIN public.course_modules m ON m.id = i.module_id
      JOIN public.courses c ON c.id = m.course_id
     WHERE i.deleted_at IS NOT NULL
       AND m.deleted_at IS NULL
       AND NOT (
         i.item_type = 'assignment'
         AND EXISTS (
           SELECT 1 FROM public.assignments a
            WHERE a.id = i.item_ref_id AND a.deleted_at IS NOT NULL
         )
       )
  UNION ALL
    SELECT 'material'::text, mt.id, mt.title, c.name, mt.deleted_at
      FROM public.course_materials mt JOIN public.courses c ON c.id = mt.course_id
     WHERE mt.deleted_at IS NOT NULL
  UNION ALL
    SELECT 'announcement'::text, an.id, an.title, c.name, an.deleted_at
      FROM public.course_announcements an JOIN public.courses c ON c.id = an.course_id
     WHERE an.deleted_at IS NOT NULL
  UNION ALL
    SELECT 'topic'::text, t.id, t.title, c.name, t.deleted_at
      FROM public.discussion_topics t JOIN public.courses c ON c.id = t.course_id
     WHERE t.deleted_at IS NOT NULL
  ORDER BY 5 DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.list_trash() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_trash() TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. purge_trash — extend to the six content kinds. Storage objects of purged
--    materials are left orphaned (accepted; see header).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_trash()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_courses integer := 0;
  v_users   integer := 0;
  v_content integer := 0;
  v_n       integer;
BEGIN
  WITH gone AS (
    DELETE FROM public.courses
     WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days'
     RETURNING id
  )
  SELECT count(*) INTO v_courses FROM gone;

  WITH gone AS (
    DELETE FROM auth.users u
     USING public.profiles p
     WHERE p.id = u.id
       AND p.deleted_at IS NOT NULL
       AND p.deleted_at < now() - interval '90 days'
     RETURNING u.id
  )
  SELECT count(*) INTO v_users FROM gone;

  WITH gone AS (
    DELETE FROM public.assignments
     WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days'
     RETURNING id
  ) SELECT count(*) INTO v_n FROM gone;
  v_content := v_content + v_n;

  WITH gone AS (
    DELETE FROM public.course_modules
     WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days'
     RETURNING id
  ) SELECT count(*) INTO v_n FROM gone;
  v_content := v_content + v_n;

  WITH gone AS (
    DELETE FROM public.module_items
     WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days'
     RETURNING id
  ) SELECT count(*) INTO v_n FROM gone;
  v_content := v_content + v_n;

  WITH gone AS (
    DELETE FROM public.course_materials
     WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days'
     RETURNING id
  ) SELECT count(*) INTO v_n FROM gone;
  v_content := v_content + v_n;

  WITH gone AS (
    DELETE FROM public.course_announcements
     WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days'
     RETURNING id
  ) SELECT count(*) INTO v_n FROM gone;
  v_content := v_content + v_n;

  WITH gone AS (
    DELETE FROM public.discussion_topics
     WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days'
     RETURNING id
  ) SELECT count(*) INTO v_n FROM gone;
  v_content := v_content + v_n;

  IF v_courses > 0 OR v_users > 0 OR v_content > 0 THEN
    INSERT INTO public.audit_events (actor_id, action, target_kind, details)
    VALUES (NULL, 'trash.purge', 'system',
            jsonb_build_object('courses', v_courses, 'users', v_users, 'content', v_content));
  END IF;

  RETURN jsonb_build_object('courses', v_courses, 'users', v_users, 'content', v_content);
END;
$$;
REVOKE ALL ON FUNCTION public.purge_trash() FROM PUBLIC;

-- =============================================================================
-- END 0202
-- =============================================================================
