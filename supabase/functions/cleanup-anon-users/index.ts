// Supabase Edge Function: cleanup-anon-users
//
// Deletes auth.users rows where is_anonymous = true AND created_at is older than
// CLEANUP_DAYS days ago. Cascades to profiles / memberships / attempts via
// existing FK constraints.
//
// Privileged background job. Uses service-role key. Protect via CLEANUP_TOKEN
// in production.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const LOG_PREFIX = "[cleanup-anon-users]";
const MAX_DELETIONS_PER_RUN = 1000;
const ADMIN_PAGE_SIZE = 1000; // supabase admin listUsers max perPage

interface CleanupResult {
  ok: boolean;
  scanned: number;
  deleted: number;
  errors: Array<{ id: string; message: string }>;
  cutoff_at: string;
  dry_run: boolean;
  capped?: boolean;
  message?: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function log(step: string, data?: Record<string, unknown>): void {
  if (data === undefined) {
    console.log(`${LOG_PREFIX} ${step}`);
  } else {
    console.log(`${LOG_PREFIX} ${step}`, JSON.stringify(data));
  }
}

function authorize(req: Request): { ok: true } | { ok: false; response: Response } {
  const expected = Deno.env.get("CLEANUP_TOKEN");
  if (!expected) {
    // Developer mode: no token configured, allow any caller.
    log("auth: CLEANUP_TOKEN unset, allowing request (developer mode)");
    return { ok: true };
  }
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match || match[1] !== expected) {
    log("auth: rejected request (bad or missing bearer token)");
    return {
      ok: false,
      response: jsonResponse({ ok: false, error: "unauthorized" }, 401),
    };
  }
  return { ok: true };
}

interface AdminUser {
  id: string;
  created_at?: string | null;
  // The admin API returns is_anonymous on the user object. Older typings may
  // not include it, so we treat it as unknown and coerce.
  is_anonymous?: boolean | null;
  email?: string | null;
}

async function findCandidates(
  supabase: SupabaseClient,
  cutoffIso: string,
): Promise<{ candidates: AdminUser[]; scanned: number; capped: boolean }> {
  const cutoff = new Date(cutoffIso).getTime();
  const candidates: AdminUser[] = [];
  let scanned = 0;
  let page = 1;
  let capped = false;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: ADMIN_PAGE_SIZE,
    });
    if (error) {
      throw new Error(`listUsers failed on page ${page}: ${error.message}`);
    }
    const users = (data?.users ?? []) as AdminUser[];
    scanned += users.length;
    log("scan: page", { page, returned: users.length, scanned_total: scanned });

    for (const u of users) {
      const isAnon = u.is_anonymous === true;
      if (!isAnon) continue;
      const created = u.created_at ? new Date(u.created_at).getTime() : NaN;
      if (Number.isNaN(created)) continue;
      if (created >= cutoff) continue;
      candidates.push(u);
      if (candidates.length >= MAX_DELETIONS_PER_RUN) {
        capped = true;
        log("scan: hit MAX_DELETIONS_PER_RUN cap, stopping scan", {
          cap: MAX_DELETIONS_PER_RUN,
        });
        return { candidates, scanned, capped };
      }
    }

    if (users.length < ADMIN_PAGE_SIZE) {
      // Last page.
      break;
    }
    page += 1;
  }

  return { candidates, scanned, capped };
}

async function deleteCandidates(
  supabase: SupabaseClient,
  candidates: AdminUser[],
): Promise<{ deleted: number; errors: Array<{ id: string; message: string }> }> {
  let deleted = 0;
  const errors: Array<{ id: string; message: string }> = [];
  for (const u of candidates) {
    try {
      const { error } = await supabase.auth.admin.deleteUser(u.id);
      if (error) {
        errors.push({ id: u.id, message: error.message });
        log("delete: error", { id: u.id, message: error.message });
      } else {
        deleted += 1;
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      errors.push({ id: u.id, message });
      log("delete: exception", { id: u.id, message });
    }
  }
  return { deleted, errors };
}

async function handle(req: Request): Promise<Response> {
  const auth = authorize(req);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry_run") === "1"
    || url.searchParams.get("dry_run") === "true";

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    log("fatal: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return jsonResponse(
      { ok: false, error: "server not configured: missing supabase env vars" },
      500,
    );
  }

  const daysRaw = Deno.env.get("CLEANUP_DAYS") ?? "14";
  const days = Number.parseInt(daysRaw, 10);
  if (!Number.isFinite(days) || days <= 0) {
    log("fatal: invalid CLEANUP_DAYS", { raw: daysRaw });
    return jsonResponse(
      { ok: false, error: `invalid CLEANUP_DAYS: ${daysRaw}` },
      500,
    );
  }

  const cutoffAt = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const cutoffIso = cutoffAt.toISOString();
  log("start", { days, cutoff_at: cutoffIso, dry_run: dryRun });

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let scanned = 0;
  let candidates: AdminUser[] = [];
  let capped = false;
  try {
    const found = await findCandidates(supabase, cutoffIso);
    scanned = found.scanned;
    candidates = found.candidates;
    capped = found.capped;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log("fatal: scan failed", { message });
    return jsonResponse({ ok: false, error: message }, 500);
  }

  log("scan: complete", {
    scanned,
    candidates: candidates.length,
    capped,
  });

  if (candidates.length === 0) {
    const body: CleanupResult = {
      ok: true,
      scanned,
      deleted: 0,
      errors: [],
      cutoff_at: cutoffIso,
      dry_run: dryRun,
      message: "no anonymous users older than cutoff",
    };
    log("done: no-op", body as unknown as Record<string, unknown>);
    return jsonResponse(body);
  }

  if (dryRun) {
    const body: CleanupResult = {
      ok: true,
      scanned,
      deleted: 0,
      errors: [],
      cutoff_at: cutoffIso,
      dry_run: true,
      capped,
      message: `dry-run: would delete ${candidates.length} users`,
    };
    log("done: dry-run", {
      would_delete: candidates.length,
      sample_ids: candidates.slice(0, 5).map((c) => c.id),
    });
    return jsonResponse(body);
  }

  const { deleted, errors } = await deleteCandidates(supabase, candidates);
  const body: CleanupResult = {
    ok: true,
    scanned,
    deleted,
    errors,
    cutoff_at: cutoffIso,
    dry_run: false,
    capped,
  };
  log("done", {
    scanned,
    deleted,
    error_count: errors.length,
    capped,
  });
  return jsonResponse(body);
}

Deno.serve(async (req: Request) => {
  // Allow POST (intended) + GET (handy for manual testing / dry-runs).
  if (req.method !== "POST" && req.method !== "GET") {
    return jsonResponse({ ok: false, error: "method not allowed" }, 405);
  }
  try {
    return await handle(req);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log("fatal: unhandled", { message });
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
