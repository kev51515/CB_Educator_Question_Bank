# Google Calendar / Meet — setup to go live

The **opt-in "Connect Google Calendar"** flow that creates Google Meet links is
**fully scaffolded but dormant**. It does NOT touch the normal Google login —
educators connect separately, only if they want Meet links. Recording a Meet
already works without any of this (the recorder's "Meeting (tab + mic)" mode).

## What's built (staged, not deployed)

- **Migration `0223_google_calendar.sql`** — `google_calendar_tokens` table
  (RLS-locked; the refresh token is never client-readable) + RPCs
  `connect_google_calendar` / `disconnect_google_calendar` /
  `google_calendar_status`.
- **Edge function `create-meet-link`** — reads the user's refresh token
  (service role), mints an access token, creates a Calendar event with
  `conferenceData` → returns the Meet link. Returns `not_configured` (503) until
  the secrets are set.
- **Client** — `useGoogleCalendar` hook + `GoogleCalendarCard` (Connect /
  Disconnect / "New Meet link"), mounted on `/educator/recordings` but **hidden**
  behind `GOOGLE_CALENDAR_ENABLED = false` in `GoogleCalendarCard.tsx`.

## To turn it on (owner — ~15 min)

1. **Google Cloud Console** (the project behind your Supabase Google auth):
   - APIs & Services → **enable the Google Calendar API**.
   - OAuth consent screen → add the scope
     `https://www.googleapis.com/auth/calendar.events`.
   - `calendar.events` is a **sensitive** scope. For production with external
     users Google requires app verification — OR keep the consent screen in
     **Testing** mode (add your educators as test users; up to 100, no
     verification needed) to start.
2. **Set the Supabase secrets** (the OAuth client id/secret from that project —
   the same pair Supabase uses for Google auth works, or make a dedicated one):
   ```
   supabase secrets set GOOGLE_OAUTH_CLIENT_ID=...
   supabase secrets set GOOGLE_OAUTH_CLIENT_SECRET=...
   ```
3. **Apply the migration + deploy the function:**
   ```
   # migration 0223 (after checking `supabase migration list` for collisions)
   supabase db push          # or direct-psql per docs/MIGRATIONS.md
   supabase functions deploy create-meet-link
   ```
4. **Flip the flag:** set `GOOGLE_CALENDAR_ENABLED = true` in
   `viewer/src/recordings/GoogleCalendarCard.tsx`, then push (Cloudflare deploys).

## How it works once live

- An educator clicks **Connect Google Calendar** → a one-time Google OAuth with
  the calendar scope (`access_type=offline`, `prompt=consent`) → the redirect
  returns to `/educator/recordings?gcal=connect`; the hook captures
  `provider_refresh_token` and stores it via `connect_google_calendar`.
- **New Meet link** → `create-meet-link` makes a Calendar event with an attached
  Meet URL, copies it to the clipboard, and opens it. Paste it into a module,
  announcement, or invite — then record the session with the recorder's
  **Meeting (tab + mic)** mode.

## Not in scope

Auto-pulling a Meet's **cloud recording + transcript from Google Drive** needs
Google **Workspace** (paid) with Meet recording enabled + the Drive API. Declined
for now — the tab-audio recorder covers the capture need without Workspace.
