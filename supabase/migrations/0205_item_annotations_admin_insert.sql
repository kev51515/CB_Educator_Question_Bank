-- 0205_item_annotations_admin_insert.sql
-- Hotfix to 0204's INSERT policy. The review surface lets an ADMIN review any
-- course that links a test (list_test_review_courses: `v_admin OR teacher_id =
-- v_uid`), but 0204 gated INSERT on is_teacher_of_course (strict owner match,
-- no admin override). Net effect: an admin reviewing a course owned by the
-- OTHER teacher could highlight on screen but the debounced save silently
-- failed — annotations gone on reload. Align the write gate with the read
-- surface's access model: own-course teacher OR admin. Rows stay author-only
-- (teacher_id = auth.uid()), so this widens which COURSES an admin may file
-- their own annotations under, never whose annotations they can touch.

DROP POLICY IF EXISTS "item_annotations: author inserts" ON public.teacher_item_annotations;
CREATE POLICY "item_annotations: author inserts"
  ON public.teacher_item_annotations FOR INSERT
  WITH CHECK (
    teacher_id = (SELECT auth.uid())
    AND (
      public.is_teacher_of_course((SELECT auth.uid()), course_id)
      OR public.is_admin((SELECT auth.uid()))
    )
  );
