# Test Mode Layout — Bluebook reference

The static-export test mode (`?mode=test`) targets the **official
College Board Bluebook** layout. The reference screenshot lives at
[`reference/bluebook-test-layout.png`](./reference/bluebook-test-layout.png).
This doc is the canonical spec — when in doubt, defer to the screenshot.

> **Status:** spec, not yet implemented. See "Implementation" below for
> the current gap.

---

## 1. Frame

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Section 1, Module 1: Reading and Writing  │   31:51   │  ✎  More       │ ← top bar
│ Directions ▾                              │   Hide    │  Highlights      │
├──────────────────────────────────────────────────────────────────────────┤
│              THIS IS A PRACTICE TEST                                     │ ← sub-banner
├──────────────────────────────────┬───────────────────────────────────────┤
│                                  │                                       │
│  STIMULUS                        │  [1] 🔖 Mark for Review   ABC         │
│  Although critics believed       │                                       │
│  that customers would never      │  Which choice completes the text…?    │
│  agree to pay to pick their      │                                       │
│  own produce on farms…           │  ┌─────────────────────────────────┐  │
│                                  │  │ (A)  enhance                ⓐ  │  │
│                                  │  └─────────────────────────────────┘  │
│                                  │  ┌─────────────────────────────────┐  │
│                                  │  │ (B)  hinder                 ⓑ  │  │
│                                  │  └─────────────────────────────────┘  │
│                                  │  ┌─────────────────────────────────┐  │
│                                  │  │ (C)  misrepresent           ⓒ  │  │
│                                  │  └─────────────────────────────────┘  │
│                                  │  ┌─────────────────────────────────┐  │
│                                  │  │ (D)  aggravate              ⓓ  │  │
│                                  │  └─────────────────────────────────┘  │
│                                  │                                       │
├──────────────────────────────────┴───────────────────────────────────────┤
│ Cheng-Yuan Yao                     Question 1 of 27 ▴             [Next] │ ← bottom bar
└──────────────────────────────────────────────────────────────────────────┘
                                    ▲ draggable divider
```

## 2. Top bar (sticky)

| Slot | Content | Behaviour |
|---|---|---|
| Left | `Section 1, Module 1: <skill-or-set-name>` + `Directions ▾` | Directions opens a modal/popover with general instructions. |
| Center | Live timer `MM:SS` + `Hide` toggle | Counts down (or up — we'll start with count-up to start). `Hide` collapses the timer to a small icon; click to re-reveal. |
| Right | `Highlights & Notes` icon · `More ⋮` menu | Highlights is a per-question text-highlight tool (later). `More` holds Reset / Sign out / etc. |

### Sub-banner (below top bar)
A blue (`#1B2956`-ish navy) strip across the full width with white text reading **`THIS IS A PRACTICE TEST`**. Always shown; not interactive.

## 3. Two-pane content area

- **Layout**: CSS Grid, two columns. Default split 50/50. Centered divider is draggable; persisted to localStorage.
- **Left pane**: the stimulus / passage text. Scrolls independently if long.
- **Right pane**: question number + Mark-for-Review + ABC cross-out toggle (header) → stem text → choice cards.

### Question header (right pane top)
```
[ 1 ]  🔖 Mark for Review                                      [ ABC ]
```
- The `[1]` is a small dark square with white number.
- "Mark for Review" is a toggle: bookmark icon flips filled/outline; flagged questions get a corner mark in the bottom-bar question grid.
- `[ABC]` enters **cross-out mode**. While active, clicking a choice does NOT select it — it marks it crossed out (strikethrough + greyed). Useful for process-of-elimination. Click `[ABC]` again to exit.

### Choices
Full-width rectangular cards. Each has:
- A circled letter on the **left** (the answer pick): `Ⓐ enhance`.
- A circled letter on the **right** (the cross-out indicator). Clicking the right letter (or any cross-out region) toggles strikethrough on this choice. In cross-out mode the whole row clicks act on the right side.
- Click anywhere on the card body (left/middle) to **select** as the answer. Selected state: filled blue background, white text, plus a checkmark.
- Crossed-out state: row gets diagonal strikethrough across choice text + greyed letter; cannot be selected without un-crossing.

