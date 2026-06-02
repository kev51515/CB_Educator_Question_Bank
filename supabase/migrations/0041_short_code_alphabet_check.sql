-- Tighten short_code format CHECKs to match the actual generator alphabet
-- (excludes confusable chars O/0, I/1, L). Existing data is safe — the
-- generator function has always used this alphabet; only manual inserts
-- could have introduced invalid codes.

ALTER TABLE public.courses
  DROP CONSTRAINT IF EXISTS courses_short_code_format,
  ADD CONSTRAINT courses_short_code_format
    CHECK (short_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$');

ALTER TABLE public.assignments
  DROP CONSTRAINT IF EXISTS assignments_short_code_format,
  ADD CONSTRAINT assignments_short_code_format
    CHECK (short_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$');

ALTER TABLE public.discussion_topics
  DROP CONSTRAINT IF EXISTS discussion_topics_short_code_format,
  ADD CONSTRAINT discussion_topics_short_code_format
    CHECK (short_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$');
