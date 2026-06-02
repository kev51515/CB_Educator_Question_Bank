-- 0029_notifications.sql
-- In-app notifications table with fanout triggers for announcements,
-- direct messages, and portfolio feedback. Recipient-only RLS.

CREATE TABLE IF NOT EXISTS public.notifications (
  id bigserial PRIMARY KEY,
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_recipient_unread_idx
  ON public.notifications (recipient_id, read_at NULLS FIRST, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notifications: recipient reads" ON public.notifications;
CREATE POLICY "notifications: recipient reads"
  ON public.notifications FOR SELECT
  USING (recipient_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "notifications: recipient updates" ON public.notifications;
CREATE POLICY "notifications: recipient updates"
  ON public.notifications FOR UPDATE
  USING (recipient_id = (SELECT auth.uid()))
  WITH CHECK (recipient_id = (SELECT auth.uid()));

-- Fanout: announcement -> all enrolled students of the course.
CREATE OR REPLACE FUNCTION public.fanout_announcement_notifications() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  INSERT INTO public.notifications (recipient_id, kind, title, body, link)
  SELECT cm.student_id, 'announcement', 'New announcement: ' || NEW.title,
         left(NEW.body, 200), '/courses/' || NEW.course_id || '/announcements'
  FROM public.course_memberships cm
  WHERE cm.course_id = NEW.course_id AND NEW.published = true;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_fanout_announcement ON public.course_announcements;
CREATE TRIGGER trg_fanout_announcement AFTER INSERT ON public.course_announcements
  FOR EACH ROW EXECUTE FUNCTION public.fanout_announcement_notifications();

-- Fanout: message -> the other thread participant.
CREATE OR REPLACE FUNCTION public.fanout_message_notification() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_recipient uuid;
BEGIN
  SELECT CASE WHEN t.participant_a = NEW.author_id THEN t.participant_b ELSE t.participant_a END
  INTO v_recipient FROM public.message_threads t WHERE t.id = NEW.thread_id;
  IF v_recipient IS NOT NULL THEN
    INSERT INTO public.notifications (recipient_id, kind, title, body, link)
    VALUES (v_recipient, 'message', 'New message', left(NEW.body, 200), '/inbox/' || NEW.thread_id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_fanout_message ON public.messages;
CREATE TRIGGER trg_fanout_message AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.fanout_message_notification();

-- Fanout: portfolio feedback -> submission's student.
CREATE OR REPLACE FUNCTION public.fanout_feedback_notification() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_student uuid; v_course uuid;
BEGIN
  SELECT s.student_id, pt.course_id INTO v_student, v_course
  FROM public.portfolio_submissions s
  JOIN public.portfolio_items pi ON pi.id = s.item_id
  JOIN public.portfolio_templates pt ON pt.id = pi.template_id
  WHERE s.id = NEW.submission_id;
  IF v_student IS NOT NULL THEN
    INSERT INTO public.notifications (recipient_id, kind, title, body, link)
    VALUES (v_student, 'feedback', 'New feedback on your portfolio',
            left(NEW.body, 200), '/courses/' || v_course || '/portfolio');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_fanout_feedback ON public.portfolio_feedback;
CREATE TRIGGER trg_fanout_feedback AFTER INSERT ON public.portfolio_feedback
  FOR EACH ROW EXECUTE FUNCTION public.fanout_feedback_notification();
