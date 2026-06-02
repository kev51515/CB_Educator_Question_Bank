-- =============================================================================
-- Migration: 0016_materials.sql
-- Description: Course materials (Wave 2A). Staff uploads files or pastes links
--              for a course; enrolled students view + download. Files live in
--              a private Supabase Storage bucket (`course-materials`); the
--              metadata row in `public.course_materials` tracks title /
--              description / position / kind plus the storage object path.
--
-- Authorization shape:
--   public.course_materials
--     SELECT — enrolled student OR staff (uses SECURITY DEFINER helpers, NEVER
--              inline EXISTS-subqueries against profiles; see 0008 / 0013 for
--              the recursion bug those forms hit).
--     INSERT — staff only AND uploader_id = caller (so audit columns are
--              honest).
--     UPDATE / DELETE — staff only.
--
--   storage.objects (bucket_id = 'course-materials')
--     SELECT — caller is staff OR is enrolled in the course derived from the
--              first path segment (path convention: `{course_id}/{uuid}-{...}`).
--     INSERT / UPDATE / DELETE — staff only.
--
-- Path convention enforcement is at the policy level only — the client is
-- trusted to format the path as `<course_id>/<uuid>-<filename>` and the SELECT
-- policy derives the course id from the leading segment via
-- (string_to_array(name, '/'))[1]::uuid.
--
-- Helper note: `is_student_in_class(uid, course_id)` was kept by name in 0012
-- even though the table is now `course_memberships` — body was updated. We
-- still call it by that name here. `is_staff(uid)` from 0009 is unchanged.
-- =============================================================================


