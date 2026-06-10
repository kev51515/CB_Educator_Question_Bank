# Pickleball Coaching Platform — Functional Requirements (Dev-Ready)

**Prepared for:** PB Coaching · **Date:** June 10, 2026 · **Version:** 3.0

> **Status note (this repo):** This is the **full product vision** (dev-ready v3.0). The
> `feat/pickleball-coaching` branch currently implements an **MVP subset** layered onto the
> existing LMS as two `course_type` values (`pickleball_player`, `pickleball_coach`) — player
> profiles, lessons (plan/recap + video link & upload), programs, coach profiles,
> certifications, development next-steps, hours log, and realtime chat. See
> [`PLAN_PICKLEBALL.md`](./PLAN_PICKLEBALL.md) for what's built. This document is the
> north-star backlog the MVP grows toward; the data model below is a greenfield ideal and
> does not have to match the LMS schema 1:1.

**Scope:** Custom app for a small pickleball academy (2–10 coaches, est. 100–400 active
players). Two paths — **Player** and **Coach** — plus community and admin. Tags: **MVP**
(launch), **P2** (months 3–9), **P3** (later). Persona tags (P1–P3, C1–C3) trace features to users.

**Document layout for devs:** §1–3 context (personas, benchmark, roles/permissions). §4–10
functional modules, each with user stories, field-level specs, states, and acceptance
criteria. §11–14 cross-cutting specs (notifications, screens, data dictionary, architecture).
§15–16 phasing and open questions.

---

## 1. Personas

Every feature traces back to one of these six people. If a feature doesn't clearly serve one, it doesn't belong in the build.

- **P1 — "Social Starter" Dana, 58** · Retired teacher, rec tennis background. Goal: fun, fitness, people to play with.
  - *Make-or-break:* skill-banded clinics, partner matching, one-tap rebooking, encouraging recaps, community events.
- **P2 — "Driven Improver" Marcus, 41** · Ex-college athlete, has DUPR, wants 3.5 → 4.0 this year.
  - *Make-or-break:* skill matrix + progress charts, level-up criteria, video side-by-side, DUPR sync, practice journal, pre-lesson check-in.
- **P3 — "Junior" Maya, 14 (+ parent Priya)** · Parent-booked lessons; safety and progress visibility matter.
  - *Make-or-break:* guardian portal, restricted minor messaging, coach vetting visibility, quarterly progress reports, badges.
- **C1 — "New Coach" Jordan, 26** · Strong player, new teacher, chasing PPR cert and a full schedule.
  - *Make-or-break:* curriculum templates + drill library, shadowing log, auto hours export, development plan, briefing cards.
- **C2 — "Veteran Pro" Lisa, 45** · Full book. Goal: efficiency and long-term student retention.
  - *Make-or-break:* <3-min recap composer, smart rebooking, retention alerts, group quick-notes, payment-status glance.
- **C3 — "Head Coach / Owner" Sam, 50** · Runs the academy. Goal: growth, coach quality, compliance.
  - *Make-or-break:* compliance dashboard, evaluations + surveys, retention/funnel reports, marketing automation, curriculum versioning, audit log.

---

## 2. Market Benchmark (summary)

| Platform | Focus | Adopted ideas |
|---|---|---|
| CourtReserve | Club management | Self-serve event registration, waitlists, DUPR-gated events, branded app |
| CoachNow / OnForm | Video coaching | Annotation, voiceover, side-by-side, reusable media library |
| Upper Hand | Sports academies | Capacity/waitlist management, staff access levels, payroll reporting |
| Pickleball Coach PRO / Coach+ | Solo coach business | Marketing automation, waivers at checkout, recurring availability, payment status |
| PicklePlay (UTR) | Player community | Ladders, round robins, open play, partner matching |

**Differentiator:** no competitor combines player development + coach development + community.

---

## 3. Roles & Permission Matrix

Roles: **player**, **guardian**, **coach**, **admin** (head coach), **frontdesk** (P3). A user
may hold multiple roles (coach who also plays). Permissions enforced server-side per resource;
UI hides what the API forbids.

