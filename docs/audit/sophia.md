# Sophia Rivera — Student UX Audit

## Persona

**Sophia Rivera, 16, junior, target 1520.** Drills 1–2 hrs/night, sometimes 3 on weekends. High tech comfort. Primary devices: 14" MBP at desk, iPhone for between-class review. Optimizes for seconds-to-question. Will use keyboard. Wants to compare PT2 → PT3, see her score arc, and be told "drill linear inequalities tonight" — not pick blindly.

---

## Page-by-page

| Surface | Clicks → next question | Feedback loop | Mobile parity | Top friction |
|---|---|---|---|---|
| Landing — `AreaSelector` (`viewer/src/auth/AreaSelector.tsx:154`) | 2 (Pick area card → pick question, OR Pick assignment → Start) | Medium — `SkillHeatmap` + `ScorePrediction` are present (lines 239-240) | Good — `max-w-3xl` single column, grid collapses (line 156) | Two "areas" first; her actual queue (assignments + skills) is below the fold |
| `/courses/:id` student view | **N/A — does not exist for students** (AuthGate `StudentRoutesTree` lines 214-253 has no course routes) | None | None | Students can't open a course they joined. `MyClassesPanel.tsx:29-55` renders course rows as static items with a Leave button — no link in/out |
| `/courses/:id/modules` student | Same — unreachable | — | — | Modules page is teacher-only |
| `AssignmentRunner` (`viewer/src/student/AssignmentRunner.tsx:121`) | 1 (already in runner) | Strong post-submit; nothing pre-submit | Partial — palette sidebar `hidden lg:flex` (`TestPhase.tsx:160`) | **No resume.** Migration 0020 (header comment line 9-15) explicitly killed resume — every Start inserts a NEW attempt; the open in-progress row is orphaned |
| `MockTestApp` free practice (`viewer/src/mocktest/MockTestApp.tsx:143`) | 1 — auto-resumes from `localStorage` (line 231-235) | Strong post-submit only | OK | Free mode resumes silently; assignment mode (line 220-228) explicitly doesn't (`DB is the source of truth` per comment line 12-15, but no UI surfaces it) |
| Mock test results (`TestResults.tsx`) | n/a | Strong — `ScoreHero`, `SectionBreakdownCards`, `ModuleBreakdownTable`, `SkillBreakdownCard`, collapsed `AnswerReview` (lines 46-65) | OK — single column | **Cannot revisit a past test.** No `/mock-test/history` route, no list of attempts. Once she closes the results page, results are gone unless she still has the running session in memory |
| `/practice` (Question Bank) | 3-4 (open `/practice` → set up filters → click `WeakSkillsToggle` → pick) | Medium — `WeakSkillsToggle.tsx:34` shows count, but no "next-best" prompt | Tab-based mobile via `MobileTabBar`; filter sidebar collapses | Setup ritual every session — no "resume my last filter set" |
| `WeakSkillsToggle` (`viewer/src/components/WeakSkillsToggle.tsx`) | 1 click, but only visible at `/practice` (App.tsx:1038) — not on landing | Strong — count + tooltip explains threshold | Yes | Buried inside `/practice` only; should be a CTA on landing: "Drill 7 weak skills →" |
| Score predictions (`ScorePrediction.tsx`) | n/a — passive | Single number + confidence + R&W/Math split (lines 124-150) | OK | **No trajectory.** No chart, no "+80 pts since diagnostic". Method label `linear-v1` (line 7-8) is visible to her but no historical points |
| `SkillHeatmap` (`SkillHeatmap.tsx`) | n/a — passive | Strong per-skill % with 4 mastery bands (lines 46-57); grouped by domain | Yes — 2/3-col grid | Cells aren't clickable. "I see 38% on Inferences — now I have to go to `/practice`, filter to that skill, manually." No deep-link |
| `/calendar` | — | — | — | **Unreachable for students.** `StudentRoutesTree` (AuthGate.tsx:215-251) does not include the calendar route. Due dates only live inside `AssignmentsPanel` |
| `/inbox` | 1 (must know URL or use ⌘K) | OK in-thread | OK | No nav from landing. The global `⌘K` palette in StudentShell mounts with `commands={[]}` (`StudentShell.tsx:61-62`) — empty palette, **broken keyboard nav** |

