// =============================================================================
// Edge function: student-code-login
//
// Lets a managed student sign in PASSWORDLESSLY with their teacher-issued login
// code (mirrors the first-time join — "the code gets you in"). This fixes the
// "Invalid login credentials" lockout: after a student claims a seat, their
// account email is swapped from the synthetic <code>@students.local to their
// real email, so the old client habit of mapping a bare code -> <code>@students
// .local no longer resolves. Here the server resolves the code -> the seat's
// CURRENT account and mints a one-time magic-link token; the client verifies it
// to establish a session. The email + password path is unchanged (client-side
// signInWithPassword) — this endpoint is ONLY the code path.
//
// Security:
//   - A valid code mints a session with NO password, so it is a bearer
//     credential. Codes are 6 distinct letters from a 22-letter set (~53M
//     combos); we per-IP rate-limit (code_login_touch, migration 0194) to make
//     enumeration impractical. Only managed seats (login_code present) resolve.
//   - Returns ONLY a one-time token_hash (never the email/password). The token
//     is single-use and short-lived (GoTrue OTP).
//
// Deploy PUBLIC (the sign-in screen has no Supabase session yet):
//   supabase functions deploy student-code-login --no-verify-jwt
// =============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RATE_MAX = 10; // attempts
const RATE_WINDOW = 60; // seconds, per IP

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") ?? "";
  return (xff.split(",")[0] ?? "").trim() || "unknown";
}

// A login code is 6 letters (A–Z minus I/L/O/Q). Be lenient on input (the
// client uppercases/strips) but reject obvious non-codes early.
function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toUpperCase();
  // Allow a legacy "<6>-NN" dash seat code too (still resolvable by login_code).
  if (/^[A-HJ-KM-NP-Z]{6}$/.test(v)) return v;
  if (/^[A-HJ-NP-Z2-9]{6}(-[0-9]{1,3})?$/.test(v)) return v;
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const SUPA_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!SUPA_URL || !SERVICE) return json({ error: "server_not_configured" }, 500);

  let body: { code?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_request" }, 400);
  }

  const code = normalizeCode(body.code);
  if (!code) return json({ error: "invalid_code" }, 400);

  const supabase = createClient(SUPA_URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) Rate-limit per IP (raises 'rate_limited' inside the RPC when exceeded).
  const { error: rlErr } = await supabase.rpc("code_login_touch", {
    p_ip: clientIp(req),
    p_max: RATE_MAX,
    p_window_secs: RATE_WINDOW,
  });
  if (rlErr) {
    const rateLimited = /rate_limited/i.test(rlErr.message);
    return json({ error: rateLimited ? "rate_limited" : "server_error" }, rateLimited ? 429 : 500);
  }

  // 2) Resolve the seat by its login code (managed seats only).
  const { data: seat, error: seatErr } = await supabase
    .from("profiles")
    .select("id, login_code")
    .eq("managed", true)
    .ilike("login_code", code)
    .maybeSingle();

  if (seatErr) return json({ error: "server_error" }, 500);
  // Generic message either way (don't confirm whether a code exists beyond the
  // rate-limited 404 — the rate limit is the real enumeration guard).
  if (!seat) return json({ error: "invalid_code" }, 404);

  // Use the canonical AUTH email (not profiles.email, which could drift) — it's
  // what generateLink resolves the user by. Whatever the seat currently uses,
  // real or synthetic, is correct: that's the point of resolving server-side.
  const { data: userRes, error: userErr } = await supabase.auth.admin.getUserById(seat.id);
  const seatEmail = userRes?.user?.email;
  if (userErr || !seatEmail) return json({ error: "invalid_code" }, 404);

  // 3) Mint a one-time magic-link token for the seat's current account. We do
  //    NOT send an email — the admin call returns the hashed token directly and
  //    the client verifies it to establish a session (passwordless).
  const { data: link, error: linkErr } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: seatEmail,
  });
  const tokenHash = (link?.properties as { hashed_token?: string } | undefined)?.hashed_token;
  if (linkErr || !tokenHash) return json({ error: "server_error" }, 500);

  return json({ token_hash: tokenHash });
});