| Resource / action | Player | Guardian | Coach | Admin |
|---|---|---|---|---|
| Own profile: read/write | ✔ | ✔ (child's, fields limited) | ✔ | ✔ any |
| Other player profile | ✖ (name/photo only in community) | ✖ | ✔ assigned students; name-only otherwise | ✔ |
| Book/cancel lesson | ✔ self | ✔ for child | ✔ create/cancel own sessions | ✔ any |
| Lesson plan | read (if coach shares) | read (same) | CRUD own | CRUD any |
| Recap + videos | read own | read child's | CRUD for own sessions | read any, delete any |
| Private coach notes | ✖ never | ✖ never | CRUD own students | read |
| Assessment | read own | read child's | CRUD own students | CRUD any |
| Drill library | read assigned + public | read child's assigned | read all, create (admin approval flag) | CRUD + approve |
| Hours log | ✖ | ✖ | CRUD own (manual entries need approval) | read all, approve |
| Certifications | public subset (badge on coach profile) | public subset | CRUD own | CRUD any |
| Coach development plan | ✖ | ✖ | read own, update step status | CRUD any |
| Programs/curricula | read enrolled | read child's | read all | CRUD (versioned) |
| Events/clinics | read + register | register child | read; CRUD own-led | CRUD any |
| Channels/DMs | per §10 rules | read child's channels | per §10 | full + moderation |
| Reports/dashboards | ✖ | ✖ | own stats only | all |
| Audit log | ✖ | ✖ | ✖ | read |

---

## 4. Module: Accounts, Onboarding & Profiles — **MVP**

### 4.1 User stories
- **US-4.1** As a new player (P1), I can sign up with email or phone, complete my profile in under 5 minutes on my phone, and sign the waiver, so I can book my first lesson immediately.
- **US-4.2** As a parent (P3), I can create my own account, add my child as a managed player, and consent on their behalf, so my child never has to handle accounts or payments.
- **US-4.3** As an admin (C3), I can invite a coach by email; they complete a coach profile including certifications before they appear on the booking page.

### 4.2 Auth
- Email + password, plus passwordless OTP (SMS or email) — older players (P1) struggle with passwords; OTP is primary on mobile
- Sessions: JWT access (15 min) + refresh (30 d, rotating); single sign-out-all
- Roles attached as claims; multi-role supported
- Coach/admin accounts are invite-only (signed invite token, 7-day expiry); player signup is open or invite-link from a campaign
- Minor accounts cannot self-register: guardian creates them; login for 13–17 optional via guardian-approved credentials, under-13 no direct login (COPPA)

### 4.3 Player profile — field spec

| Field | Type | Req | Validation / notes |
|---|---|---|---|
| first_name, last_name | string(50) | ✔ | — |
| photo | image | — | ≤10 MB, cropped square client-side |
| dob | date | ✔ | derives `is_minor` (<18); age never shown publicly |
| email / phone | string | ≥1 | unique per account; E.164 phone |
| emergency_contact {name, phone, relation} | object | ✔ before first lesson | blocking gate at first booking, not at signup |
| years_played | enum | ✔ | <1 / 1–2 / 3–5 / 5+ |
| sports_background[] | multi-enum + free text | — | tennis, table tennis, racquetball, badminton, squash, other |
| goals[] | multi-enum, one primary | ✔ | fun, fitness, social, competitive, tournament_prep |
| referred_by | FK User \| free text | — | typeahead of members; free text fallback feeds Lead attribution |
| dominant_hand | enum | — | L/R/ambi |
| paddle | string(100) | — | — |
| injuries_notes | text | — | visible to coaches + admin only |
| self_rating | decimal(2,1) | ✔ | 2.0–5.5 step 0.5, with in-context USA Pickleball level descriptions |
| coach_rating | decimal(2,1) | — | set via Assessment only (not editable directly) |
| dupr_id | string | — | format-validated; sync **P2** |
| waiver {version, signed_at, signature_name, ip} | object | ✔ before first lesson | re-prompt when waiver version changes |
| consent {photo_video: bool, marketing: bool} | object | ✔ | photo_video=false hides player media from any shared feed |
| guardian_id | FK User | if minor | guardian must verify email before child activation |

### 4.4 Coach profile — field spec (extends player personal fields)

| Field | Type | Req | Notes |
|---|---|---|---|
| bio_public | text(1000) | ✔ before listed | shown on booking page |
| specialties[] | multi-enum | ✔ | beginners, juniors, doubles strategy, singles, fitness, tournament prep, …(admin-editable list) |
| intro_video | video | — | ≤90 s |
| playing_rating | decimal(2,1) | — | + optional DUPR link |
| weekly_hour_cap | int | — | default 25; dashboard warning at 90% |
| pay_rates | per lesson-type money | **P2** | admin-only visibility |
| listed | bool | — | auto-false if any required compliance item lapses (§8) |

### 4.5 Acceptance criteria (key)
- Given a guardian account with verified email, when they add a child with DOB <18, then a managed player is created with `guardian_id` set, no credentials, and waiver/consent prompts addressed to the guardian.
- Given a player without signed current-version waiver or emergency contact, when they attempt to confirm any booking, then booking is blocked with an inline complete-now flow (single screen, <1 min).
- Given a coach whose CPR cert expired yesterday, when the booking page loads, then that coach is not listed and admin sees them in the compliance queue (§8).

---

## 5. Module: Assessments & Progression — **MVP**

### 5.1 User stories
- **US-5.1** As a coach, I complete a structured intake assessment on my phone during/after a first session, so placement is consistent across coaches.
- **US-5.2** As a player (P2), I see each skill trending over time and exactly what's required to reach the next level, so I know my money is buying progress.
- **US-5.3** As an admin, I define level-up criteria per program once, and every coach assesses against the same rubric.

### 5.2 Skill matrix definition
10 skills, each scored 1–5 in 0.5 steps. Rubric text per skill per score is admin-editable
seed data (defaults shipped, mapped to USA Pickleball 2.0–5.5 descriptions): **serve, return,
dink, third-shot drop, drive, volley/reset, lob/overhead, footwork, court positioning,
strategy/shot selection**.

| Assessment field | Type | Notes |
|---|---|---|
| player_id, coach_id | FK | coach must be assigned to player or admin |
| type | enum | intake \| progress \| level_up |
| scores[10] | decimal(2,1) | all required for intake; partial allowed for progress (only skills observed) |
| overall_level | decimal(2,1) | suggested = weighted avg (configurable weights), coach can override with reason |
| program_recommendation | FK Program | auto-suggested from overall_level vs program level bands |
| notes | text | player-visible; private remarks go in coach notes |

### 5.3 Level-up criteria
- Per program: list of {skill, min_score} plus optional requirements (e.g., "complete 8 program sessions", "pass serve consistency drill 7/10")
- Player sees a checklist with live state: met / not met / needs re-assessment
- When all criteria met → coach gets "ready to level-up" prompt → level_up assessment confirms → program graduation event (feeds badges **P2** and re-enrollment campaign **P2**)

### 5.4 Acceptance criteria
- Given an intake assessment is submitted, when overall_level falls in a program's band, then that program is pre-selected on the enrollment screen with one-tap confirm.
- Given a progress assessment scoring only 4 of 10 skills, then trend charts update only those 4; untouched skills keep prior score with "last assessed [date]" label.
- Charts render from snapshots — score history is immutable (corrections create a new snapshot with `corrects_id`).

---

## 6. Module: Availability, Booking & Lessons — **MVP**

### 6.1 User stories
- **US-6.1** As a player, I pick a coach (or "any coach"), see real open slots, and book in ≤4 taps.
- **US-6.2** As a coach (C2), my recurring availability plus blocks fully controls what's bookable; I never get double-booked.
- **US-6.3** As a player, with my 24h reminder I can tell the coach what I want to work on and flag a tweaked knee.
- **US-6.4** As a coach, before each session I read a briefing card in ≤30 seconds.

### 6.2 Availability model
- `AvailabilityRule`: coach, weekday, start/end time, location, lesson types allowed, effective_from/until — recurring weekly
- `AvailabilityBlock`: coach, start/end datetime, reason — one-time override (vacation, appointment); blocks win over rules
- Bookable slots = rules − blocks − existing sessions; slot granularity = lesson duration options (30/60/90, admin-config)
- Buffer: optional per-coach minutes between sessions (default 0)
- Timezone: single academy TZ at MVP, stored UTC

### 6.3 Session state machine

| State | Entered when | Allowed transitions |
|---|---|---|
| `draft` | coach/admin creating a group session not yet published | → scheduled, → cancelled |
| `scheduled` | booking confirmed / session published | → completed, → cancelled_player, → cancelled_coach, → no_show |
| `completed` | coach marks complete (or auto 24h after end if attendance taken) | terminal; triggers hours log + recap-due |
| `cancelled_player` | player cancels | terminal; late flag if within cutoff (default 24h, admin-config); late cancel consumes credit (policy flag) |
| `cancelled_coach` | coach/admin cancels | terminal; never penalizes player; triggers re-book assist + apology template |
| `no_show` | coach marks at/after start | terminal; consumes credit (policy flag); 2 no-shows in 60 d → admin flag |

Group sessions track attendance per participant (`registered → attended | no_show | late_cancelled`) independent of session state.

### 6.4 Booking rules
- Concurrency: slot lock on selection (90 s TTL) → confirm; optimistic-conflict error offers nearest 3 alternatives
- Booking window: max 30 days ahead (config), min 2 h before start (config)
- Waitlist (group/clinic): FIFO; on freed seat → push+SMS to next, 2 h claim window (config), then cascade; chain stops at session start −2 h
- Smart rebooking: after completed private lesson, suggest same coach/slot next week (one tap); on last package credit, prompt rebook+repurchase (**P2** for payment part)
- Reschedule = atomic cancel+rebook keeping recap/check-in context

### 6.5 Pre-lesson check-in & briefing card
- Check-in form (sent with 24h reminder, optional): `focus_request` text(200), `condition_flag` enum (good | minor_issue | injured) + note. Injured → coach + admin notified immediately
- Briefing card (coach, per session): player name/photo, primary goal, current level + top-2 weakest skills, last recap summary, homework status, check-in note, package credits remaining, flags (injury, first lesson, minor)
- Renders offline from prefetched data (courtside reality)

### 6.6 Lesson plan & recap — field spec

| Field | Type | Notes |
|---|---|---|
| plan.template_id | FK CurriculumSession \| CoachTemplate | plan pre-fills from curriculum for program sessions |
| plan.objectives[] | string list | — |
| plan.drills[] | FK Drill + params (reps/duration) | — |
| plan.player_visible | bool | default per-coach setting |
| recap.covered[] | chips from plan.objectives + free add | auto-drafted from plan — edit, don't retype |
| recap.wins / work_ons | text | voice-to-text first-class |
| recap.homework[] | FK Drill + params + due hint | creates HomeworkAssignment rows |
| recap.videos[] | upload refs + caption + skill tag | background upload, max 5 min/clip MVP |
| recap.visibility | player (+guardian auto if minor) | — |

**Recap SLA:** due 24 h after completion; "recaps owed" on coach dashboard; admin report of
overdue recaps (C3 quality lever). Group sessions: bulk recap + optional per-player addendum.

### 6.7 Acceptance criteria (key)
- Given two players confirm the same private slot within the lock TTL, then exactly one succeeds; the other gets alternatives — no double-booking ever reaches the DB (unique index on coach+timerange).
- Given a player cancels 25 h before start with a 24 h cutoff, then no penalty and the slot returns to inventory and triggers the waitlist cascade if any.
- Given a check-in marked injured, then coach and admin receive immediate notification and the briefing card shows a red flag.
- Given a completed session, when 24 h pass without a recap, then the session appears in "recaps owed" and in the admin overdue report.

---

## 7. Module: Drills, Homework & Practice — **MVP**

### 7.1 Drill — field spec

| Field | Type | Notes |
|---|---|---|
| name, description | string/text | — |
| demo_video | video ref | library-hosted |
| skill_tags[] | enum of the 10 skills | drives "drills for your weak spots" |
| level_band | range 2.0–5.5 | — |
| solo_or_partner | enum: solo \| partner \| group \| wall | solo/wall drills matter — most players can't summon a partner |
| equipment[] | string list | — |
| default_params | reps/duration | — |
| contributed_by | FK Coach | attribution feeds coach development credit (§9) |
| status | draft \| pending_approval \| published \| archived | coach-created drills need admin approval |

### 7.2 HomeworkAssignment
- {player, drill, params, assigned_via recap, due_hint, status: assigned | done | skipped, completed_at}
- Player marks done (honor system MVP); coach sees compliance on briefing card and roster
- **P2** streaks, practice journal (self-logged sessions + match results), reflection prompts

### 7.3 Acceptance criteria
- Given a recap with 2 homework drills, then the player's dashboard shows both with demo videos, and the next briefing card shows done/not-done per drill.
- Given a coach submits a new drill, then it is searchable for that coach immediately (status pending) but only enters the shared library on approval.

---

## 8. Module: Coach Certifications, Compliance & Hours — **MVP**

### 8.1 Certification — field spec

| Field | Type | Notes |
|---|---|---|
| type | enum: PPR \| IPTPA \| USAP_Coach \| CPR_FirstAid \| YouthSafety \| BackgroundCheck \| other | admin-extendable |
| level | string | e.g., PPR Level 1/2 |
| issued_at / expires_at | date | expires_at nullable (background check uses re-check interval) |
| certificate_file | file | pdf/image ≤10 MB |
| verified_by | FK Admin + date | self-reported until verified |
| required_for_listing | bool (per type, academy policy) | drives auto-unlist rule (§4.4) |

- Alerts at 60/30/7 days to coach; 30/7 to admin; expiry of a required cert → coach auto-unlisted + existing sessions kept but flagged for admin decision
- Public coach profile shows badge-level info only ("PPR Certified", "Background checked ✓, youth-safety trained ✓") — no documents (P3 parent trust)

### 8.2 Hours log
- Auto entry on session → completed: {coach, date, duration, program/type, source: auto}
- Manual entry {duration ≤ 12 h/day validation, program, note, source: manual, status: pending → approved/rejected by admin}
- Views: this week / month / quarter / all-time; by program; CSV export (columns: date, duration, type, program, students count, source, status)
- Teaching-load bar: week total vs. weekly_hour_cap; ≥90% → coach banner; admin sees all coaches' load (C3 burnout guard)

### 8.3 Acceptance criteria
- Given a session is marked completed, then an hours entry exists within 1 min, attributed to the right program type, and is immutable (corrections via admin adjustment entries).
- Given a manual entry overlapping an auto entry's time range, then submission warns and requires a confirm-with-reason.

---

## 9. Module: Coach Development — **MVP**

- `DevelopmentPlan`: coach, steps[] {title, description, target_date, status: todo | in_progress | done | waived, evidence link (cert, hours threshold, shadow count)}
- Step types with auto-completion hooks: **cert** (closes when matching certification verified), **hours** (closes at threshold per program), **shadow** (closes at N shadow logs), **manual** (admin closes)
- `ShadowLog`: {coach, mentor, session ref or manual, notes by mentor, date} — mentor signs off in-app
- Templates: admin defines a default development track (e.g., "New Coach → Level Up lead"); assigned at coach creation, editable per coach
- **P2** Evaluations: admin rubric {instruction, communication, safety, retention} 1–5 + notes, history charted; player post-lesson pulse survey (1 tap + optional comment, max 1/week/player) rolled up per coach
- **P2** Knowledge base: coach-only space; drill contributions and teaching notes credited to development (counts as evidence for manual steps)

**AC:** Given Jordan (C1) logs their 100th Newbie hour and the plan has step "100 Newbie hours", then the step auto-completes and both Jordan and admin are notified with "next step" surfaced.

---

## 10. Module: Events & Community

### 10.1 Events/clinics — **MVP**
- `Event`: {type: clinic | camp | social (ladder/round robin **P2**), name, description, coach(es), location, schedule (single or recurring series), capacity, price (display-only MVP; charged **P2**), skill_gate {min,max rating}, registration_open/close, waitlist}
- Registration: eligibility check vs. coach_rating (fallback self_rating, flag "unverified"); minors require guardian action; waiver gate applies
- Roster + check-in list for the leading coach; bulk recap allowed

### 10.2 Community chat — **MVP**
- Channel types: **announcement** (admin/coach post, all read), **program** (auto-membership from enrollment), **general**, **coaches** (coach+admin only), **event** (auto per event, archives 14 d after), **dm**
- DM policy matrix: player↔own coach ✔; coach↔coach ✔; player↔player — admin toggle (default off); any adult↔minor ✖ (minors: group channels only, guardian read-access mirror)
- Features: text, image, video clip, reactions, threads (one level), @mentions, pinned posts; edit 15 min window, delete own; full-text search
- Moderation: report → admin queue; admin delete/mute(24h/7d/permanent); blocked-words filter (configurable list) holds message for review
- Realtime via **Supabase Realtime** (Postgres changes — already used across the LMS, incl. the MVP pickleball chat); external delivery via the in-app notifications table + LINE (web-push/SMS are P2); channel msgs batched per prefs
- **P2** Partner-match posts (structured: rating band, date/time, location, slots) with one-tap join; coach office-hours Q&A channel with searchable answers

**AC:**
- Given a 14-year-old member, then DM creation with any adult is impossible at the API level (not just hidden), and their guardian can open a read-only mirror of the child's channels.
- Given a registration attempt on a 3.5–4.0-gated clinic by a 3.0-rated player, then registration is blocked with the rating shown and a "talk to your coach" CTA (coach can override-enroll).

---

## 11. Notification Matrix — **MVP**

Channels: push (primary), SMS (high-value only — cost), email (records + fallback). All
per-user toggles; quiet hours default 21:00–08:00 (non-urgent deferred).

> **Stack note:** today this project delivers via the in-app `notifications` table + **LINE
> Messaging** (Edge Functions) + **email (Resend)**. The SMS and native/web-**push** columns
> below are a **P2** build (no Twilio/web-push wired yet) — treat them as the target matrix.

| Event | Recipient | Push | SMS | Email | Timing |
|---|---|---|---|---|---|
| Booking confirmed | player (+guardian) | ✔ | — | ✔ | immediate |
| Lesson reminder + check-in link | player | ✔ | ✔ | — | T−24h; push also T−2h |
| Session booked/cancelled | coach | ✔ | — | — | immediate |
| Coach cancels | player (+guardian) | ✔ | ✔ | ✔ | immediate + rebook assist |
| Waitlist seat offered | next player | ✔ | ✔ | — | immediate, expires per claim window |
| Recap ready | player (+guardian) | ✔ | — | ✔ (digest) | on publish |
| Recap overdue 24h | coach | ✔ | — | — | daily until done |
| Injury check-in flag | coach + admin | ✔ | ✔ | — | immediate |
| Cert expiring | coach / admin | ✔ | — | ✔ | 60/30/7 d (admin 30/7) |
| Retention flag raised | owning coach + admin | ✔ | — | ✔ (weekly digest) | on trigger |
| Development step complete | coach + admin | ✔ | — | — | on trigger |
| Announcement | audience | ✔ | — | optional | on post |
| DM / @mention | recipient | ✔ | — | — | immediate (channel msgs batched) |

---

## 12. Screen Inventory — **MVP**

| Area | Screens |
|---|---|
| Shared | Auth (login/OTP/invite accept), onboarding wizard, notification prefs, settings |
| Player (9) | Dashboard · Book (coach list → slot picker → confirm) · My lessons (upcoming/history) · Lesson detail (plan/recap/videos/homework) · Check-in form · Progress (skill charts + level-up checklist) · Video library · Events list + detail/registration · Community (channels, DM) |
| Guardian (+3) | Child switcher · child mirror of dashboard/lessons/progress · consent & waiver center |
| Coach (10) | Dashboard (today + briefing cards + recaps owed + alerts) · Schedule/calendar · Availability editor · Session detail (plan builder / attendance / recap composer) · Roster · Student detail (profile, matrix, history, private notes) · Drill library (+ submit) · Hours log · My development · Certifications |
| Admin (8) | Academy dashboard · Users (players/coaches CRUD, assignments) · Programs & curricula editor · Drill approval queue · Compliance dashboard · Reports (retention, hours, attendance, enrollment, referrals) · Retention alert queue · Moderation queue + audit log |

≈ 30 screens MVP. Mobile-first; coach flows must be fully usable one-handed on a phone; admin reports may be web-optimized.

---

## 13. Data Dictionary (expanded)

Postgres-style; all tables get `id (uuid)`, `created_at`, `updated_at`; soft-delete
(`deleted_at`) on user-facing content. FKs indexed.

| Table | Columns (type) — key constraints |
|---|---|
| users | email (citext, unique), phone (unique, null), password_hash (null if OTP-only), roles (text[]), first_name, last_name, dob (date), photo_url, is_minor (generated), guardian_id (fk users, null), emergency_contact (jsonb), consent (jsonb), status (enum: active\|invited\|suspended) |
| player_profiles | user_id (fk, unique), years_played (enum), sports_background (text[]), goals (jsonb: [{goal, primary}]), referred_by_user_id (fk, null), referred_by_text, dominant_hand, paddle, injuries_notes, self_rating (numeric(2,1)), coach_rating (numeric(2,1)), dupr_id, waiver (jsonb) |
| coach_profiles | user_id (fk, unique), bio_public, specialties (text[]), intro_video_url, playing_rating, weekly_hour_cap (int default 25), listed (bool), pay_rates (jsonb, P2) |
| programs | name, level_min (numeric), level_max, price_display (money, P2 charged), levelup_criteria (jsonb), active (bool) |
| curriculum_sessions | program_id (fk), version (int), seq (int), title, objectives (jsonb), drill_ids (uuid[]) — unique (program, version, seq) |
| sessions | type (enum: private\|semi\|group\|program\|clinic), coach_id (fk), program_id (fk null), curriculum_session_id (fk null), event_id (fk null), starts_at/ends_at (timestamptz), location_id (fk), capacity (int), status (enum §6.3), plan (jsonb), recap (jsonb), recap_published_at — exclusion constraint on (coach_id, tstzrange) for non-cancelled |
| session_participants | session_id (fk), player_id (fk), attendance (enum: registered\|attended\|no_show\|late_cancelled), checkin (jsonb: focus_request, condition_flag, note), reflection (jsonb, P2), credit_txn_id (fk, P2) — unique (session, player) |
| availability_rules / availability_blocks | per §6.2 |
| waitlist_entries | session_id\|event_id, player_id, rank, state (enum: queued\|offered\|claimed\|expired\|withdrawn), offered_at, expires_at |
| assessments | player_id, coach_id, type (enum), scores (jsonb {skill: score}), overall_level, override_reason, program_recommendation_id, notes, corrects_id (fk self, null) |
| drills | name, description, demo_video_url, skill_tags (text[]), level_min/max, solo_or_partner (enum), equipment (text[]), default_params (jsonb), contributed_by (fk), status (enum) |
| homework_assignments | player_id, drill_id, session_id (source recap), params (jsonb), status (enum: assigned\|done\|skipped), completed_at |
| certifications | coach_id, type (enum), level, issued_at, expires_at, file_url, verified_by (fk null), verified_at, required_for_listing (bool) |
| hours_entries | coach_id, date, duration_min, program_type, session_id (fk null), source (enum: auto\|manual\|adjustment), status (enum: approved\|pending\|rejected), note |
| development_plans / plan_steps | coach_id; steps: type (enum: cert\|hours\|shadow\|manual), title, description, target_date, status, auto_criteria (jsonb), evidence_ref |
| shadow_logs | coach_id, mentor_id, session_id (null), date, mentor_notes, signed_off (bool) |
| retention_flags | player_id, trigger (enum: attendance_drop\|package_end_no_rebook\|homework_silent\|feedback_dip), owner_coach_id, status (enum: open\|actioned\|resolved\|dismissed), action_note |
| events | per §10.1; registrations join table mirrors session_participants |
| channels / channel_members / messages | channel type (enum §10.2), policy flags; messages: body, attachments (jsonb), thread_parent_id, edited_at, deleted_by, flagged (bool) |
| videos | owner_player_id (null for library), uploader_id, session_id (null), drill_id (null), provider_asset_id, status (enum: uploading\|processing\|ready\|failed), duration_s, skill_tags, caption, consent_ok (derived) |
| notifications | user_id, type, payload (jsonb), channels_sent (text[]), read_at |
| leads (P2) | source (enum incl. guest_pass\|referral\|landing_page), contact, status (enum pipeline), touchpoints (jsonb), converted_user_id |
| packages / credit_txns (P2) | standard ledger: purchases positive, consumption negative, balance = sum; expiry job |
| audit_log | actor_id, action, resource_type/id, before/after (jsonb), at — append-only |

---

## 14. Architecture & Stack

> **Updated to this project's actual stack** — authoritative source is
> [`STACKS.md`](./STACKS.md). The rows below show what the platform runs on **today**;
> the **Gap / future** column flags where the v3 vision needs something not yet in place.
> (The original v3 doc suggested React Native + a Node/Django API + Ably/Pusher + Mux +
> Twilio — superseded by the rows below.)

| Concern | This project uses | Gap / future |
|---|---|---|
| Client | **React 19 + Vite 8 + TypeScript 6**, react-router-dom 7, Tailwind CSS, TipTap (`MarkdownEditor`), KaTeX — a single **installable PWA** (web, phone-first). **Not** React Native. | A native iOS/Android shell (background video upload, richer push) would be a deliberate fork; the PWA covers MVP. Settles the §16 architecture fork. |
| Architecture | **Static SPA** (`viewer/dist`), **no API server** — the browser calls Supabase directly. **Row-Level Security is the only boundary** between a user and others' data; every new table ships RLS + `SECURITY DEFINER` RPCs. | Server-side-only logic goes in a Supabase **Edge Function** (Deno), never a new backend. |
| Hosting / deploy | **Cloudflare Pages** (NOT Vercel). Build `npm run build` (`tsc -b && vite build`) → `dist`; SPA rewrite `viewer/public/_redirects`; auto-deploy on push to `main`; per-branch preview URLs; `VITE_*` env in CF Pages settings. | — |
| DB | **Supabase Cloud Postgres** (project ref `ljdofwovsyaqydcbohhd`), cloud-only (no local Docker). | Exclusion constraints for double-booking (§6.7) + jsonb for plan/recap fit natively. |
| Migrations | **Forward-only SQL** in `supabase/migrations/` (ledger `docs/MIGRATIONS.md`); apply via `supabase db push` or `psql` over the pooler. | — |
| Auth | **Supabase Auth (GoTrue)** — managed-student seats (claim via login code) + quick-start course codes; multi-role via profile. | OTP/passwordless + guardian-linked minor accounts (§4.2) are GoTrue-capable but not yet wired. |
| Storage | **Supabase Storage** (buckets + signed URLs). MVP recap/cert uploads land here (`pickleball-videos`, `pickleball-certs`). | For heavy video at scale (~0.5–1 TB/yr), consider **Cloudflare Stream / Mux** (direct upload + transcode + signed playback) instead of proxying large files. |
| Video (today) | Recap videos support **paste-a-link** (YouTube/Vimeo/Drive embed via `lib/videoEmbed.ts`) **and** file upload to Supabase Storage. | Annotation / side-by-side / voiceover (P2, CoachNow-style) needs Mux/Stream or a video SDK. |
| Realtime | **Supabase Realtime** (Postgres changes) — already powers course lists and the new pickleball chat. | No Ably/Pusher needed at this scale. |
| Jobs / schedulers | **pg_cron** in-database (announcement fan-out, deadline reminders today). | Reminders, waitlist cascade, cert-expiry / recap-overdue / retention scans (§6,§8,§14) become pg_cron jobs + Edge Functions — no BullMQ/Celery. |
| Server-side functions | **Supabase Edge Functions (Deno)** — e.g. `counselor-ai`, `line-webhook`/`line-dispatch`. | The NotificationService choke-point (§11) + any external API calls live here. |
| Messaging / notifications | **In-app `notifications` table** + DB triggers + pg_cron fan-out; **LINE Messaging API** integration in progress (`line-webhook`/`line-dispatch`) for push-style delivery. | **No Twilio SMS / native push / web-push today** — §11's SMS+push matrix is a future build; LINE is the current external channel. |
| Transactional email | **Resend** (SendGrid is the named fallback); SMTP wired (`docs/SMTP_SETUP.md`). | — |
| Error tracking | **Sentry** (`@sentry/react`, `VITE_SENTRY_DSN`). | — |
| Analytics | **PostHog** (`VITE_POSTHOG_*`) for product events + **Cloudflare Web Analytics**. | §9/§15 admin reports aggregate PostHog events + DB rollups. |
| CI | **GitHub Actions** (`.github/workflows/ci.yml`) — build (tsc + vite) + smoke suites (`viewer/scripts/*.mjs`). CI does **not** deploy. | — |
| Payments (P2) | none yet (price fields display-only). | **Stripe** when P2 lands (packages/memberships, guest pass). |

**Retention-flag rules (job logic, admin-tunable):** attendance_drop = 0 sessions in 21 d for
a previously weekly player (rolling 8-week baseline); package_end_no_rebook = last credit
consumed + 7 d with no future booking; homework_silent = 3 consecutive assignments untouched;
feedback_dip (**P2**) = survey ≤2 or NPS drop ≥3 points.

---

## 15. Build Phases & Suggested Milestones

| Milestone | Scope | Demo-able outcome |
|---|---|---|
| M1 (wk 1–4) | Auth, profiles, roles, guardian linking, waiver/consent | All six personas can exist in the system |
| M2 (wk 4–8) | Availability, booking, session state machine, reminders, check-in, briefing card | Dana books Lisa; Lisa sees briefing card |
| M3 (wk 8–12) | Plans, recaps, video upload, drills, homework | Full lesson loop: plan → teach → recap+video → homework |
| M4 (wk 12–15) | Assessments + progression, hours, certifications + compliance, development plans | Marcus sees progress; Sam sees compliance; Jordan sees next steps |
| M5 (wk 15–18) | Events/clinics + waitlists, chat + moderation, retention flags, admin reports, polish | **MVP launch** |
| P2 (mo 3–9) | Stripe packages/memberships + guest pass, video annotation/side-by-side, DUPR, ladders/open play, surveys + evaluations + knowledge base, marketing automation, payroll/revenue, calendar sync, QR check-in | Revenue + retention engine |
| P3 | AI video, internal cert ladder, tournaments, court/resource mgmt, front desk, pro shop, auto training plans | Scale |

---

## 16. Open Questions (blocking dev decisions)

- Payments offline at launch? (Spec assumes yes; price fields display-only until P2)
- Courts owned (→ court/resource entity needed earlier) or rented (location string suffices)?
- % minors → priority of guardian portal polish and youth-safety surfacing
- DUPR partner application — start now; lead time unknown
- Progress visibility default: recommend private by default, opt-in social
- ~~React Native vs PWA~~ — **settled: React 19 + Vite PWA (web)** per [`STACKS.md`](./STACKS.md); revisit only if a native shell becomes necessary
- Branding: standalone vs PrepMasters umbrella (affects app store accounts, sender domains)

### Benchmark sources
CoachNow (coachnow.com) · OnForm (onform.com) · CourtReserve (courtreserve.com) · Upper Hand
(upperhand.com) · Pickleball Coach PRO (pickleballcoachpro.com) · Pickleball Coach+ (Google
Play) · PicklePlay/UTR (pickleplay.com) · DUPR API partner program (dupr.com) · USA Pickleball
skill rating definitions (usapickleball.org)
