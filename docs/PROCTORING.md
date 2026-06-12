# Proctoring & Test Security

Status: **Phase 1 + 2 shipped (migrations 0108–0109).** Phase 3 (Safe Exam
Browser) is **design-only** — not built. This doc is the reference for the whole
proctoring stack and the SEB integration plan.

---

## 0. The honest ceiling (read this first)

A web app delivered to a student's own device can **deter and record** cheating;
it cannot **prevent** it. No amount of JavaScript stops OS-level app switching, a
screenshot, a second monitor, a phone on the desk, or a friend in the room. Every
pure-web control below is *telemetry + deterrence*. The only thing that actually
locks the machine is a native lockdown browser (Phase 3, SEB) — and even that does
nothing about a second device or a person in the room.

So we run a **tiered** model and tell students plainly that activity is recorded
and reviewed by a human. The social deterrent (a teacher who sees a timeline of
every time you left, and for how long) out-performs the technical one at our scale.

| Tier | What it is | Deters (casual) | Device coverage | Status |
|---|---|---|---|---|
| **Soft** | Telemetry only: duration-tracked tab-away, focus-loss, copy/paste/fullscreen-exit, full timeline | ~40–50% | All (incl. iPhone) | ✅ shipped |
| **Strict** | Soft + enforced fullscreen + copy/paste blocking + auto-flag | ~70–80% | Laptop/iPad; fails open on iPhone | ✅ shipped |
| **Lockdown** | SEB kiosk browser + server-side exam-key verification | ~95% on the locked machine | Win/macOS/iPad **only** | 🔲 design (this doc §3) |

Per-test level lives in `tests.proctoring_level` (`off` / `soft` / `strict`).
A future `lockdown` value (or a separate `seb_required` flag) gates Phase 3.

---

## 1. Phase 1 — complete timeline (shipped, migration 0108)

**Data.** `test_run_events` records one row per signal — `away`, `focus_loss`,
`fullscreen_exit/enter`, `copy`, `paste`, `*_blocked`, `devtools` — each with
`at`, `duration_seconds`, `module`, and the `question` the student was on. Writes
flow only through a `SECURITY DEFINER` logger (`test_log_proctor_event`), so the
trail can't be forged or erased by a tampered client (RLS: owner-READ only, no
write policy — mirrors `test_run_answers`). Denormalized aggregates
(`away_total_seconds`, `focus_loss_count/seconds`, plus the existing `away_count`
and `integrity` jsonb) live on `test_runs` for the live roster.

**Client** (`viewer/src/fulltest/FullTestApp.tsx`):
- **Duration, not just count.** `visibilitychange→hidden` stamps a timestamp +
  module/question; on return we log `away` with the elapsed seconds.
- **Focus-loss via `blur`/`focus`** — the second-monitor signal. De-duped against
  `away`: a real tab-switch logs only `away`; clicking another window while the
  test stays visible logs only `focus_loss`.

**Teacher UI** (`ProctorTimeline.tsx`): a time-scaled horizontal track (amber
blocks sized by away-duration, red ticks for fullscreen exits, blue dots for
copy/paste), hover tooltips ("Left tab · Q14 · 0:42"), summary chips, a legend,
and a chronological event list. Skeleton while loading; green "Stayed focused —
no flags ✓" empty state. Surfaced compact in the live monitor (flagged students
sort to the top with a *⚑ Needs review* badge) and full in the post-test review.

`get_test_run_timeline(run)` reads the timeline for owner OR teacher-of-the-course
(`is_teacher_of_test` helper). `test_live_progress` now also returns
`flagged` + `flag_reasons` (`away_60s`, `away_3x`, `fs_exit`, `paste`, `focus_3x`).

## 2. Phase 2 — fullscreen lock + flags (shipped, migration 0108)

