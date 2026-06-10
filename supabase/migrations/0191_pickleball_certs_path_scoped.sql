-- =============================================================================
-- 0191_pickleball_certs_path_scoped.sql
--
-- Tighten the 'pickleball-certs' storage RLS from the 0190 interim ("any
-- authenticated user can read/write the bucket") to COURSE-PATH-SCOPED access,
-- mirroring the 'course-materials' bucket in 0016.
--
-- Cert objects are uploaded at path  <course_id>/<coach_id>/<file>  (see
-- CertificationsPanel). So:
--   - an educator of <course_id> (or an admin) can read/write any cert in that course
--   - the coach themself (<coach_id> = auth.uid()) can read/write their own
--
-- Idempotent + forward-only. Provisional number — renumber at apply if needed.
-- =============================================================================

-- Replace the broad 0190 policy with the path-scoped one.
DROP POLICY IF EXISTS "pickleball-certs read/write" ON storage.objects;
DROP POLICY IF EXISTS "pickleball-certs course-scoped" ON storage.objects;

CREATE POLICY "pickleball-certs course-scoped"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'pickleball-certs'
    -- leading segment must look like a uuid before we cast (guards 22P02)
    AND (string_to_array(name, '/'))[1] ~ '^[0-9a-fA-F-]{36}$'
    AND (
      public.is_admin((SELECT auth.uid()))
      OR public.is_teacher_of_course(
           (SELECT auth.uid()),
           ((string_to_array(name, '/'))[1])::uuid
         )
      OR (
        (string_to_array(name, '/'))[2] ~ '^[0-9a-fA-F-]{36}$'
        AND ((string_to_array(name, '/'))[2])::uuid = (SELECT auth.uid())
      )
    )
  )
  WITH CHECK (
    bucket_id = 'pickleball-certs'
    AND (string_to_array(name, '/'))[1] ~ '^[0-9a-fA-F-]{36}$'
    AND (
      public.is_admin((SELECT auth.uid()))
      OR public.is_teacher_of_course(
           (SELECT auth.uid()),
           ((string_to_array(name, '/'))[1])::uuid
         )
      OR (
        (string_to_array(name, '/'))[2] ~ '^[0-9a-fA-F-]{36}$'
        AND ((string_to_array(name, '/'))[2])::uuid = (SELECT auth.uid())
      )
    )
  );

-- =============================================================================
-- END 0191
-- =============================================================================
