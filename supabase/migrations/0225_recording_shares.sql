-- =============================================================================
-- Migration: 0225_recording_shares.sql
-- Description: Let an educator SHARE a recording with a course's enrolled
--   students (so it can be added to a module as a viewable item). Recordings
--   are otherwise owner-only (0208). A share grants enrolled students READ on
--   the recording, its parts (transcript), its notes, and the audio objects —
--   never write. The owner controls shares; nothing auto-shares.
--
--   Used by the "add a Recording to a module" flow: the teacher picks
--   share-with-students (→ a recording_shares row + a module_items row of
--   item_type='recording') or private (just the teacher-side item).
--
-- Forward-only. Idempotent. Numbered 0225 (0224 taken by a parallel session).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.recording_shares (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id uuid NOT NULL REFERENCES public.recordings(id) ON DELETE CASCADE,
  course_id    uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  shared_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recording_id, course_id)
);

CREATE INDEX IF NOT EXISTS recording_shares_recording_idx
  ON public.recording_shares (recording_id);
CREATE INDEX IF NOT EXISTS recording_shares_course_idx
  ON public.recording_shares (course_id);

ALTER TABLE public.recording_shares ENABLE ROW LEVEL SECURITY;

-- The recording's owner manages its shares (create/list/delete).
DROP POLICY IF EXISTS "recording_shares: owner all" ON public.recording_shares;
CREATE POLICY "recording_shares: owner all"
  ON public.recording_shares
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.recordings r
     WHERE r.id = recording_shares.recording_id AND r.owner_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.recordings r
     WHERE r.id = recording_shares.recording_id AND r.owner_id = (SELECT auth.uid())
  ));

-- Enrolled students may SEE that a recording is shared to their course.
DROP POLICY IF EXISTS "recording_shares: enrolled read" ON public.recording_shares;
CREATE POLICY "recording_shares: enrolled read"
  ON public.recording_shares
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.course_memberships cm
     WHERE cm.course_id = recording_shares.course_id AND cm.student_id = (SELECT auth.uid())
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: is this recording shared to a course the caller is enrolled in?
-- SECURITY DEFINER so it can be used inside storage.objects policies (which run
-- as the querying user) without recursion. Uses auth.uid() internally.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_recording_shared_to_me(p_recording_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.recording_shares rs
      JOIN public.course_memberships cm ON cm.course_id = rs.course_id
     WHERE rs.recording_id = p_recording_id
       AND cm.student_id = auth.uid()
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_recording_shared_to_me(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Extend READ on recordings / parts / notes to shared viewers (additive — these
-- combine with the existing owner + admin SELECT policies via OR).
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "recordings: shared read" ON public.recordings;
CREATE POLICY "recordings: shared read"
  ON public.recordings
  FOR SELECT
  USING (public.is_recording_shared_to_me(id));

DROP POLICY IF EXISTS "recording_parts: shared read" ON public.recording_parts;
CREATE POLICY "recording_parts: shared read"
  ON public.recording_parts
  FOR SELECT
  USING (public.is_recording_shared_to_me(recording_id));

DROP POLICY IF EXISTS "recording_notes: shared read" ON public.recording_notes;
CREATE POLICY "recording_notes: shared read"
  ON public.recording_notes
  FOR SELECT
  USING (public.is_recording_shared_to_me(recording_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- Storage: shared viewers may READ the audio objects. Path is
-- `{owner_id}/{recording_id}/part-n.ext` → the recording id is segment [2].
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "recordings-bucket: shared reads" ON storage.objects;
CREATE POLICY "recordings-bucket: shared reads"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'recordings'
    AND (string_to_array(name, '/'))[2] ~ '^[0-9a-fA-F-]{36}$'
    AND public.is_recording_shared_to_me(((string_to_array(name, '/'))[2])::uuid)
  );

-- =============================================================================
