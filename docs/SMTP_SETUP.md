# SMTP Setup

Operational runbook for replacing Supabase's built-in email service with a real SMTP provider.

## Why This Matters

Supabase's free tier ships a built-in SMTP relay that is **rate-limited to 4 emails per hour, per project**. Above that limit, emails are silently dropped. No bounce, no error, no log entry — they just disappear. The Supabase Dashboard does not warn you when the limit is hit, and the free tier has no email log to inspect after the fact.

The symptoms always look like product bugs at first: students sign up but never receive the confirmation link, password resets stop working at peak times (right before a class, right after you announce a new feature), and magic-link logins time out. None of these are actually broken — they are emails the Supabase relay decided to drop. The fix is to wire up a dedicated SMTP provider before you launch to more than a handful of students. We recommend **Resend** (developer-friendly, free tier covers 3,000 emails/month, ten-minute setup). SendGrid is a fine alternative if you already have it for something else.

## Resend Account and Domain Setup

You need a domain you control (e.g. `satprep.example.com`). Resend will refuse to send from `gmail.com` or other shared providers.

1. Sign up at **resend.com** (free tier, no credit card).
2. In the dashboard, go to **Domains → Add Domain** and enter your sending domain.
3. Resend will display a set of DNS records. You add these at your domain registrar (Cloudflare, Namecheap, Route 53, whatever you use):

| Record | Purpose | What it does |
|---|---|---|
| `SPF` (TXT) | Sender authorization | Tells receiving servers Resend is allowed to send from your domain |
| `DKIM` (TXT × 3) | Cryptographic signing | Proves the email actually came from you and was not modified in transit |
| `DMARC` (TXT, optional but recommended) | Policy enforcement | Tells receivers what to do with mail that fails SPF/DKIM |
| `MX` (optional) | Inbound mail | Only needed if you also want to receive replies via Resend |

4. After adding the records, click **Verify** in the Resend dashboard. DNS propagation usually takes 5–30 minutes. If verification still fails after an hour, the record was likely pasted wrong — compare character-for-character.

## Wire Resend into Supabase Auth

In the Supabase Dashboard:

1. Open **Project Settings → Authentication → SMTP Settings**.
2. Toggle **Enable Custom SMTP** on.
3. Fill in:

```
Host:           smtp.resend.com
Port:           465        (use 587 if your network blocks 465)
Username:       resend
Password:       re_xxxxxxxxxxxx     (your Resend API key)
Sender email:   noreply@your-verified-domain
Sender name:    SAT Prep            (keep it short)
```

4. Click **Save**.

The API key goes in the password field. Generate it in Resend under **API Keys → Create API Key**. Give it **Sending access** only — not full access. Label it "supabase-prod" so you remember what it's for.

## Test the Connection

Two tests, both required:

1. **Dashboard test.** In Supabase, click **Send test email** below the SMTP settings. Send it to your own inbox. If it fails, the error message is usually accurate — the most common is "sender not verified" (the address in the From field is not on the verified Resend domain) or "authentication failed" (wrong API key).

2. **End-to-end test.** Sign up a brand-new user from the live app. The confirmation should arrive within ~10 seconds. Check spam too. If it lands in spam, your DKIM is probably misconfigured — recheck the DNS records.

## Email Template Customization

Supabase ships default templates for: account confirmation, password reset, magic link, email change, and reauthentication.

Edit them at **Project Settings → Authentication → Email Templates**. Tips:

- Keep the subject line short (under 50 characters). Long subjects get truncated in mobile previews.
- One clear CTA button. Do not bury the link in a paragraph.
- Skip the logo image. Images often get blocked by mail clients on first contact, and a text-only email is more deliverable than a fancy one.
- Always include a plain-text fallback (Supabase auto-generates one from the HTML if you don't provide it).

Available template variables include:

```
{{ .ConfirmationURL }}    Full click-through URL
{{ .Token }}              Six-digit OTP code if you prefer those
{{ .SiteURL }}            From Auth → URL Configuration
{{ .Email }}              The recipient
```

## Rate Limits and Monitoring

| Plan | Daily | Monthly | Cost |
|---|---|---|---|
| Resend Free | 100 | 3,000 | $0 |
| Resend Pro | unlimited | 50,000 | $20/mo |

Three thousand emails per month is comfortable for ~50 active students sending confirmations, resets, and the occasional notification. If you cross 30 sign-ups per day on a sustained basis, upgrade.

Monitor at **resend.com/emails**:

- **Delivered** — landed in inbox or spam (Resend cannot tell which)
- **Bounced** — invalid address; do not retry
- **Complained** — recipient hit "spam" button; reputation hit
- **Opened / Clicked** — only if you enable tracking pixels (we recommend leaving these off for student privacy)

Optional: configure a Resend webhook pointed at PostHog if you want delivery/open events as analytics, but for an LMS the value is low.

## SendGrid as Alternative

Same shape, slightly more enterprise-feeling UI. Use it if you already pay for SendGrid for marketing email and want to consolidate.

| | Resend | SendGrid |
|---|---|---|
| Free tier | 100/day, 3k/mo | 100/day forever |
| Setup time | ~10 min | ~20 min |
| Domain verification | Streamlined | Verbose, more knobs |
| Best for | Transactional only | Transactional + marketing |
| Supabase fields | `smtp.resend.com:465`, user `resend`, password = API key | `smtp.sendgrid.net:587`, user `apikey` (literal), password = API key |

Recommend Resend unless you have a reason not to.

## Troubleshooting

**"Sender not verified" when sending test email.** The domain DNS has not finished propagating, or the From address is not on the verified domain. Recheck records and the Sender email field.

**Test passes, but production confirmations don't arrive.** Almost always spam folder. The fix is correct DKIM. Send a test to `mail-tester.com` and they will score the deliverability and tell you exactly what is missing.

**Worked yesterday, broken today.** API key was rotated or revoked. Generate a new one in Resend and paste it into Supabase SMTP password.

**"I want to see what emails Supabase tried to send."** Free tier Supabase does not log this. Use the **resend.com/emails** dashboard — every send attempt shows up there regardless of outcome.

**Confirmation link points to `localhost:5173` or a Vercel preview URL.** The Site URL is wrong. Set it at **Authentication → URL Configuration → Site URL** to your production URL. Add any other valid redirects to the **Redirect URLs** allowlist.

**Users report the link expired immediately.** The link is single-use. If a corporate spam filter pre-fetches it for safety scanning, it gets consumed before the user clicks. Workaround: switch that template to OTP codes (`{{ .Token }}`) instead of magic links.

## Disabling Email Confirmation (Development Only)

For dev or demo environments where you don't want to deal with email at all: **Authentication → Sign In / Up → Confirm email → Off**. Users can sign in immediately after signup.

**Never do this in production.** Without confirmation, anyone can sign up under any email address, and password reset becomes an account-takeover vector.

## Pre-Launch Checklist

Before pointing real students at the app, confirm all of these:

- [ ] Custom SMTP enabled in Supabase, test email received
- [ ] End-to-end signup test produces a confirmation in <30 seconds
- [ ] **Site URL** at Authentication → URL Configuration matches the production domain (no `localhost`, no `*.vercel.app` preview URL)
- [ ] **Redirect URLs** allowlist contains every URL the app actually uses for callbacks
- [ ] Email confirmation is **on**
- [ ] Resend API key is named clearly (e.g. `supabase-prod`), with sending-only scope
- [ ] Rotation reminder: rotate the Resend API key any time someone with access leaves or after any suspected compromise

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the broader deployment checklist and [USER_GUIDE.md](./USER_GUIDE.md) for what the student-facing email flows look like.
