/**
 * loginTracking — append a durable login event for the signed-in user.
 *
 * Calls the `log_login_event` RPC (0222), which reads the real client IP +
 * device + Cloudflare country from the request headers server-side and writes
 * one row to `public.login_events` (deduped to once per IP per 30 min). The
 * call is fire-and-forget and non-fatal: a tracking failure must never block
 * a sign-in. We also guard to once per (page load, user) so a burst of
 * onAuthStateChange events doesn't spam the RPC; the server dedups the rest.
 */
import { supabase } from "@/lib/supabase";

let firedForUser: string | null = null;

export async function recordLoginEvent(userId: string | null | undefined): Promise<void> {
  if (!userId) return;
  if (firedForUser === userId) return;
  firedForUser = userId;
  try {
    await supabase.rpc("log_login_event");
  } catch {
    // Non-fatal: tracking must never interrupt the session. Allow a retry on
    // the next auth event by clearing the guard.
    firedForUser = null;
  }
}