### SPR (student-produced-response)
For math SPR items, the right pane shows the input text field (and the bubble grid as a visual reference) instead of A–D choices. Spec for SPR will be added when we hit the first math test set; for now optimise R&W (the source-of-truth screenshot is R&W).

## 4. Bottom bar (sticky)

| Slot | Content | Behaviour |
|---|---|---|
| Left | Student name | Read from Supabase session if signed in; else "Guest". |
| Center | `Question N of M ▴` | Click opens a popover with a grid of question numbers; numbers show: unanswered (outline), answered (filled), marked-for-review (corner flag). Click any to jump. |
| Right | `Next` (or `Back` ◀ `Next`) | Filled dark button. On the last question, becomes `Submit`. |

## 5. Mode behaviour

### Test mode (`?mode=test`)
- **One question on screen at a time** — the rest of the cards are hidden via CSS (`.card { display: none } .card.is-current { display: grid; ... }`).
- The test-runner increments `currentIndex` on Next; persists to draft.
- On submit: collect all answers, grade, show results banner (existing behaviour) but in the Bluebook frame.

### Study mode (default)
- Keep the **linear scroll** of all cards (current behaviour) — students reading through.
- **Use the full horizontal space**: widen `.sheet` to a comfortable two-column max (1100–1280px) instead of the current narrow single column.
- Per-card layout stays one column (stimulus → stem → choices stacked), but card itself widens.
- Bluebook chrome is **not** shown — keep the current cover + strip.

The same `_questions.html` file supports both. CSS gates everything by
`body[data-mode]`.

## 6. Print mode

All Bluebook chrome (top bar, sub-banner, bottom bar, cross-out controls,
mark-for-review) is hidden under `@media print`. Print falls back to the
current per-card stacked layout regardless of mode.

## 7. Per-question submit + timing

### 7.1 What "Next" actually does

Clicking **Next** in the bottom bar is the per-question commit:

1. Capture the time since the question first became current → add to a
   per-qid `timeSpent` accumulator (questions can be revisited; spent time
   accumulates).
2. Capture the current `answers[qid]` and `crossOut[qid]` and `marked[qid]`.
3. Persist (`saveDraft` → adapter). With the Supabase adapter, the per-answer
   row is upserted live so server-side analytics can read it without
   waiting for full submission.
4. Advance `currentIndex`. If we're on the last question, the **Next** label
   has already swapped to **Submit** — that final click runs the existing
   grading flow.

### 7.2 Per-question time accounting

State extension to the draft:

```js
draft = {
  answers, marked, crossOut, currentIndex, startedAt,
  // new:
  timeSpent:  { [qid]: ms },         // total ms spent on this question
  visits:     { [qid]: count },      // how many times the user viewed it
  firstShownAt: { [qid]: timestamp } // last question-shown timestamp; consumed
                                     // when leaving the question
}
```

- Entering a question → `firstShownAt[qid] = Date.now()`; `visits[qid]++`.
- Leaving a question (Next, Back, jump, submit) →
  `timeSpent[qid] += Date.now() - firstShownAt[qid]`; clear `firstShownAt[qid]`.
