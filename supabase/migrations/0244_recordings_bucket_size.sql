-- =============================================================================
-- Migration: 0244_recordings_bucket_size.sql
-- Description: Allow large audio/video uploads (e.g. a downloaded Fathom MP4)
--   into the private 'recordings' bucket. 0208 created the bucket with no
--   file_size_limit, so it inherited the project default (too small for a
--   meeting video). Raise it to 500 MB — the same ceiling the existing
--   'pickleball-videos' bucket already uses, so it's within the project's
--   global storage limit.
--
--   allowed_mime_types stays NULL (any) — the recorder uploads webm/m4a/mp3/wav
--   and an uploaded Fathom recording is video/mp4, all fine.
--
-- Forward-only. Idempotent.
-- =============================================================================

-- 1000 MB. NOTE: the effective cap is min(this, the PROJECT global storage
-- limit), so the project's global "Upload file size limit" (Dashboard →
-- Settings → Storage) must also be ≥ this for large uploads to land.
UPDATE storage.buckets
   SET file_size_limit = 1048576000  -- 1000 MB
 WHERE id = 'recordings';

-- =============================================================================
-- END OF MIGRATION 0244_recordings_bucket_size.sql
-- =============================================================================
