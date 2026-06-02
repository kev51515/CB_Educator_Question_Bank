# LMS Roadmap

An honest, opinionated plan for evolving this SAT prep tool into a Canvas-style LMS. Written against the codebase as it actually stands — not a wishlist.

## 1. Where we are (honest snapshot)

Most of tier 1–2 has shipped. The product is real-classroom-ready; what's left is differentiation and one critical fidelity gap (real SAT scaled scoring).

**Wave 20 (May 2026)** shipped a full audit response: migration 0050 closed
B1 (admin_delete_user privilege escalation) + B2 (observational audit trigger
on profile delete). Mock-test runner reached SR + extended-time accommodation
parity (B3+B4+B5). Assignment resume MVP (B6 — partial: question pool yes,
answer-state hydration pending). TA grading UI MVP shipped to localStorage
(M6 — pending schema migration for `assignment_attempts.feedback_text/
score_override/graded_at`). Staff ⌘K wired through 8–21 commands. Gradebook
sticky + filter pills + click-to-message routing. Student MobileTabBar +
`/courses/:short` route + clickable SkillHeatmap + WeakSkills CTA above the
fold. Vocabulary canon: Practice Test = mocktest, Question Set = qbank_set
(documented in CLAUDE.md). See `docs/UX_AUDIT_2026-05_FULL.md` and
`docs/SESSION_RECAP.md` Wave 20 section.

**Wave 21 (Jun 2026)** closed most of the Wave-20 parking lot in an
11-lane autonomous follow-through pass. Migrations 0056 (grading
persistence — `feedback_text/score_override/graded_at/grader_id` columns
+ teacher UPDATE RLS + `audit_assignment_grade` trigger +
`assignment_attempts_effective` view; note: earlier session notes
mislabeled this as 0053 — the cloud ledger 0053 is a content fix and
0056 is the canonical grading migration) and 0054 (announcement
broadcast + `publish_at` for scheduled publish). Plus: cross-course Needs Attention
panel on Dashboard (M1), Practice Tests catalog on `/question-bank` (M3),
B6 finish — MockTestApp answer-state hydration on resume — student ⌘K
with 8 commands (M16), mock-test history at `/mock-test/history` with
compare-2 (M12), inline score arc visualization (M13), focus-trap sweep
on 23 dialogs (M26), text-slate-400 body-text contrast cleanup on 26
files (M31), Toast.action undo on 6 sites (M10), forbidden-pattern fixes
(MarkdownEditor + useToast + skeleton screens). Remaining parking lot:
parent magic-link (M24 — needs design input), code-quality refactors,
B6 server-side per-question persistence. See `docs/SESSION_RECAP.md`
Wave 21 section.