In `strict` mode the runner requests fullscreen on the module-start gesture, shows
a blocking "Return to full screen to continue" overlay on exit (re-prompt on
click), and `preventDefault`s copy/cut/paste/contextmenu (logged as `*_blocked`).
**Text selection is NOT blocked** (even in strict): the highlighter needs it, and
blocking `selectstart` was what made "highlighting doesn't work" on lockdown tests
(fixed 2026-06-12). Exfiltration stays covered — copy/cut/paste/contextmenu are
blocked, so selected text can't leave the page; `selectstart` is now a no-op
listener kept only so the add/remove listener pairs stay symmetric.
**iPhone has no element fullscreen** → strict mode *fails open*: enforcement is
skipped, telemetry still records, and the student sees an honest notice. The
timer never auto-pauses (leaving must not be rewarded); proctor pause/add-time/
force-end remain manual.

---

## 3. Phase 3 — Safe Exam Browser (SEB) lockdown — DESIGN

### 3.1 The gating decision: device fleet

**Do this survey before writing any code.** SEB has native builds for **Windows,
macOS, and iOS/iPadOS only**. There is **no SEB for Chromebooks, Android, or
Linux**. If any of your students take tests on a Chromebook or Android tablet,
SEB simply will not launch for them, and you need a fallback (they take it under
`strict` fullscreen, on a loaner laptop, or in person).

| Student device | SEB? | Fallback if not |
|---|---|---|
| Windows laptop | ✅ | — |
| macOS laptop | ✅ | — |
| iPad (iPadOS) | ✅ (SEB iOS) | — |
| **Chromebook** | ❌ | `strict` tier / loaner |
| **Android phone/tablet** | ❌ | `strict` tier / loaner |
| iPhone | ⚠️ technically yes, impractical screen | `strict` tier |
| Linux | ❌ | `strict` tier / loaner |

**Decision needed:** is your test-day fleet all Win/macOS/iPad? If not, SEB is a
*partial* solution and `strict` must stay the floor for everyone else.

### 3.2 Why SEB fits our stack surprisingly well

We deploy a **static SPA on Netlify + Supabase RPCs, with no server in the request
path** (no Express, no edge middleware). That normally makes lockdown-browser
verification hard — there's nowhere to inspect a request header at page load. But:

1. **SEB injects its verification header on *every* HTTP request**, including the
   `fetch`/XHR calls supabase-js makes to the RPC endpoint — not just the top-level
   page load (per the official BEK spec). The hash is computed per-request-URL.
2. **Postgres functions can read request headers.** PostgREST exposes the full
   header set as a transaction-local GUC:
   `current_setting('request.headers', true)::json ->> 'x-safeexambrowser-configkeyhash'`
   (header names are lowercased; the Supabase/Kong gateway forwards arbitrary
   custom headers to PostgREST).

⇒ **The verification gate goes *inside* `get_test_module`** — the RPC that actually
serves the questions. No new server, no Edge Function proxy, no BFF. The gate
protects the *data*, which is the only thing worth protecting.

