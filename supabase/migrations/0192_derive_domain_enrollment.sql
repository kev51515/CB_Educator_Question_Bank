-- =============================================================================
-- 0192_derive_domain_enrollment.sql
--
-- derive_user_domain (0186) only looked at TAUGHT courses (teacher_id), so a
-- student/player always defaulted to 'academic' and their whole-app shell stayed
-- indigo/"Student". Extend it to fall back to ENROLLED courses: a user enrolled
-- in pickleball courses (and teaching none of a given vertical) now derives
-- 'coaching', so a Player's shell themes orange + reads "Player".
--
-- Precedence: a vertical you TEACH wins over one you're enrolled in; coaching
-- wins over counseling wins over academic. Idempotent (CREATE OR REPLACE).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.derive_user_domain(p_user uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
  SELECT CASE
    WHEN p_user IS NULL THEN 'academic'
    -- taught vertical takes precedence
    WHEN EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.teacher_id = p_user
        AND c.course_type IN ('pickleball_player', 'pickleball_coach')
    ) THEN 'coaching'
    WHEN EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.teacher_id = p_user AND c.course_type = 'counseling'
    ) THEN 'counseling'
    -- else fall back to ENROLLED vertical (students / players)
    WHEN EXISTS (
      SELECT 1 FROM public.course_memberships m
      JOIN public.courses c ON c.id = m.course_id
      WHERE m.student_id = p_user
        AND c.course_type IN ('pickleball_player', 'pickleball_coach')
    ) THEN 'coaching'
    WHEN EXISTS (
      SELECT 1 FROM public.course_memberships m
      JOIN public.courses c ON c.id = m.course_id
      WHERE m.student_id = p_user AND c.course_type = 'counseling'
    ) THEN 'counseling'
    ELSE 'academic'
  END;
$function$;

-- =============================================================================
-- END 0192
-- =============================================================================