**Wave 21B (Jun 2026)** continued the autonomous follow-through and
closed the M6/M127 loop end-to-end. Round 4 shipped the gradebook + score
hero migration to use `effective_score` everywhere (with "Adjusted by
teacher" pills on every surface a student can see), the student-side
"Teacher feedback" card on `StudentAttemptReview` (lazy-loads grader
name), and the `TagInput` primitive + `PortfolioItemFormModal` Choices
swap (last forbidden-pattern textarea closed). Round 5 shipped 3
migrations: 0057 (`assignment_best_attempts` now picks by `COALESCE(
score_override, score_percent)` + exposes `effective_score`, closing the
view-picks-wrong-attempt limitation), 0058 (scheduled-announcement
notification fan-out via pg_cron, closing the M2 publish-time gap), and
0059 (grade-complete notification trigger so students get notified when
a teacher fills graded_at/feedback_text/score_override). Round 5 also
shipped a student-side AssignmentsPanel "Graded {timeAgo} · Feedback"
indicator. Round 6 then dropped the now-redundant CourseGradebook
second-round-trip (derives `score_override` from `effective_score !==
score_percent` instead). See `docs/SESSION_RECAP.md` Wave 21B section.

- **Auth, roles, class enrollment — ~98%.** Email/password, anonymous quick-start, role-based routing, profile auto-mint, classes/roster, RLS helpers, **password reset flow, anonymous → real account upgrade, teacher invite codes** are all live. Account settings UI shipped. The only remaining gap is co-teachers / TAs as a first-class concept (cross-staff parity gives ~80% of the value already).
- **Assignment loop — ~95%.** Fully wired end-to-end. `AssignmentRunner` mounts `MockTestApp` with assignment config, `start_assignment_attempt` RPC snapshots questions server-side into `assignment_attempt_questions` (mig 0014), multiple attempts + late penalty (mig 0020), per-attempt review with proper snapshot rendering. Wave 7 fixed the snapshot-snippet ↔ items mismatches.
- **Mock test runner — ~95%.** Unchanged; now also rendering KaTeX math in stems/answers/explanations.
- **Question bank viewer — mature.** Out of scope.
- **Teacher console — mature.** Gradebook, calendar, course duplication + templates (mig 0018), bulk roster import, materials (mig 0016 + Storage bucket), announcements (mig 0015), portfolio (mig 0017), discussions (mig 0025), inbox/DM (mig 0026), in-app notifications (mig 0029) all shipped.
- **Production hardening — largely done.** Rate limiting (mig 0021 + 0023 prune), audit log (mig 0022 + 0027 + 0028 cleanup), GDPR export (mig 0023), anonymous-user cleanup (edge function `cleanup-anon-users` + pg_cron in mig 0031), assignment-due-reminders edge function + pg_cron scheduled, Sentry + PostHog wired (env-var-gated).
- **Analytics — partial.** Skill mastery tracking (mig 0024) live. **Score predictions are a STUB** — `linear-v1` is a placeholder, not a real SAT scaled-score model.

## 2. Canvas feature audit

| Canvas LMS feature | Our status |
|---|---|
| Courses (Classes) | Built |
| People (Roster) | Built + bulk import |
| Course join codes / invitations | Built |
| Assignments | Built (wired, snapshot, multi-attempt, late penalty) |
| Quizzes / Tests | Built (bound to assignments) |
| Modules (sequenced learning units) | Built (mig 0011) |
| Announcements | Built (mig 0015) |
| Discussions | Built (mig 0025 + 0030) |
| Pages (rich-text course content) | Built (materials kind='note', KaTeX) |
| Files / Materials | Built (mig 0016 + Storage) |
| Grades / Gradebook | Built |
| Calendar | Built |
| Inbox / Messaging | Built (mig 0026) |
| In-app notifications | Built (mig 0029) |
| Rubrics | Out of scope¹ |
| Outcomes (standards alignment) | Built (skill mastery, mig 0024) |
| SpeedGrader (manual grading UI) | Out of scope¹ |
| LTI external tool integration | Out of scope¹ |
| Course catalog / self-enroll | Out of scope¹ |
| ePortfolios | Built (mig 0017) |
| Web conferencing | Out of scope¹ |

¹ See section 10 for why.

## 3. Tier 1 — fidelity gaps blocking real-cohort credibility

Most of the original tier 1 has shipped. What remains here is short and specific.

### 3.1 Real SAT scaled scoring (the big one)

**What.** Replace the `linear-v1` predictor stub with an honest SAT scaled-score model: 200–800 per section, 400–1600 composite, with an adaptive Module 2 simulation for full-length mock tests (Reading & Writing and Math each branch into easier/harder Module 2 based on Module 1 performance, as the digital SAT does).

**Why tier 1.** Score predictions are surfaced in the UI today but the underlying number is a placeholder. Any test-prep product whose central promise is "predict your SAT score" cannot ship a stub here. This is the single most consequential remaining item.

**Approach.** Two pieces:
1. **Adaptive routing in the runner.** Module 1 question pool fixed at creation; Module 2 pool chosen at the inter-module gate based on Module 1 raw score. Snapshot both into `assignment_attempt_questions` with a `module` column.
2. **Scaled-score table.** Either license a published conversion table or fit one against the public CB practice tests. Store per-form lookup tables in `sat_scale_forms(form_id, section, raw_score, scaled_score)`.

**Effort.** L (1.5–2 weeks). The model itself is small; sourcing a defensible conversion table and adapting the runner are the work.

**Dependencies.** Snapshot infrastructure (already in place via mig 0014); needs schema migration for `module` column.

### 3.2 Rubrics + manual grading (only if free-response is added)

**What.** Schema for `assignment_rubrics`, `rubric_criteria`, `manual_score`, `graded_by`, `graded_at`. Teacher grading UI.

**Why tier 1 conditionally.** Not needed for the current multiple-choice product. Promoted from "out of scope" to tier 1 *only when* SPR or essay items are added — at which point it becomes a blocker.

**Effort.** L (2 weeks). **Dependencies.** A decision to add free-response items.

### 3.3 RLS regression tests

**What.** `pgTAP` test suite: "student A cannot read student B's attempts", "anonymous user cannot create a class", "student cannot insert into `assignment_attempt_questions` directly", "student cannot read another class's materials". Run in CI before every `db push`.

**Why tier 1.** With 30+ migrations now in production, an RLS regression is the most likely class of silent data leak. The cost of writing this is small; the cost of shipping a leak is enormous.

**Effort.** M (3 days).

## 4. Tier 2 — workflow polish for real cohorts

### 4.1 Co-teachers / TAs as a first-class concept

**What.** Add `class_teachers(class_id, teacher_id, role)` (role: `owner` | `co_teacher` | `ta`) and rework `is_teacher_of_class` to consult it. Today cross-staff parity (mig 0010) gives ~80% of the value — any staff member can see any class — but it's all-or-nothing; you can't grant just one TA access to one class.

**Why.** First request from any school selling-motion. Schools think in terms of teacher-of-record + TAs.

**Effort.** M (3 days). **Dependencies.** Touches every assignment RLS policy.

### 4.2 Course-section / sub-cohort splitting

**What.** `class_sections(id, class_id, name)`, optional `assignment.section_id`, students enrolled at the section level. Enables differentiated assignments within one class.

**Why.** Teachers running two periods of the same class want to share materials but assign different homework.

**Effort.** M (3 days).

### 4.3 File attachments in messages

**What.** Extend `inbox_messages` and `discussion_posts` with attachment rows pointing into a `message-attachments` storage bucket. RLS: attachment readable iff parent message readable.

**Why.** Teachers want to attach worked solutions when answering a DM question.

**Effort.** S–M (2 days).

### 4.4 Read receipts in discussion

**What.** `discussion_post_reads(post_id, profile_id, read_at)`. "Unread" badge on threads.

**Why.** Teachers can see which students engaged. Inbox already has this; discussion doesn't.

**Effort.** S (1 day).

### 4.5 Peer review

**What.** A `peer_review_assignments` workflow: each student reviews N peers' attempts against a structured prompt; reviewer identity hidden.

**Why.** Pedagogically valuable for essay-prep and command-of-evidence reasoning. Blocked on rubrics (3.2).

**Effort.** L (1.5 weeks). **Dependencies.** 3.2.

## 5. Tier 3 — research-grade and far-future

- **Adaptive practice plans** — Now buildable. `student_skill_mastery` from mig 0024 + score predictions surface "your weak areas, take this 12-question set". The blocker is no longer schema; it's content curation — we need pre-built per-skill question sets in the bank. **M engineering, L content.**
- **Live class mode** — Synchronous assignment with realtime leaderboard via Supabase Realtime. Defer until a teacher actually asks. **L architectural.**
- **Mobile native via Capacitor** — PWA already covers ~80%; native wrapper is ~2 weeks for App Store distribution. Skip unless schools require it.
- **Multi-tenant SaaS** — `organizations` root table + `organization_id` on `classes`. Required only when selling to schools-as-accounts. Cheap now (<100 classes); expensive later.
- **LTI tool provider** — Still out of scope. We're the destination, not an embedded widget.

## 6. Production-readiness — current state

Most items are done. What's listed below is either shipped (✓) or remaining.

- **6.1 Rate limit join RPCs** — ✓ Done (mig 0021 + 0023 prune). `join_attempts` table + per-uid throttle in RPC bodies; reminder dedup also in place.
- **6.2 Email verification** — Verify cloud setting is on. (No code change; DEPLOYMENT.md documents it.)
- **6.3 Audit log** — ✓ Done (mig 0022 + 0027 expanded coverage + 0028 helper cleanup). Triggers on sensitive tables.
- **6.4 Anonymous user cleanup** — ✓ Deployed. Edge function `cleanup-anon-users` + pg_cron schedule (mig 0031). Deletes anonymous accounts with no submitted activity after 90 days.
- **6.5 Backups** — Document restore procedure in DEPLOYMENT.md when moving off the free tier. Still pending.
- **6.6 Monitoring** — ✓ Sentry + PostHog wired, env-var-gated. UptimeRobot still recommended for endpoint pinging.
- **6.7 GDPR export** — ✓ Done (mig 0023). `export_my_data()` RPC live.
- **6.8 RLS regression tests** — Still not done. Promoted to tier 1 (section 3.3) because with 30+ migrations the leak surface is much wider than when this doc was written.
- **6.9 pg_cron audit** — ✓ Done (mig 0031). All scheduled jobs declared in migration; `cron.job` table is the source of truth.

## 7. Costs at three scale points

| Scale | Supabase | Vercel | Estimated monthly |
|---|---|---|---|
| 1 class, ~30 students | Free | Hobby (free) | $0 |
| 1 school, ~500 students | Pro ($25) | Pro ($20) | ~$45–60 |
| 10 schools, ~5000 students | Pro + Compute add-on ($25 + ~$60) | Pro ($20) | ~$110–180 |

Dominant cost drivers at scale: Postgres compute (the assignment-attempts table grows quickly with multi-attempt support), Storage egress on materials, and email send volume from section 4.2 (Resend free tier is 3K/mo; budget ~$20/mo at 5K students).

## 8. Suggested build order (next 2 weeks)

The four-week wiring sprint is done. The next two weeks should look like:

**Week 1 — Credibility.** Land RLS regression tests (3.3) — three days of pgTAP, biggest risk reduction available. Begin SAT scaled-scoring work (3.1): source/license a conversion table, sketch the adaptive-routing schema change, decide on per-form lookup tables vs. fitted model.

**Week 2 — Finish scaled scoring.** Implement adaptive Module 2 routing in `AssignmentRunner`, extend `assignment_attempt_questions` with a `module` column, replace the `linear-v1` predictor with the lookup-driven scaled score. Backfill recent attempts where possible. Smoke-test against published CB practice tests.

After that, prioritization depends on first-cohort signal. If schools start asking, do co-teachers/TAs (4.1) and sections (4.2). If teachers ask for richer messaging, do message attachments (4.3) + discussion read receipts (4.4). Adaptive practice plans (tier 3) become unblocked the moment per-skill question sets exist in the bank.

## 9. Architectural decisions — resolved and remaining

- **Pool per assignment (resolved).** ✓ Snapshot question pool is in place (mig 0014 + `start_assignment_attempt` RPC). Each attempt freezes its question ids; resumed attempts see the same items; teachers can reconstruct exactly what was asked. Every analytics feature now builds on this.
- **Auto + manual grading (open).** Still pending the decision in 3.2. If we add free-response, the gradebook becomes additive. Defer until SPR/essay scope is real.
- **Single- vs. multi-tenant (still cheap to defer).** No `organizations` root yet. Still cheap below ~100 classes; trip-wire that decision when a school asks to "manage their teachers".
- **Localization.** Still English-only. Wrap in i18n the moment a non-English market is committed; cheap now, painful later.
- **Realtime.** Not used today. Live class mode would require it. Easy to add per-feature; do not retrofit globally.
- **Adaptive Module 2 (open).** Needs schema decision in 3.1: extend `assignment_attempt_questions` with `module` + branch logic in the runner, or model each module as a separate attempt. Recommendation: single attempt, two snapshot batches keyed by module.

## 10. Deliberately out of scope

- **LTI integration.** The SAT prep tool is the destination, not an embedded widget in someone else's LMS. Building LTI tool provider compliance is weeks of work for a use case we don't have.
- **Course catalog.** This isn't Coursera. Teachers create classes and invite students; students don't browse for content.
- **ePortfolios.** A test-prep product doesn't accumulate the kind of artifact (essays, projects, reflections) that ePortfolios are designed for.
- **Web conferencing.** Zoom exists. We do not need to compete with it.
- **Rubrics and SpeedGrader.** Multiple-choice doesn't need them. Adding rubrics would be 80% UI for 0% answered.
- **Outcomes/standards alignment.** Our per-skill breakdown already provides the signal Canvas Outcomes provides for our domain (SAT skills). Mapping to external state standards (e.g., Common Core) would be a content authoring problem, not an engineering one.