---

## Sophia-shaped probes

### 1. Resume — closed browser at 9/30, re-opens

- **Free practice mock:** Resumes. `MockTestApp.tsx:99-119,231-235` reads `mocktest.session:<userId>` from `localStorage` and remounts. ✅
- **Assignment mock:** Does NOT resume. `AssignmentRunner.tsx` header comment lines 9-15 confirms: "Every Start creates a NEW attempt row — the in-progress / resume prompt is gone." The old attempt row stays open in the DB (`started_at` is fetched at `useStudentAssignments.ts:139`) but never surfaced in `AssignmentsPanel.tsx`. Pressing Start either bounces to review (single-attempt + submitted, `AssignmentRunner.tsx:191-196`) or creates a fresh attempt (multi-attempt). Her 9 answers are gone. ❌
- **Qbank-set assignment:** Submission staging exists (`QBankAssignmentRunner.tsx:14-18`, `qbankSubmit.ts`) but only for completed submissions retrying network failures — not for mid-set progress. ❌

### 2. Next-best question — opens app, what tells her to drill linear inequalities?

Nothing. Landing surfaces `SkillHeatmap` + `ScorePrediction` (`AreaSelector.tsx:239-240`). `SkillHeatmap.tsx:182-201` renders colored cells but **cells are not clickable** — no `onClick`/`Link` wrapping. There is no prompt like "drill these tonight". The `WeakSkillsToggle` (line 34-48) exists but only renders inside `/practice` (App.tsx:1038), not on landing. Sophia has to: visit `/practice` → notice the toggle pill → click it → start picking questions.

### 3. Mock test review — took PT3 yesterday, can she review wrong answers + compare to PT2?

- **PT3 wrong answers:** Only while the results screen is still mounted (`TestResults.tsx:46-65`). After exit, **no path back.** No `/mock-test/:id/review`, no history list. `grep mock.history|allAttempts|previousAttempts → no results`.
- **Time per question:** `ModuleBreakdownTable.tsx` shows aggregate `durationSeconds`. Not per-question.
- **Compare to PT2:** Impossible. No history surface exists.

### 4. Score trajectory — chart of mock-test arc, "+80 from diagnostic"

Does not exist. `ScorePrediction.tsx:123-151` renders a single number plus a confidence pill plus a samples count. No timeline, no delta vs. first attempt, no per-test scores. `grep trajectory|chart → only SystemStats admin page mentions "no chart library"` (`admin/SystemStats.tsx:10`).

### 5. Skill mastery visualization — where are 90/80/70/red?

`SkillHeatmap.tsx:46-57` exactly that — 4 bands (emerald ≥85, indigo 65-84, amber 40-64, rose <40). Per-domain grouping at lines 70-83. Good visibility. Per-section R&W vs. Math: implicit only via the `domain` field, not split explicitly. **No drill-down from a cell to a filtered `/practice` view.**

### 6. Speed during quiz — keyboard + autosave

- **Keys 1/2/3/4 & A/B/C/D:** Yes (`TestPhase.tsx:95-111`).
- **Arrows ←→↑↓ for prev/next:** Yes (lines 112-119).
- **F to flag, Esc to cancel submit:** Yes (lines 90, 120-122).
- **Enter to advance:** **No.** Not in the switch. Sophia will press Enter after picking C and nothing happens.
- **Number→advance:** No combined "1 then auto-next". Single keystroke selects only.
- **Autosave (free mode):** Robust via `localStorage` write on every state change (`MockTestApp.tsx:241-247`).
- **Autosave (assignment mode):** Server-side via `assignment_attempts` row — but client doesn't write per-answer; the row is finalized only on submit (per migration 0020 comment). A mid-set crash loses local answers.

### 7. Mobile parity — runner on iPhone