- Page unload / refresh while a question is on screen → on next mount, the
  partial elapsed is discarded (we can't recover it).

The per-question rows written to `test_answers` (DB) gain:

```sql
alter table test_answers add column time_spent_ms integer;   -- TOTAL, not just to first answer
alter table test_answers add column revisit_count integer;
```

(Add a migration for this when implementing.)

## 8. Results screen — pacing chart

After submit, the existing banner ("8 / 10") is replaced by a full results
panel inside the Bluebook frame. The hero element is a **per-question
pacing chart**.

### 8.1 Layout

```
┌────────────────────────────────────────────────────────────────────┐
│  Cross-text connections — Set 1                          Results   │
│                                                                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐             │
│  │ Score    │ │ Total    │ │ Average  │ │ Pacing   │             │
│  │ 8 / 10   │ │ 14:32    │ │ 1:27 /Q  │ │ on pace  │             │
│  │ 80%      │ │          │ │          │ │          │             │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘             │
│                                                                    │
│  ── Time per question ─────────────────────────────────────────── │
│                                                                    │
│  Q1  ▮▮▮▮▮▮     0:42  ✓                                            │
│  Q2  ▮▮▮▮▮▮▮▮▮▮▮▮▮▮  1:38  ✓                                       │
│  Q3  ▮▮▮▮       0:25  ✗  chose C · correct A                       │
│  Q4  ▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮  3:12  ✓   slowest                │
│  Q5  ▮▮▮▮▮▮     0:48  ✓                                            │
│  …                                                                 │
│                                                                    │
│  ────────────── target pace (1:30 / Q) ──────────────────────────  │
│                                                                    │
│  [Review missed (2)]   [Restart]   [Back to bank]                  │
└────────────────────────────────────────────────────────────────────┘
```

### 8.2 Bar chart spec

- One row per question.
- **Bar width** is proportional to `timeSpent[qid] / maxTimeSpent` (so the
  slowest question fills the row). Min visual width 2% so even a 5-second
  question has a visible bar.
- **Bar colour**: subtle accent (`#1B2956` at ~70% opacity). Outlier (slowest
  third) gets a deeper saturation. Don't tie colour to correctness — that's
  the tick/cross on the right; double-coding is noisy.
- **Right of bar**: `MM:SS` in monospace + `✓` / `✗` indicator. For wrong
  answers, append `chose X · correct Y` in small text.
- Hover/tap row: tooltip with `Visited 3×` if revisit_count > 1, plus
  marked-for-review flag if applicable.
- A horizontal dashed line marks the **target pace** at the median or 1:30/Q
  default — labelled "target pace".
- Animate bar widths from 0 → final on mount (200ms ease-out). Reduced-motion
  users skip the animation.

### 8.3 Top summary cards

Four cards, 4-column grid on desktop, 2x2 on mobile.

| Card | Source |
|---|---|
| Score | `score / total` + percentage |
| Total time | `secondsTaken` formatted `MM:SS` |
| Average | `totalSeconds / total` formatted `MM:SS /Q` |
| Pacing | qualitative label based on average vs target: "well under pace", "on pace", "slightly slow", "running over" |

### 8.4 Action buttons

- **Review missed (N)** — re-enters test mode but `currentIndex` cycles only through wrong-answer questions; show the user's answer + the correct answer + the rationale inline (loaded from `_key.html`).
- **Restart** — confirmation modal, clears the draft, returns to question 1.
- **Back to bank** — link to `/exports/index.html` or back to the static index.

### 8.5 Design polish

- Monospace numerals (`var(--t-mono)`).
- Subtle dividers (`var(--rule)`) between summary cards and the chart.
- The slowest-question bar gets a small "slowest" label inline.
- Print: drop the bars, render a clean table (`Q1  0:42  ✓` rows).

## 9. Implementation status

- ✅ Mode toggle already in place (`body[data-mode]`).
- ✅ Per-card `data-correct`, `data-qid`, `data-type` for answer keys.
- ✅ Persistence interface (`saveDraft` / `saveAttempt` etc.).
- ✅ Two-pane Bluebook frame.
- ✅ One-question-at-a-time navigation.
- ✅ Mark-for-Review per question.
- ✅ Cross-out toggle per choice.
- ✅ Bottom-bar question-grid popover.
- ✅ Per-question submit on Next + timeSpent accumulation.
- ✅ Pacing-chart results screen.
- ✅ DB migration adding `time_spent_ms` + `revisit_count` to `test_answers` (0043).
- ✅ Highlights & Notes (§10 below; 0044).
- ⏳ Directions modal — defer until v2 (small "About this set" copy will suffice initially).

## 10. Highlights & Notes

The Bluebook reference puts a **Highlights & Notes** affordance in the top
bar. We implement it as two cooperating surfaces — a floating mini-toolbar
that paints highlights onto the stimulus / stem, and a right-anchored side
drawer that hosts a per-question note. Storage lives inside the same draft
that `saveDraft` already round-trips through `Persistence`; on submit the
final state is mirrored to top-level columns on `test_attempts`
(`highlights jsonb`, `notes jsonb` — see migration `0044_highlights_notes.sql`).

### 10.1 Top-bar layout

The top-bar right slot lays out four affordances, left → right:

```
[ 📐 Calculator ]  [ 🟡 🟢 🩷 🟦  U̲  ⌫ ]  [ 📝 Notes ]  [ ⋮ More ]
       ▲                  ▲                      ▲
  Desmos popup    inline highlight bar      drawer toggle
  (Change 4)         (Change 1)              (Change 2)
```

The pre-v4 floating selection mini-toolbar is gone — the highlight bar is
now always visible inline in the top bar.

### 10.2 Notes pill

The pill renamed from `Highlights & Notes` to `Notes`:

```
📝 Notes · 1
```

- Badge is shown **only when the current question has a note** — the
  highlight count is intentionally not duplicated here because the inline
  highlight bar's active-color ring already conveys highlight state.
- A blue dot in the upper-right corner doubles as a low-noise indicator
  when a note exists.
- `aria-pressed` reflects drawer open/closed; clicking the pill toggles the
  drawer.
- aria-label is `Notes`.

### 10.3 Inline highlight bar (top bar)

Always visible. Acts on the **current text selection** inside
`.bluebook-pane-left` (stimulus) or `.bluebook-pane-right .stem`. Six
controls:

| Button | Effect |
|---|---|
| 🟡 Yellow | Wrap selection in `<mark class="bb-hl bb-hl--yellow" data-hid="…">` |
| 🟢 Green  | Same, green palette |
| 🩷 Pink   | Same, pink palette |
| 🟦 Blue   | Same, blue palette |
| `U̲` Underline | Modifier: toggles state; next color click lays down an underline-only mark with that color's accent |
| `⌫` Remove | Enabled only when the selection sits entirely inside an existing `<mark.bb-hl>` — click clears that highlight |

- Clicking a color swatch with **no active text selection** is a no-op and
  triggers a small "Select text first to highlight" hint via an
  `aria-live="polite"` toast (auto-dismisses after ~1.4s).
- When the live selection is inside an existing highlight, the matching
  color swatch shows an active ring; clicking another color **repaints**
  that mark in place (preserves the `data-hid`).
- Selection state is tracked via a `selectionchange` + pointer/keyup
  listener at the frame root; the bar's enabled/pressed state stays in
  sync without any positioning logic (there is nothing to position — the
  bar lives in the top bar).
- Highlights are stored as **character offsets** relative to the pane's
  text content (`Range` API + a text-node tree walker), making them robust
  across re-renders of the same pane.
- Each record gets a stable `hid` so the `⌫` Remove path can target the
  exact mark.

### 10.4 Side drawer (per-question notes)

Triggered by the `Notes` top-bar pill. Right-anchored, 360px wide, slides
in over the right pane (on screens <720px it goes full-screen).

```
┌────────────────────────────────────────┐
│ Notes — Question 3              ✕     │
├────────────────────────────────────────┤
│ ┌────────────────────────────────────┐ │
│ │ [textarea]                          │ │
│ │                                     │ │
│ │                                     │ │
│ └────────────────────────────────────┘ │
│                            123 / 8000  │
│                                        │
├────────────────────────────────────────┤
│ [ Showing: this question only      ▾ ] │
└────────────────────────────────────────┘
```

- Single `<textarea>` (no rich text in v1). Auto-saves on `input` debounced
  400ms. Capacity capped at **8000 chars**; over-typed input is truncated.
- Footer pill flips between `Showing: this question only` and
  `Showing: all notes in this set`. The "all" view renders a list of
  `<details>` blocks (one per qid with a note), each carrying a `Go →`
  jump-link that switches `currentIndex` and flips the scope back to "this".
- Drawer header always shows the **current** question index (live updates
  on Next/Back/grid-jump).

### 10.5 Draft shape extension

```js
draft = {
  // existing fields …
  answers, marked, crossOut, currentIndex, startedAt,
  timeSpent, visits, firstShownAt,
  // new (v3):
  highlights: { [qid]: [{ hid, color, pane, start, end, text, underline? }] },
  notes:      { [qid]: "free text (≤ 8000 chars)" },
};
```

- `pane`: `'stimulus'` or `'stem'` — selects which anchor to re-paint into.
- `start` / `end`: character offsets within the pane's `innerText`.
- `text`: captured selection text (for archival / debugging; not used to
  re-locate the range).
- `LocalStorageAdapter` round-trips this entire shape transparently through
  `JSON.stringify`.
- `SupabaseAdapter` stores the same shape inside `test_attempts.draft_meta`
  (JSONB, added by 0043). The columns added by 0044 only carry the
  **submitted** snapshot.

### 10.6 Persistence on submit

- `submitAttempt` includes `highlights` and `notes` in the attempt payload.
- `LocalStorageAdapter.saveAttempt` writes the whole attempt JSON, including
  annotations — they survive draft clearing automatically.
- `SupabaseAdapter.saveAttempt` writes them to the new top-level
  `highlights` + `notes` columns on `test_attempts`. If the columns are
  missing (pre-0044), the write retries without them and logs a warning.

### 10.7 Print + study mode

- Inline highlight bar, calculator button, calculator window, side drawer
  and the Notes pill are hidden under `@media print`.
- Highlights themselves render at ~15% opacity in print (they're part of
  the student's annotation context).
- Study mode does NOT show the Bluebook chrome and therefore neither the
  drawer nor the pill — but stored highlights remain as inline `<mark>`s on
  the per-card stimulus / stem if the student switches between modes. This
  is intentional (study mode is for review; seeing your own highlights is
  helpful).

### 10.8 Migration 0044

```sql
ALTER TABLE public.test_attempts
  ADD COLUMN IF NOT EXISTS highlights jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS notes      jsonb NOT NULL DEFAULT '{}'::jsonb;
```

Idempotent. Apply with `supabase db push` (or `psql -f` for ad-hoc
environments).

## 11. Desmos graphing calculator

A `📐 Calculator` button sits in the top bar's right slot, immediately left
of the inline highlight bar. Clicking it opens a draggable, resizable
floating window hosting the official Desmos Graphing Calculator (v1.10
embed).

### 11.1 Window chrome

```
┌────────────────────────────────────────┐
│ Graphing Calculator             ×     │  ← drag handle
├────────────────────────────────────────┤
│                                        │
│   <Desmos GraphingCalculator>          │
│                                        │
│                                        │
└────────────────────────────────────────┘
       ↘ resize grip (CSS `resize: both`)
```

- Default size: **720 × 480px**, centered in the viewport.
- The `×` close button on the right of the header closes the window. The
  Calculator top-bar button toggles open/close.
- The window is **modeless** — clicking outside does NOT dismiss it.
- The header is the only drag handle (`cursor: grab` / `grabbing` while
  dragging). The body must not capture pointer events away from Desmos.
- Resizing uses the native CSS `resize: both` grip on the bottom-right
  corner.
- z-index is **100** so the popup sits above all bluebook chrome
  (subbanner, headers).

### 11.2 Lazy-loading

- The Desmos script (≈1MB) is **not** fetched at frame mount. The first
  click of the Calculator button injects
  `https://www.desmos.com/api/v1.10/calculator.js?apiKey=…` once.
- The public Desmos `apiKey` is embedded directly in the runner — Desmos
  supports public API key embedding for educational use.
- On script-load failure (offline / blocked), the window body shows a
  quiet inline error and the button reverts to the closed state.

### 11.3 Persistence

- **Position + size** — saved to `localStorage` under
  `sat-qb-desmos-position` on drag end and on close. Re-opens at the last
  recorded position (clamped to the current viewport).
- **Calculator state** (expressions, graph window, etc.) — saved to
  `sessionStorage` under `sat-qb-desmos-state` on close via
  `calculator.getState()`. Restored on re-open via `calculator.setState()`.
  Survives drawer toggles + question navigation within the session; does
  NOT survive a full page reload (sessionStorage is per-tab).

### 11.4 Mobile + print

- Below 720px viewport width, the window becomes a **full-screen overlay**
  (no drag — irrelevant on touch).
- `@media print` hides the window and the button (`display: none`).

### 11.5 Lifecycle hooks

The popup is forcibly closed when:

- The user clicks the Calculator button again (toggle).
- The user clicks the window's `×`.
- The user submits the test (`submitAttempt()` calls `closeDesmosCalculator()`
  before rendering the results panel).
- The user exits to study mode (`unmountBluebookFrame()` closes the popup).

---

When implementing, **the reference screenshot is the visual contract** — pixel-match
the spacing, the navy sub-banner, the circled letter ovals, the question
counter in the bottom centre, the Next button's pill shape. Pre-existing
styles can be reused but the new layout primitives (top bar, sub-banner,
two-pane grid, bottom bar, choice card with dual circled letters) are net
new.
