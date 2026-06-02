CREATE TABLE IF NOT EXISTS public.message_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_a uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  participant_b uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (participant_a < participant_b),  -- canonical ordering for uniqueness
  UNIQUE(participant_a, participant_b)
);
CREATE INDEX IF NOT EXISTS message_threads_a_idx ON public.message_threads (participant_a, last_message_at DESC);
CREATE INDEX IF NOT EXISTS message_threads_b_idx ON public.message_threads (participant_b, last_message_at DESC);

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.message_threads(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  body text NOT NULL,
  read_by_recipient_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_thread_idx ON public.messages (thread_id, created_at);

-- Helper: open or get the canonical thread between two users.
CREATE OR REPLACE FUNCTION public.open_thread_with(p_other_user_id uuid) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_a uuid;
  v_b uuid;
  v_id uuid;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF v_me = p_other_user_id THEN RAISE EXCEPTION 'self_message_not_allowed'; END IF;
  -- canonical sort
  IF v_me < p_other_user_id THEN v_a := v_me; v_b := p_other_user_id;
  ELSE v_a := p_other_user_id; v_b := v_me;
  END IF;
  INSERT INTO public.message_threads (participant_a, participant_b)
    VALUES (v_a, v_b)
  ON CONFLICT (participant_a, participant_b) DO UPDATE SET created_at = message_threads.created_at
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.open_thread_with(uuid) TO authenticated;

-- Trigger to bump last_message_at on new messages.
CREATE OR REPLACE FUNCTION public.bump_thread_last_message() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.message_threads SET last_message_at = NEW.created_at WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_bump_thread_last_message ON public.messages;
CREATE TRIGGER trg_bump_thread_last_message AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.bump_thread_last_message();

-- RLS
ALTER TABLE public.message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "threads: participants see" ON public.message_threads;
CREATE POLICY "threads: participants see"
  ON public.message_threads FOR SELECT
  USING ((SELECT auth.uid()) IN (participant_a, participant_b));

-- Threads can only be opened via the RPC (which has its own auth) — no client insert policy.

DROP POLICY IF EXISTS "messages: participants read" ON public.messages;
CREATE POLICY "messages: participants read"
  ON public.messages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.message_threads t
    WHERE t.id = thread_id
      AND (SELECT auth.uid()) IN (t.participant_a, t.participant_b)
  ));

DROP POLICY IF EXISTS "messages: participants send" ON public.messages;
CREATE POLICY "messages: participants send"
  ON public.messages FOR INSERT
  WITH CHECK (
    author_id = (SELECT auth.uid()) AND
    EXISTS (
      SELECT 1 FROM public.message_threads t
      WHERE t.id = thread_id
        AND (SELECT auth.uid()) IN (t.participant_a, t.participant_b)
    )
  );

DROP POLICY IF EXISTS "messages: recipient marks read" ON public.messages;
CREATE POLICY "messages: recipient marks read"
  ON public.messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.message_threads t
      WHERE t.id = thread_id
        AND (SELECT auth.uid()) IN (t.participant_a, t.participant_b)
    )
  )
  WITH CHECK (
    -- Only allow read flag updates by the non-author
    author_id <> (SELECT auth.uid())
  );
