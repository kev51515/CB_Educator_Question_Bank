-- =============================================================================
-- Migration: 0188_course_organization.sql
-- Description: A PER-TEACHER organizational layer over courses — folders + tags,
--              like Gmail labels / Drive folders. Private to each educator: a
--              shared course can sit in one teacher's "Spring 2026" folder and
--              another teacher's "Evening" folder with no conflict. Nothing here
--              changes course ownership, visibility, or the courses table.
--
-- MODEL
-- -----
--   course_folders      one row per (owner, folder). A course belongs to AT MOST
--                       one folder per owner (course_folder_items PK on
--                       (owner_id, course_id)). Flat — no nesting in v1.
--   course_folder_items (owner, course) → folder. The membership edge.
--   course_tags         one row per (owner, tag). Case-insensitively unique per
--                       owner. Colored. A course can carry MANY tags.
--   course_tag_items    (course, tag) edge, owner-stamped for RLS.
--
-- owner_id is denormalised onto every edge table so RLS is a plain
-- `owner_id = auth.uid()` equality — no subquery into courses (avoids the
-- recursive-policy class of bug noted in CLAUDE.md). Visibility of the course
-- itself is still governed by the courses RLS; these tables only hold a
-- teacher's private association.
--
-- All tables: owner-only RLS (the owner can read/write their own rows; nobody
-- else, admins included — personal organization isn't shared). Cascade on the
-- owner profile AND the course/folder/tag so deleting any of them tidies the
-- edges automatically. Forward-only, idempotent (IF NOT EXISTS / DROP POLICY IF
-- EXISTS guards) so it can be applied directly or via `supabase db push`.
-- =============================================================================

-- ---- folders ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.course_folders (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  color      text,                              -- optional palette token / hex
  position   integer NOT NULL DEFAULT 0,        -- manual ordering in the rail
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS course_folders_owner_idx ON public.course_folders(owner_id);

CREATE TABLE IF NOT EXISTS public.course_folder_items (
  owner_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  folder_id uuid NOT NULL REFERENCES public.course_folders(id) ON DELETE CASCADE,
  PRIMARY KEY (owner_id, course_id)            -- one folder per course per owner
);
CREATE INDEX IF NOT EXISTS course_folder_items_folder_idx ON public.course_folder_items(folder_id);

-- ---- tags ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.course_tags (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
  color      text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS course_tags_owner_idx ON public.course_tags(owner_id);
-- case-insensitively unique tag name per owner
CREATE UNIQUE INDEX IF NOT EXISTS course_tags_owner_name_uniq
  ON public.course_tags(owner_id, lower(name));

CREATE TABLE IF NOT EXISTS public.course_tag_items (
  owner_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  tag_id    uuid NOT NULL REFERENCES public.course_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (course_id, tag_id)
);
CREATE INDEX IF NOT EXISTS course_tag_items_owner_idx  ON public.course_tag_items(owner_id);
CREATE INDEX IF NOT EXISTS course_tag_items_tag_idx    ON public.course_tag_items(tag_id);

-- ---- RLS: owner-only on every table ----------------------------------------
ALTER TABLE public.course_folders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_folder_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_tags         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_tag_items    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS course_folders_owner      ON public.course_folders;
DROP POLICY IF EXISTS course_folder_items_owner ON public.course_folder_items;
DROP POLICY IF EXISTS course_tags_owner         ON public.course_tags;
DROP POLICY IF EXISTS course_tag_items_owner    ON public.course_tag_items;

CREATE POLICY course_folders_owner ON public.course_folders
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY course_folder_items_owner ON public.course_folder_items
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY course_tags_owner ON public.course_tags
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY course_tag_items_owner ON public.course_tag_items
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_folders      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_folder_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_tags         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_tag_items    TO authenticated;
