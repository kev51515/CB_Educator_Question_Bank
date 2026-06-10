-- =============================================================================
-- 0190_pickleball_followups.sql
--
-- DB-side follow-ups for the pickleball surface (Lane D). Three independent,
-- idempotent, forward-only changes:
--
--   1. Make the 'pickleball-certs' storage bucket PRIVATE. Cert files were
--      created in a PUBLIC bucket; flipping public=false means they're only
--      reachable via signed URLs from now on.
--   2. Add storage.objects RLS for the certs bucket so signed URLs continue
--      to work for authenticated users once the bucket is private.
--   3. Tighten homework writes — drop the player UPDATE policy on
--      public.pickleball_homework so the SECURITY DEFINER RPC
--      pk_set_homework_status becomes the ONLY player write path (it only
--      touches status / completed_at). Educator-manage + player-SELECT
--      policies stay intact.
--
-- NOTE: the file number (0190) is PROVISIONAL and may be renumbered at apply
-- time. Everything below is guarded with IF EXISTS / ON CONFLICT / drop+create
-- so re-running is safe.
-- =============================================================================


-- =============================================================================
-- SECTION 1: certs bucket goes PRIVATE
--
-- Idempotent: the UPDATE is a no-op if the bucket is already private (or
-- doesn't exist yet — nothing matches the WHERE).
-- =============================================================================

UPDATE storage.buckets
SET public = false
WHERE id = 'pickleball-certs';


-- =============================================================================
-- SECTION 2: storage.objects RLS for the 'pickleball-certs' bucket
--
-- Kept deliberately simple + safe: any authenticated user may read/write
-- objects in this bucket, which is what lets signed URLs resolve and lets the
-- cert-upload flow continue to work now that the bucket is private.
--
-- FUTURE TIGHTENING: this is intentionally NOT path-scoped to a course. A
-- proper course-level RLS (e.g. parsing the first path segment as a course id
-- and gating on is_teacher_of_course / enrollment, matching the
-- 'course-materials' bucket in 0016) is a follow-up. For now the requirement
-- is just to stop the bucket being world-public while keeping signed URLs
-- working for signed-in people.
--
-- drop+recreate for idempotency.
-- =============================================================================

DROP POLICY IF EXISTS "pickleball-certs read/write" ON storage.objects;
CREATE POLICY "pickleball-certs read/write"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (bucket_id = 'pickleball-certs')
  WITH CHECK (bucket_id = 'pickleball-certs');


-- =============================================================================
-- SECTION 3: tighten homework writes — remove direct player UPDATE
--
-- Dropped policy (exact name from 0181):
--   "pk_homework: player updates own status"  ON public.pickleball_homework
--
-- 0181 added this as a defence-in-depth backstop, but it let a player UPDATE
-- arbitrary columns on their own homework row (the WITH CHECK can't reference
-- OLD, so e.g. drill_id / due_on / notes could be changed as long as the row
-- stayed theirs and status stayed in the self-service set). The canonical and
-- now ONLY player write path is the SECURITY DEFINER RPC
-- pk_set_homework_status(p_id, p_status), which only changes status /
-- completed_at.
--
-- LEFT INTACT:
--   "pk_homework: educator manages"  (FOR ALL — educator full control)
--   "pk_homework: player reads own"  (FOR SELECT — player still reads own rows)
--
-- DROP POLICY IF EXISTS for idempotency.
-- =============================================================================

DROP POLICY IF EXISTS "pk_homework: player updates own status"
  ON public.pickleball_homework;