> **CORS note:** SEB injects the header at the native network layer, *below* the JS
> fetch/CORS boundary — our supabase-js code never declares the custom header, so
> it does **not** trigger a CORS preflight, and we sidestep the known Supabase
> gateway bug that truncates `Access-Control-Allow-Headers` (#41334). If we ever
> set the header from JS ourselves, that bug would bite — so don't.

### 3.3 The two hashes (mechanics)

When enabled, SEB adds one header per request:

| Key | Header (lowercased in PostgREST) | Hashed string | Encoding |
|---|---|---|---|
| **Config Key** | `x-safeexambrowser-configkeyhash` | `SHA256( absoluteURL_utf8 ‖ ConfigKey )` | lowercase hex, 64 chars |
| **Browser Exam Key** | `x-safeexambrowser-requesthash` | `SHA256( absoluteURL_utf8 ‖ BrowserExamKey )` | lowercase hex, 64 chars |

- Concatenation order is **URL first, then key** (per the SEB spec's C reference).
- **Server verification:** recompute `encode(digest(request_url || stored_key,
  'sha256'), 'hex')` (pgcrypto) and **constant-time compare** to the header.
  Mismatch ⇒ refuse to return questions (raise `seb_required`).
- **Use the Config Key, not the BEK.** Config Key = a SHA-256 of the `.seb`
  settings only; it is **stable across SEB versions** and auto-computable. The BEK
  also folds in the SEB app's code signature + a salt, so it **changes every SEB
  release and per OS** — you'd be forever rotating an allow-list. (Optionally
  accept a small BEK allow-list *too*, but Config Key alone is the low-maintenance
  path.)

⚠️ **The fiddly bit:** you must reconstruct the **exact absolute URL** SEB hashed
(scheme + host + path + query, per RFC 1808) to match. PostgREST gives you
`request.path`; assemble the full `https://<project>.supabase.co/rest/v1/rpc/
get_test_module` and verify it matches what SEB sent. Moodle spent real effort
getting this exact — budget iteration here. (An Edge Function proxy makes reading
the full `req.url` trivial if the in-RPC URL reconstruction proves brittle — that's
the fallback architecture.)

### 3.4 Config artifacts you create (one-time + on config change)

1. **Build a `.seb` config** in the SEB desktop app's Preferences/Config Tool:
   - Start URL = a launch page or `/test/:slug`.
   - **URL whitelist** (RFC-3986 filters): your Netlify domain + the Supabase API
     domain only.
   - **Quit password** (so a student can't exit mid-test).
   - **Kiosk mode** on; "Send Browser Exam Key in HTTP header" **on**.
2. **Host the `.seb` file** as a static asset on the Netlify site.
3. **Launch link:** `sebs://yourdomain/exam.seb` (the `sebs://` scheme forces an
   HTTPS config download and auto-starts SEB). Put this behind a "Start in Lockdown
   Browser" button on the test overview for `lockdown` tests.
4. **Extract the Config Key** from the config and store it server-side.

### 3.5 Schema + code changes (when we build it)

- **Migration (future):** `ALTER TABLE tests ADD COLUMN seb_config_key text` (+
  optional `seb_bek_allow text[]`). Either extend the `proctoring_level` CHECK to
  allow `'lockdown'` or add a boolean `seb_required` (lean: a 4th level keeps it
  one knob).
- **Gate inside `get_test_module`:** at the top, `IF test.seb_required AND NOT
  _seb_header_valid(...) THEN RAISE EXCEPTION 'seb_required'; END IF;` — using a
  small `SECURITY DEFINER` helper that reads `request.headers`, reconstructs the
  URL, recomputes the Config Key hash, and constant-time-compares. Best-effort it
  is **not** — this one must hard-fail closed.
- **Teacher UI:** a "Lockdown (SEB)" option in the proctoring-level control, a
  field to paste/store the Config Key, and a "Start in Lockdown Browser" launch
  button (`sebs://…`) on the student side for those tests. Keep a proctor override
  (you already have force-end/add-time/pause) for the inevitable "SEB won't launch"
  tickets.
- **Canonical pattern to mirror:** Moodle's `quizaccess_seb` rule — store the
  Config Key (+ optional BEK list) per assessment, verify per request, block the
  attempt on mismatch until staff override.

### 3.6 Operational cost (the real reason to scope it tight)

- **Install + permissions:** students install SEB once per device (free); on
  school-managed machines they may lack admin rights to install.
- **Support burden:** "it won't launch", "I can't install it", "it quit and I lost
  time" — real load for a two-person team on test day. Have the proctor override
  ready.
- **Config maintenance:** low if you stick to the Config Key (version-stable);
  re-extract only when you change the `.seb` settings.
- **Still no defense** against a second phone, a second person, or a camera. SEB
  locks one machine; it does nothing about the room.

### 3.7 Recommendation

Build SEB **only for high-stakes mock-test-day, on a confirmed Win/macOS/iPad
fleet**, with `strict` as the mandatory fallback for anyone who can't run it. For
everyday practice, Phase 1+2 telemetry + the human-reviewed timeline is the right
amount of friction. Sequence when we build: (1) device-fleet survey → (2) `.seb`
config + Config Key extraction → (3) in-RPC verification helper + `get_test_module`
gate → (4) teacher launch button + override → (5) a dry run with one real laptop
before relying on it.

---

## Sources (Phase 3 research, 2026)

- SEB Browser Exam Key spec (PDF) · SEB Config Key dev page · SEB platform support
- PostgREST Transactions / request.headers (v12 docs)
- Supabase custom-header forwarding (discussion #4755) + CORS truncation (issue #41334)
- Moodle `quizaccess_seb` access rule
