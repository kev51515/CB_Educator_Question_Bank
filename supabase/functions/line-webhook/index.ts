// =============================================================================
// Edge function: line-webhook
// Receives LINE Messaging API webhook events for the Official Account.
//
//   - Verifies the X-Line-Signature HMAC (channel secret) on the raw body.
//   - follow / "link" message  -> start the Account Link flow (issue linkToken,
//                                 DM the user the LMS /line/link page).
//   - accountLink (result ok)  -> finalize the binding via finalize_line_link.
//   - unfollow                 -> mark the link unlinked.
//
// Deploy PUBLIC (LINE sends no Supabase JWT); security is the signature check:
//   supabase functions deploy line-webhook --no-verify-jwt
//
// Required secrets (Edge Functions -> Secrets):
//   LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET,
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected),
//   LINE_LINK_BASE_URL  -> public origin of the LMS app, e.g. https://app.example.com
// =============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const LINE_API = "https://api.line.me/v2/bot";
const LINK_TRIGGERS = ["link", "連結", "綁定", "绑定", "bind"];

async function verifySignature(secret: string, body: string, signature: string): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  // length-safe compare
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

async function linePost(token: string, path: string, body: unknown): Promise<Response> {
  return await fetch(`${LINE_API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function lineGet(token: string, path: string): Promise<Record<string, unknown> | null> {
  const r = await fetch(`${LINE_API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return r.ok ? await r.json() : null;
}

function replyMsg(token: string, replyToken: string, text: string) {
  return linePost(token, "/message/reply", { replyToken, messages: [{ type: "text", text }] });
}

function pushMsg(token: string, to: string, text: string) {
  return linePost(token, "/message/push", { to, messages: [{ type: "text", text }] });
}

// Issue a linkToken for this user and DM them the LMS link page.
async function startLink(token: string, linkBase: string, userId: string, replyToken?: string) {
  const r = await linePost(token, `/user/${userId}/linkToken`, {});
  if (!r.ok) {
    if (replyToken) await replyMsg(token, replyToken, "無法開始連結，請稍後再試。Could not start linking — please try again.");
    return;
  }
  const { linkToken } = await r.json();
  const url = `${linkBase}/line/link?linkToken=${encodeURIComponent(linkToken)}`;
  const msg = `請點此完成帳號連結（需登入）。Tap to finish linking (login required):\n${url}`;
  if (replyToken) await replyMsg(token, replyToken, msg);
  else await pushMsg(token, userId, msg);
}

Deno.serve(async (req) => {
  const TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") ?? "";
  const SECRET = Deno.env.get("LINE_CHANNEL_SECRET") ?? "";
  const SUPA_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  // Normalize: a bare host (e.g. "pication.app") would render as plain,
  // un-tappable text in LINE — force an https:// scheme and drop trailing slash.
  let LINK_BASE = (Deno.env.get("LINE_LINK_BASE_URL") ?? "").trim().replace(/\/$/, "");
  if (LINK_BASE && !/^https?:\/\//i.test(LINK_BASE)) LINK_BASE = "https://" + LINK_BASE;

  const body = await req.text();
  const sig = req.headers.get("x-line-signature") ?? "";
  if (!SECRET || !(await verifySignature(SECRET, body, sig))) {
    return new Response("bad signature", { status: 401 });
  }

  let payload: { events?: Array<Record<string, any>> };
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response("ok"); // LINE webhook verify ping has an empty body
  }

  const supabase = createClient(SUPA_URL, SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  for (const ev of payload.events ?? []) {
    const userId: string | undefined = ev?.source?.userId;
    const replyToken: string | undefined = ev?.replyToken;
    try {
      if (ev.type === "follow" && userId) {
        await startLink(TOKEN, LINK_BASE, userId, replyToken);
      } else if (ev.type === "message" && ev.message?.type === "text" && userId) {
        const text = String(ev.message.text ?? "").trim().toLowerCase();
        if (LINK_TRIGGERS.some((t) => text.includes(t))) {
          await startLink(TOKEN, LINK_BASE, userId, replyToken);
        } else if (replyToken) {
          await replyMsg(TOKEN, replyToken, "輸入「綁定」即可連結帳號。Type \"link\" to connect your account.");
        }
      } else if (ev.type === "accountLink" && userId) {
        const nonce: string | undefined = ev.link?.nonce;
        if (ev.link?.result === "ok" && nonce) {
          const prof = await lineGet(TOKEN, `/profile/${userId}`);
          const { data, error } = await supabase.rpc("finalize_line_link", {
            p_nonce: nonce,
            p_line_user_id: userId,
            p_display_name: (prof?.displayName as string) ?? null,
          });
          const ok = !error && data;
          if (replyToken) {
            await replyMsg(
              TOKEN,
              replyToken,
              ok
                ? "已成功連結帳號。Your account is now linked."
                : "連結失敗，請從應用程式重試。Link failed — please retry from the app.",
            );
          }
        } else if (replyToken) {
          await replyMsg(TOKEN, replyToken, "連結失敗，請重試。Link failed — please try again.");
        }
      } else if (ev.type === "unfollow" && userId) {
        await supabase.rpc("mark_line_unlinked", { p_line_user_id: userId });
      }
    } catch (e) {
      console.error("line-webhook event error:", e);
    }
  }

  return new Response("ok", { status: 200 });
});