- Question palette sidebar `hidden lg:flex` (`TestPhase.tsx:160`) → on iPhone she has **no overview of which questions she's answered**. Only arrow nav.
- Footer pads with `pb-24 lg:pb-8` (line 179) → likely accommodates `TestPhaseFooter`. OK.
- Answer choices: `px-4 py-3` (`AnswerChoices.tsx:34`) ≈ 44px tap target — meets minimum but not generous.
- `StudentBadge` floats `fixed bottom-3 right-3 z-50` (`StudentBadge.tsx:56`) → covers part of the answer area on iPhone during a test. Distracting.
- `AreaSelector` itself: `grid sm:grid-cols-2` (line 178) collapses well. Mobile OK for landing.

### 8. Distraction-free during timed test

- `TestPhaseHeader.tsx` is clean — label, timer, counter only (lines 30-50). ✅
- No `NotificationBell` on `StudentShell` (grep confirmed). ✅
- `AccountUpgradeBanner` IS mounted in `StudentShell.tsx:47` above the outlet → if Sophia is on an anonymous account, this banner shows DURING the timed test. ❌
- `StudentBadge` floats during the test (z-50, `StudentBadge.tsx:56`). Minor.

---

## Top 5 fixes (motivated-student daily impact)

1. **Resume in-progress assignment attempts.** `S/M`. The DB already has the row (`assignment_attempts.started_at` non-null, `submitted_at` null). Add a "Resume" branch in `AssignmentRunner.tsx` before line 161 instead of silently re-`start`ing. Surface "Resume — 9/30 answered" in `AssignmentsPanel`'s "To do" row using the already-fetched `my_attempt.started_at` (`useStudentAssignments.ts:139`). This is the single biggest daily frustration for any motivated drilling student.

2. **Mock-test history surface + per-test review route.** `M`. Add `/mock-test/history` and `/mock-test/:attemptId/review`. The data exists (`assignment_attempts` for assigned tests; free-practice results are currently in-memory only — push them to a new `mocktest_sessions` table or hijack `assignment_attempts` with a self-assigned row). Render a list with score, date, % per section + a "Compare" view between any two attempts. Without this, score-trajectory is impossible and motivated test-takers feel blind.

3. **Click-through from SkillHeatmap to filtered Question Bank.** `S`. In `SkillHeatmap.tsx:184` wrap the cell in a `Link` to `/practice?skill=<encoded>&weak=1`. Read the query string in App.tsx and pre-seed `setActiveFilters`. Turns "look, 38%" into "click, drilling now" — one click instead of seven.

4. **Score trajectory chart on landing.** `M`. Replace the static `ScorePrediction.tsx` with a sparkline of (date, predicted_total) over each submitted assignment + a delta-vs-first ("+ 80 since Apr 12"). Sophia opens the app and immediately feels progress; she'll log in more often. RPC change: extend `predict_my_sat_score` to also return the series, or add `my_predicted_score_history`.

5. **Enter advances + global ⌘K commands for students.** `S`. Add `case "Enter":` to `TestPhase.tsx:95` switch (advance if answered, else select-first-then-stay). Populate `StudentShell.tsx:61-62` `commands={[]}` with `useLmsCommands()` so ⌘K → "Resume PT3", "Drill weak skills", "Open inbox" all work. Fastest payoff for keyboard-fluent users.

---

## Is the SAT-pedagogy moat visible?

**Partially — the moat is real in the data layer but barely surfaces in the student's daily flow.** `SkillHeatmap` and `ScorePrediction` both sit on the landing (`AreaSelector.tsx:239-240`), but neither converts. The heatmap is decorative because cells don't deep-link. The prediction is a single number, not a story — no arc, no "you've moved from 1340 to 1420", no diagnostic-vs-now framing. `WeakSkillsToggle` is the strongest moat artifact and it's hidden inside `/practice`, gated by the student already deciding to practice. No surface tells Sophia "tonight, drill these three skills"; no surface lets her relive PT2 vs PT3. The pedagogy intelligence exists in `my_skill_mastery`, `predict_my_sat_score`, and the weak-skills RPCs (migration 0024) — but the UX is still "Question Bank or Mock Test, pick one" with the moat as garnish below. Until the heatmap is clickable, the prediction is a trajectory, and assignment-runner resumes, Sophia is using an LMS that happens to know SAT — not one that pushes her there.
