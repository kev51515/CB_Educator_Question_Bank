-- Assignment deletes (per Wave 5B follow-up).
CREATE OR REPLACE FUNCTION public.audit_assignment_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (auth.uid(), 'assignment.delete', 'assignment', OLD.id::text,
          jsonb_build_object('title', OLD.title, 'course_id', OLD.course_id));
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS trg_audit_assignment_delete ON public.assignments;
CREATE TRIGGER trg_audit_assignment_delete BEFORE DELETE ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.audit_assignment_delete();

-- Course-material deletes.
CREATE OR REPLACE FUNCTION public.audit_material_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (auth.uid(), 'material.delete', 'course_material', OLD.id::text,
          jsonb_build_object('title', OLD.title, 'kind', OLD.kind, 'course_id', OLD.course_id));
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS trg_audit_material_delete ON public.course_materials;
CREATE TRIGGER trg_audit_material_delete BEFORE DELETE ON public.course_materials
  FOR EACH ROW EXECUTE FUNCTION public.audit_material_delete();

-- Announcement deletes.
CREATE OR REPLACE FUNCTION public.audit_announcement_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (auth.uid(), 'announcement.delete', 'course_announcement', OLD.id::text,
          jsonb_build_object('title', OLD.title, 'course_id', OLD.course_id));
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS trg_audit_announcement_delete ON public.course_announcements;
CREATE TRIGGER trg_audit_announcement_delete BEFORE DELETE ON public.course_announcements
  FOR EACH ROW EXECUTE FUNCTION public.audit_announcement_delete();
