# cleanup-anon-users

Supabase Edge Function that deletes anonymous `auth.users` older than a
configurable threshold (default 14 days). Deletion cascades through the FK
chain to `profiles`, `memberships`, and `attempts`.

This is a privileged background job. It runs with the service-role key. It is
**not** intended to be invoked by end users.

## What it does

1. Pages through `auth.admin.listUsers` (1000 per page).
2. Filters in JS for `is_anonymous = true` AND `created_at < now() - CLEANUP_DAYS days`.
   (The admin list endpoint does not currently support `is_anonymous` as a
   server-side filter, so we fetch + filter client-side.)
3. Calls `auth.admin.deleteUser(id)` for each candidate. Per-row errors are
   collected and reported but do not abort the batch.
4. Hard cap: never deletes more than **1000** users per run. If the cap is hit,
   the response includes `capped: true` and you should re-run the function.
5. Returns a JSON summary.

## Response shape

```json
{
  "ok": true,
  "scanned": 4231,
  "deleted": 87,
  "errors": [],
  "cutoff_at": "2026-05-15T00:00:00.000Z",
  "dry_run": false,
  "capped": false
}
```

Dry-run response (`?dry_run=1`):

```json
{
  "ok": true,
  "scanned": 4231,
  "deleted": 0,
  "errors": [],
  "cutoff_at": "2026-05-15T00:00:00.000Z",
  "dry_run": true,
  "capped": false,
  "message": "dry-run: would delete 87 users"
}
```

## Environment variables

| Var | Required | Default | Notes |
|---|---|---|---|
| `SUPABASE_URL` | yes | — | injected automatically by Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | — | injected automatically by Supabase |
| `CLEANUP_DAYS` | no | `14` | how old an anon user must be before deletion |
| `CLEANUP_TOKEN` | no | unset | if set, request must carry `Authorization: Bearer <token>`. If unset, the function is unauthenticated — **only acceptable in local dev**. |

Set non-default env vars from the Supabase dashboard under
Edge Functions → cleanup-anon-users → Secrets, or via CLI:

```bash
supabase secrets set CLEANUP_DAYS=14 CLEANUP_TOKEN=$(openssl rand -hex 32)
```

## Deploy

```bash
supabase functions deploy cleanup-anon-users --project-ref ljdofwovsyaqydcbohhd
```

## Invoke manually

Dry-run (safe; lists what would be deleted):

```bash
curl -X POST 'https://ljdofwovsyaqydcbohhd.supabase.co/functions/v1/cleanup-anon-users?dry_run=1' \
  -H "Authorization: Bearer $CLEANUP_TOKEN"
```

Real run:

```bash
curl -X POST 'https://ljdofwovsyaqydcbohhd.supabase.co/functions/v1/cleanup-anon-users' \
  -H "Authorization: Bearer $CLEANUP_TOKEN"
```

If `CLEANUP_TOKEN` is unset (dev only), you can omit the bearer header — or pass
the project anon key, which Supabase's function gateway accepts for routing.

## Schedule with pg_cron + pg_net

Both extensions need to be enabled first via **Dashboard → Database →
Extensions** (search for `pg_cron` and `pg_net`).

Then, from the SQL editor:

```sql
select cron.schedule(
  'cleanup-anon-users-daily',
  '0 3 * * *',  -- 03:00 UTC daily
  $$
  select net.http_post(
    url := 'https://ljdofwovsyaqydcbohhd.supabase.co/functions/v1/cleanup-anon-users',
    headers := '{"Authorization": "Bearer <CLEANUP_TOKEN>", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

Store the bearer token in Vault rather than inline if you don't want it
appearing in the cron job definition.

To unschedule:

```sql
select cron.unschedule('cleanup-anon-users-daily');
```

To inspect runs:

```sql
select * from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'cleanup-anon-users-daily')
order by start_time desc
limit 20;
```

Supabase docs: https://supabase.com/docs/guides/functions/schedule-functions

## Logs

`console.log` writes from this function are captured in the Supabase Dashboard
under Edge Functions → cleanup-anon-users → Logs. All log lines are prefixed
`[cleanup-anon-users]` for easy filtering.

## Operational notes

- **Hard cap of 1000 deletions per run.** If you have a backlog larger than
  that, run the function repeatedly (or temporarily raise the constant). The
  cap exists to make a single bad invocation non-catastrophic.
- **Cascades are FK-driven.** Make sure the FK cascade chain
  `auth.users → profiles → memberships / attempts` is intact before scheduling.
- **No schema changes required.** This function relies only on existing FKs and
  the standard Supabase auth admin API.
