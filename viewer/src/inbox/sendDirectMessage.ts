/**
 * sendDirectMessage — one-shot "open a thread and post a message" helper.
 * =======================================================================
 * Extracted from the duplicated inline nudge logic in `TeacherJourneyPanel`
 * so other surfaces (the dashboard At-Risk lane) can DM a student without
 * re-implementing the open_thread_with → messages-insert handshake.
 *
 * Pure data access — no toasts, no React. Returns `true` on success so the
 * caller owns the user feedback. RLS scopes `open_thread_with`; a caller who
 * isn't allowed to message the target gets a falsy thread id and `false`.
 */
import { supabase } from "@/lib/supabase";

export async function sendDirectMessage(
  authorId: string,
  otherUserId: string,
  body: string,
): Promise<boolean> {
  try {
    const { data: threadId, error: tErr } = await supabase.rpc("open_thread_with", {
      p_other_user_id: otherUserId,
    });
    if (tErr || typeof threadId !== "string") return false;
    const { error: mErr } = await supabase
      .from("messages")
      .insert({ thread_id: threadId, author_id: authorId, body });
    return !mErr;
  } catch {
    return false;
  }
}
