-- =============================================================================
-- 0193_player_lesson_clips.sql
--
-- Per-vertical "who can contribute" rules:
--   • COACHING: a player can upload/attach their OWN video clips + URLs to their
--     lessons (for the coach to analyze) and remove only their own; the coach
--     (educator) keeps full control of all lesson content.
--   • COUNSELING: advisees may upload + REVISE their own portfolio submissions but
--     may no longer DELETE them (safer "revise, don't destroy" model; item order
--     is already staff-only).
--   • ACADEMIC: unchanged (students are read-only).
--
-- Also tidies a storage loose end: the broad "pickleball buckets rw" policy
-- (created with the buckets) covered BOTH buckets and undermined the
-- course-scoped certs policy from 0191 — replace it with a videos-only policy.
-- =============================================================================

-- 1) who added each lesson video
ALTER TABLE public.pickleball_lesson_videos
  ADD COLUMN IF NOT EXISTS added_by uuid REFERENCES public.profiles(id);

-- 2) pk_add_lesson_video — educator OR the lesson's own player; stamps added_by
CREATE OR REPLACE FUNCTION public.pk_add_lesson_video(p_lesson_id uuid, p_kind text, p_url text DEFAULT NULL::text, p_storage_path text DEFAULT NULL::text, p_title text DEFAULT NULL::text)
 RETURNS pickleball_lesson_videos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_lesson public.pickleball_lessons;
  v_row    public.pickleball_lesson_videos;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('link', 'upload') THEN RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023'; END IF;
  IF p_kind = 'link'   AND (p_url IS NULL OR btrim(p_url) = '') THEN RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023'; END IF;
  IF p_kind = 'upload' AND (p_storage_path IS NULL OR btrim(p_storage_path) = '') THEN RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023'; END IF;

  SELECT * INTO v_lesson FROM public.pickleball_lessons WHERE id = p_lesson_id;
  IF v_lesson.id IS NULL THEN RAISE EXCEPTION 'not_found' USING ERRCODE = '02000'; END IF;

  -- educator/admin of the course, OR the lesson's own player (uploading film for analysis)
  IF NOT (
    public.is_teacher_of_course(v_caller, v_lesson.course_id)
    OR public.is_admin(v_caller)
    OR v_lesson.player_id = v_caller
  ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.pickleball_lesson_videos (lesson_id, kind, url, storage_path, title, sort_order, added_by)
  VALUES (
    p_lesson_id, p_kind,
    CASE WHEN p_kind = 'link'   THEN btrim(p_url)          ELSE NULL END,
    CASE WHEN p_kind = 'upload' THEN btrim(p_storage_path) ELSE NULL END,
    NULLIF(btrim(COALESCE(p_title, '')), ''),
    COALESCE((SELECT MAX(sort_order) + 1 FROM public.pickleball_lesson_videos WHERE lesson_id = p_lesson_id), 0),
    v_caller
  )
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;

-- 3) pk_delete_lesson_video — educator any; player only the clips THEY added
CREATE OR REPLACE FUNCTION public.pk_delete_lesson_video(p_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_video  public.pickleball_lesson_videos;
  v_lesson public.pickleball_lessons;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  SELECT * INTO v_video FROM public.pickleball_lesson_videos WHERE id = p_id;
  IF v_video.id IS NULL THEN RAISE EXCEPTION 'not_found' USING ERRCODE = '02000'; END IF;
  SELECT * INTO v_lesson FROM public.pickleball_lessons WHERE id = v_video.lesson_id;
  IF v_lesson.id IS NULL THEN RAISE EXCEPTION 'not_found' USING ERRCODE = '02000'; END IF;

  IF NOT (
    public.is_teacher_of_course(v_caller, v_lesson.course_id)
    OR public.is_admin(v_caller)
    OR v_video.added_by = v_caller   -- the player can remove a clip they added
  ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.pickleball_lesson_videos WHERE id = p_id;
  RETURN p_id;
END;
$function$;

-- 4) COUNSELING: advisees may revise but not DELETE their portfolio submissions
DROP POLICY IF EXISTS "portfolio_submissions: student deletes own" ON public.portfolio_submissions;

-- 5) Storage: replace the broad two-bucket policy with a videos-only one so the
--    0191 course-scoped certs policy actually governs the certs bucket.
DROP POLICY IF EXISTS "pickleball buckets rw" ON storage.objects;
DROP POLICY IF EXISTS "pickleball-videos read/write" ON storage.objects;
CREATE POLICY "pickleball-videos read/write"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'pickleball-videos')
  WITH CHECK (bucket_id = 'pickleball-videos');

-- =============================================================================
-- END 0193
-- =============================================================================
