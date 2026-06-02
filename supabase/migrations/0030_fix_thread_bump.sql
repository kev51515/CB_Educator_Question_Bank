-- =============================================================================
-- Migration: 0030_fix_thread_bump.sql
-- Description: smoke-features.mjs Wave 7B caught: the message-insert trigger
--   `bump_thread_last_message` from 0026 was plain LANGUAGE plpgsql with no
--   SECURITY DEFINER. The trigger UPDATEs message_threads, which has no
--   UPDATE policy granted to end users (intentionally — threads are opened
--   only via open_thread_with RPC). So the bump fired in the caller's role,
--   hit RLS, and silently failed. Reads of last_message_at then stayed NULL.
--
--   Fix: SECURITY DEFINER + explicit search_path. Same pattern as the
--   announcement / message / feedback fanout triggers in 0029.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.bump_thread_last_message() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  UPDATE public.message_threads
     SET last_message_at = NEW.created_at
   WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;