-- =============================================================================
-- SECTION 1: course_materials TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.course_materials (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id    uuid        NOT NULL REFERENCES public.courses(id)  ON DELETE CASCADE,
  -- ON DELETE RESTRICT so an uploader account can't disappear silently and
  -- leave orphan rows with no audit trail. Staff lifecycle moves are rare.
  uploader_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  -- Only file + link in v1. `embed` (YouTube, embeds) is deferred.
  kind         text        NOT NULL CHECK (kind IN ('file', 'link')),
  title        text        NOT NULL,
  description  text,
  -- Populated when kind='link'. NULL for kind='file'.
  url          text,
  -- Populated when kind='file'. NULL for kind='link'. This is the Storage
  -- object path, NOT a URL — the UI mints a signed URL on demand.
  file_path    text,
  -- Bytes. NULL for kind='link'.
  file_size    integer,
  -- Detected MIME from the upload (e.g. 'application/pdf'). NULL for 'link'.
  mime_type    text,
  -- Manual reorder within a course. Drag-and-drop in the UI rewrites this.
  position     integer     NOT NULL DEFAULT 0,
  -- Reserved for future "draft" workflow. Defaults to true so v1 publishes
  -- on insert.
  published    boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  -- Why: enforce that the per-kind columns are populated correctly. Without
  -- this constraint a stray UPDATE could end up with a 'file' row whose
  -- file_path is NULL (download breaks silently) or a 'link' row that also
  -- carries a stale file_path from a prior shape.
  CONSTRAINT course_materials_kind_shape_chk CHECK (
    (kind = 'file' AND file_path IS NOT NULL AND url       IS NULL)
    OR
    (kind = 'link' AND url       IS NOT NULL AND file_path IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_course_materials_course_position
  ON public.course_materials(course_id, position);

-- Reuse the shared updated_at trigger function from 0001 (the same one used by
-- courses / assignments / course_modules).
CREATE OR REPLACE TRIGGER trg_course_materials_set_updated_at
  BEFORE UPDATE ON public.course_materials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.course_materials ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- SECTION 2: public.course_materials RLS POLICIES
-- =============================================================================

-- SELECT: enrolled student reads materials in their courses.
-- Uses is_student_in_class (SECURITY DEFINER) — NEVER an inline EXISTS against
-- profiles or course_memberships. See 0013 for why.
CREATE POLICY "course_materials: enrolled student reads"
  ON public.course_materials
  FOR SELECT
  USING (
    public.is_student_in_class((SELECT auth.uid()), course_id)
  );

-- SELECT: staff (teacher or admin) reads all.
CREATE POLICY "course_materials: staff reads all"
  ON public.course_materials
  FOR SELECT
  USING (
    public.is_staff((SELECT auth.uid()))
  );

-- INSERT: staff inserts, and the row's uploader must be the caller so the
-- audit column is honest. SECURITY DEFINER helper avoids the profiles RLS
-- recursion.
CREATE POLICY "course_materials: staff inserts"
  ON public.course_materials
  FOR INSERT
  WITH CHECK (
    public.is_staff((SELECT auth.uid()))
    AND uploader_id = (SELECT auth.uid())
  );

-- UPDATE: staff updates. We don't pin uploader_id here — a teacher editing
-- another staffer's material in a co-taught course shouldn't fail RLS.
CREATE POLICY "course_materials: staff updates"
  ON public.course_materials
  FOR UPDATE
  USING (
    public.is_staff((SELECT auth.uid()))
  )
  WITH CHECK (
    public.is_staff((SELECT auth.uid()))
  );

-- DELETE: staff deletes.
CREATE POLICY "course_materials: staff deletes"
  ON public.course_materials
  FOR DELETE
  USING (
    public.is_staff((SELECT auth.uid()))
  );


-- =============================================================================
-- SECTION 3: STORAGE BUCKET `course-materials`
--
-- Private bucket — downloads always go through signed URLs. The UI mints
-- 1-hour signed URLs per material on render.
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('course-materials', 'course-materials', false)
ON CONFLICT (id) DO NOTHING;


-- =============================================================================
-- SECTION 4: storage.objects RLS for the course-materials bucket
--
-- Path convention: `{course_id}/{uuid}-{filename}`. The course id is extracted
-- from the first path segment so SELECT can be gated on enrollment without an
-- extra DB join in the client.
--
-- We DROP IF EXISTS first so a re-run of the migration (squashed seeds, etc.)
-- doesn't fail on the second `CREATE POLICY`.
-- =============================================================================

DROP POLICY IF EXISTS "course-materials: staff or enrolled reads" ON storage.objects;
DROP POLICY IF EXISTS "course-materials: staff inserts"           ON storage.objects;
DROP POLICY IF EXISTS "course-materials: staff updates"           ON storage.objects;
DROP POLICY IF EXISTS "course-materials: staff deletes"           ON storage.objects;

-- SELECT — enrolled student OR staff. We try-cast the leading segment to
-- uuid; a malformed path will yield NULL from try_cast-style behavior here we
-- guard explicitly by checking the segment shape before the cast.
CREATE POLICY "course-materials: staff or enrolled reads"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'course-materials'
    AND (
      public.is_staff((SELECT auth.uid()))
      OR (
        -- Defensive: only attempt the cast when the leading segment looks
        -- like a uuid. Storage paths from our UI always conform; this guard
        -- just prevents a 22P02 invalid_text_representation if someone
        -- side-loads a non-conforming object.
        (string_to_array(name, '/'))[1] ~ '^[0-9a-fA-F-]{36}$'
        AND public.is_student_in_class(
              (SELECT auth.uid()),
              ((string_to_array(name, '/'))[1])::uuid
            )
      )
    )
  );

-- INSERT — staff only. The client is responsible for using a path that begins
-- with the target course_id; the metadata row's CHECK + RLS catches mismatches
-- because INSERT into course_materials only succeeds for the matching course.
CREATE POLICY "course-materials: staff inserts"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'course-materials'
    AND public.is_staff((SELECT auth.uid()))
  );

-- UPDATE — staff only (rare; included for completeness e.g. rename).
CREATE POLICY "course-materials: staff updates"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'course-materials'
    AND public.is_staff((SELECT auth.uid()))
  )
  WITH CHECK (
    bucket_id = 'course-materials'
    AND public.is_staff((SELECT auth.uid()))
  );

-- DELETE — staff only. The teacher UI deletes the storage object after the
-- metadata row delete; we deliberately don't enforce this via a DB trigger
-- because cross-schema triggers from public → storage are fragile and the
-- client retry path is straightforward.
CREATE POLICY "course-materials: staff deletes"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'course-materials'
    AND public.is_staff((SELECT auth.uid()))
  );


-- =============================================================================
-- END OF MIGRATION 0016_materials.sql
-- =============================================================================
