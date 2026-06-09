# SAT Skill Domains — architecture

How per-question SAT **skill domains** flow from the database to the six
surfaces that visualise class/student mastery. Read this before touching any of
the skill/heatmap/comparison code.

## The data

- **`test_questions.domain`** (text, nullable) — each question's official College
  Board domain. The column existed (empty) since the full-test bundle; it is now
  populated for all **456 seeded questions** across the 6 DSAT forms.
- **8 canonical domains** (section-exclusive — a domain belongs to exactly one
  section):
  - Reading & Writing: `Information and Ideas`, `Craft and Structure`,
    `Expression of Ideas`, `Standard English Conventions`
  - Math: `Algebra`, `Advanced Math`, `Problem-Solving and Data Analysis`,
    `Geometry and Trigonometry`
- Always store/compare these **exact strings**. A new seeded test must be
  classified or it silently falls back to the by-question view (heatmap) / shows
  no skill rollup (profiles).
- Classification method (one-off, per form): subagents tag each question from its
  stem, then a rule-based pass corrects the formulaic R&W stems (transitions →
  Expression, cross-text & "main purpose" → Craft). Math is blueprint-accurate
  from the LLM pass. Verify the per-section distribution against the official
  blueprint after classifying.

## The shared module — `viewer/src/fulltest/skills.ts`

Single source of truth so all six surfaces stay visually + semantically in
lockstep. Exports:

- `BANDS` / `band(pct)` — the 3-band performance palette (emerald ≥70, amber
  ≥40, rose below). Text colour per band chosen for legibility. **Matches the
  Review sidebar bars.** Never hardcode these colours elsewhere.
- `LEGEND_GRADIENT` — rose → amber → emerald, for legends.
- `DOMAIN_ORDER`, `SECTION_ORDER`, `orderDomains()`, `orderSections()` — canonical
  display ordering (unknown values sorted last).
- `sectionLabel(section)` — "reading-writing" → "Reading & Writing", etc.
- `sectionForDomain(domain)` — reverse lookup, for surfaces whose data has a
  domain but no section (the cross-test student report).
- `pctOf(correct, total)` — rounded %, `null` on zero (no divide-by-zero).
- `isChoiceLetter(value)` — distinguishes an MCQ letter (A–D) from a typed grid
  value, so "most chose X" hints only show for MCQ.
- `groupDomainRows(rows)` / `weakestDomain(groups)` (+ `Skill*` types) — bucket the
  RPCs' flat per-domain rows into canonical section→domain order with %s, and pick
  the single weakest. Shared by the course + cohort skill surfaces.

## The six surfaces

| Surface | File | Scope | Data source |
|---|---|---|---|
| Teacher **Review heatmap** (By-question / By-skill toggle) | `fulltest/ReviewHeatmap.tsx` | one test, one class | `get_test_answer_breakdown` (0112) via `TestReviewPage` `qStat`, joined to `domain` from `fetchTestContent` |
| Teacher **cross-class comparison** | `fulltest/ClassComparison.tsx` | one test, all classes | `list_test_review_courses` + `get_test_answer_breakdown` per class (parallel) |
| **Student skill profile** (released result) | `fulltest/ResultView.tsx` → `SkillProfileCard` | one student, one run | `get_test_result` (0121 adds `domain`) |
| Teacher **per-student breakdown** (student profile) | `teacher/StudentTestReportPanel.tsx` | one student, across tests | `student_test_report` (0088; latest-attempt dedup 0122) |
| Teacher **Class skills** tab (course) | `teacher/ClassSkillsView.tsx` | one class, across tests | `course_skill_mastery` (0123) |
| Admin **Skills across all students** (Stats) | `admin/SystemSkillsCard.tsx` | whole cohort, across tests | `system_skill_mastery` (0128) |

All six import `skills.ts` and render the same per-section domain bars +
band colours. The student result also shows a per-question domain chip; the
teacher Review nav strip shows the current question's domain pill.

## RLS / why the RPCs exist

`test_questions` is **staff-only** (0048 RLS `is_staff`) — students cannot
`SELECT` it, so `domain` can never be read directly client-side by a student. It
reaches the student only through SECURITY DEFINER RPCs:

- **`get_test_result`** (0121) embeds each question's `domain` in the released
  result payload (gated on `results_released_at` for students; staff bypass).
- **`student_test_report`** (0088) is teacher-only (`is_staff`) and returns a
  per-domain rollup; **0122** changed that rollup to count only the *latest
  submitted run per test* (`DISTINCT ON (test_id) … ORDER BY submitted_at DESC`)
  so retakes of the same form aren't double-counted. Its `runs` array still spans
  all attempts (the score-trajectory sparkline).

The two teacher heatmap/comparison surfaces read `domain` directly because the
caller is staff (allowed by RLS).

## Extending: classifying a new test

1. Populate `test_questions.domain` for the new form's questions (8 canonical
   strings; classify from stems, correct R&W by rule, check the blueprint).
2. Nothing else to change — all six surfaces light up automatically (heatmap
   defaults to By-skill once `domain` is present; profiles show the rollup).
3. If you change the band thresholds, domain set, or section labels, change them
   **only** in `skills.ts`.

## Gotchas

- Verifying any *student* full-test surface in a browser needs course enrolment
  + a `module_items` link to `/test/<slug>` (the runner redirects unenrolled
  students home). The API path (`get_test_result`) is access-free. See
  `viewer/scripts/clickthrough-practice-test.mjs` for the setup pattern.
- When extending a `CREATE OR REPLACE FUNCTION`, diff against the **latest** prior
  definition (e.g. `get_test_result` → 0080, `student_test_report` → 0088), not
  an earlier one.
- Cross-run aggregations must decide latest-vs-all attempts. The per-run student
  profile has no such issue; `student_test_report` uses latest-per-test (0122).
