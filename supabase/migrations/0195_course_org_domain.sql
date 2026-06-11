-- =============================================================================
-- Migration: 0195_course_org_domain.sql
-- Description: Domain-scope the per-teacher course organization layer (folders
--              + tags from 0188) to the WORKSPACE model. Owner decision: the
--              active domain IS the workspace — the courses page hard-scopes to
--              the rail's DomainSwitcher selection and per-page domain filter
--              chips are removed. Folders and tags therefore belong to exactly
--              one domain ('academic' | 'counseling' | 'coaching'), so each
--              workspace shows only its own organizational rail.
--
-- WHAT THIS DOES
-- --------------
--   1. ALTER course_folders + course_tags ADD domain text NOT NULL DEFAULT
--      'academic' with a CHECK on the three domain values.
--   2. Backfill each EXISTING folder/tag to the MAJORITY domain of the courses
--      currently filed under it (course_folder_items / course_tag_items JOIN
--      courses ON course_type, CASE-mapped to a domain; DISTINCT ON picks the
--      domain with the highest count per folder/tag). Zero-item folders/tags
--      keep the 'academic' default.
--   3. Index (owner_id, domain) on both tables — the client always queries
--      "my folders/tags in this workspace".
--
-- No RLS changes: the 0188 owner-only policies are FOR ALL and keyed on
-- owner_id alone, so the new column is covered automatically. Edge tables
-- (course_folder_items / course_tag_items) inherit the scope through their
-- parent folder/tag — no column needed there.
--
-- Forward-only; idempotent where cheap (IF NOT EXISTS on columns/indexes; the
-- backfill only rewrites rows whose domain actually differs).
-- =============================================================================

-- ---- 1. domain columns -------------------------------------------------------
ALTER TABLE public.course_folders
  ADD COLUMN IF NOT EXISTS domain text NOT NULL DEFAULT 'academic'
  CHECK (domain IN ('academic', 'counseling', 'coaching'));

ALTER TABLE public.course_tags
  ADD COLUMN IF NOT EXISTS domain text NOT NULL DEFAULT 'academic'
  CHECK (domain IN ('academic', 'counseling', 'coaching'));

-- ---- 2. backfill to the majority domain of contained courses ------------------
-- course_type → domain mapping mirrors viewer/src/lib/domain.ts::domainOf
-- (unknown / NULL course types fall back to 'academic').
WITH folder_majority AS (
  SELECT DISTINCT ON (fi.folder_id)
         fi.folder_id,
         CASE
           WHEN c.course_type = 'counseling' THEN 'counseling'
           WHEN c.course_type IN ('pickleball_player', 'pickleball_coach') THEN 'coaching'
           ELSE 'academic'
         END AS domain,
         count(*) AS n
  FROM public.course_folder_items fi
  JOIN public.courses c ON c.id = fi.course_id
  GROUP BY fi.folder_id, 2
  ORDER BY fi.folder_id, count(*) DESC
)
UPDATE public.course_folders f
SET domain = fm.domain
FROM folder_majority fm
WHERE fm.folder_id = f.id
  AND f.domain IS DISTINCT FROM fm.domain;

WITH tag_majority AS (
  SELECT DISTINCT ON (ti.tag_id)
         ti.tag_id,
         CASE
           WHEN c.course_type = 'counseling' THEN 'counseling'
           WHEN c.course_type IN ('pickleball_player', 'pickleball_coach') THEN 'coaching'
           ELSE 'academic'
         END AS domain,
         count(*) AS n
  FROM public.course_tag_items ti
  JOIN public.courses c ON c.id = ti.course_id
  GROUP BY ti.tag_id, 2
  ORDER BY ti.tag_id, count(*) DESC
)
UPDATE public.course_tags t
SET domain = tm.domain
FROM tag_majority tm
WHERE tm.tag_id = t.id
  AND t.domain IS DISTINCT FROM tm.domain;

-- ---- 3. workspace lookup indexes ----------------------------------------------
CREATE INDEX IF NOT EXISTS course_folders_owner_domain_idx
  ON public.course_folders(owner_id, domain);
CREATE INDEX IF NOT EXISTS course_tags_owner_domain_idx
  ON public.course_tags(owner_id, domain);
