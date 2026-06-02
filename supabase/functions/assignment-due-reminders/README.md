# assignment-due-reminders

## What it does

This Supabase Edge Function scans for non-archived assignments whose `due_at` falls within the next 24 hours, looks up enrolled students via `course_memberships`, filters out anyone who has already started an attempt (`assignment_attempts`), and sends a reminder email via the Resend API to each remaining student. It returns a JSON summary with counts of assignments checked, emails sent, skipped, and any per-recipient errors.

## Environment variables

Set these as Edge Function secrets (Dashboard → Project Settings → Edge Functions → Secrets, or via CLI):

| Var | Required | Default | Notes |
|---|---|---|---|
| `RESEND_API_KEY` | yes | — | Your Resend API key (`re_...`). |
| `REMINDER_FROM_EMAIL` | no | `noreply@example.com` | Must be a verified sender/domain in your Resend account. |
| `CRON_TOKEN` | recommended | — | If set, the function requires `Authorization: Bearer <CRON_TOKEN>`. Without it, the endpoint is unauthenticated. |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically by the Edge runtime — you do not need to set them.

## Deploy

```bash
supabase functions deploy assignment-due-reminders
```

## Set secrets

```bash
supabase secrets set \
  RESEND_API_KEY=re_xxx \
  REMINDER_FROM_EMAIL=reminders@yourdomain.com \
  CRON_TOKEN=$(openssl rand -hex 16)
```

## Schedule with pg_cron

First, enable `pg_cron` and `pg_net` from the Supabase Dashboard (Database → Extensions). Then in the SQL editor:

```sql
select cron.schedule(
  'assignment-due-reminders-hourly',
  '0 * * * *',
  $$ select net.http_post(
    url := 'https://<ref>.supabase.co/functions/v1/assignment-due-reminders',
    headers := '{"Authorization": "Bearer <CRON_TOKEN>"}'::jsonb
  ) $$
);
```

Replace `<ref>` with your project ref and `<CRON_TOKEN>` with the value you set above.

## Idempotency note

Dedup is **active** as of migration `0023_gdpr_dedup.sql`. Before each send, the
function inserts a row into `public.reminder_log` keyed by
`(assignment_id, student_id, reminder_kind='assignment_due_24h')`. The UNIQUE
constraint makes the claim atomic: a duplicate insert returns Postgres error
`23505`, which the function treats as a skip. As a result, each
`(assignment, student)` pair gets at most one `assignment_due_24h` email — safe
to run on an hourly cron. Old log rows are pruned by `public.prune_reminder_log()`
(see migration 0023; schedule monthly via pg_cron).

## Test

```bash
curl -X POST \
  -H "Authorization: Bearer <CRON_TOKEN>" \
  https://<ref>.supabase.co/functions/v1/assignment-due-reminders
```

Expected response:

```json
{
  "ok": true,
  "window_end": "2026-05-30T12:00:00.000Z",
  "assignments_checked": 3,
  "sent": 12,
  "skipped": 47,
  "errors": []
}
```
