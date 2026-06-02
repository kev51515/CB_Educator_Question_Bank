-- =============================================================================
-- Migration: 0038_course_short_codes.sql
-- Description: Add a stable 6-character `short_code` to `courses` so URLs can
--   read as `/courses/AB12CD/modules` instead of `/courses/339fac02-c4b3-…`.
--
--   * Separate from `join_code` (which is meant to be rotatable on leak).
--     `short_code` is stable for the life of the course so bookmarks +
--     shared URLs never break.
--   * Alphabet excludes confusable chars (O/0, I/1, L). 31 chars; 31^6 ≈
--     887M unique codes — way more than we'll ever need; collision retry
--     handles the birthday-paradox tail.
--   * Populated for existing rows via the generator; new rows get one via
--     a BEFORE INSERT trigger (DEFAULT can't reference the generator
--     reliably across all PostgREST insert shapes).
-- =============================================================================

-- 1. Code generator. Loops until a collision-free code is found. The unique
--    constraint added below is the real safety net; this just keeps the loop
--    from ever needing more than ~1 try in practice.
CREATE OR REPLACE FUNCTION public.generate_course_short_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  alphabet_len constant int := length(alphabet);
  code text;
  exists_already boolean;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..6 LOOP
      code := code || substr(alphabet, floor(random() * alphabet_len)::int + 1, 1);
    END LOOP;
    SELECT EXISTS (SELECT 1 FROM public.courses WHERE short_code = code)
      INTO exists_already;
    IF NOT exists_already THEN
      RETURN code;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_course_short_code() TO anon, authenticated, service_role;

-- 2. Add the column (nullable for backfill).
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS short_code text;

-- 3. Backfill existing rows.
UPDATE public.courses
   SET short_code = public.generate_course_short_code()
 WHERE short_code IS NULL;

-- 4. Enforce NOT NULL + UNIQUE + length sanity.
ALTER TABLE public.courses
  ALTER COLUMN short_code SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'courses_short_code_unique'
  ) THEN
    ALTER TABLE public.courses
      ADD CONSTRAINT courses_short_code_unique UNIQUE (short_code);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'courses_short_code_format'
  ) THEN
    ALTER TABLE public.courses
      ADD CONSTRAINT courses_short_code_format
      CHECK (short_code ~ '^[A-Z0-9]{6}$');
  END IF;
END;
$$;

-- 5. BEFORE INSERT trigger to auto-populate when caller doesn't provide one.
--    SECURITY DEFINER because the function reads/writes its own table and
--    the trigger fires under whatever role the inserter is.
CREATE OR REPLACE FUNCTION public.set_course_short_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.short_code IS NULL THEN
    NEW.short_code := public.generate_course_short_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_course_short_code ON public.courses;
CREATE TRIGGER trg_set_course_short_code
  BEFORE INSERT ON public.courses
  FOR EACH ROW
  EXECUTE FUNCTION public.set_course_short_code();

-- 6. Index for short-code lookups (UNIQUE constraint already creates one,
--    but be explicit so future readers see the access pattern).
COMMENT ON COLUMN public.courses.short_code IS
  '6-char A-Z/2-9 code used in URLs. Stable for the life of the course; never rotated.';
