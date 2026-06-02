# Design Audit — SAT Question Bank Viewer

**App:** `http://localhost:5173/` (question `02489d55`, difficulty filter "Easy")
**Reviewed:** May 27, 2026
**Lenses:** Design critique · Accessibility (WCAG 2.1 AA) · UX copy
**Method:** Live inspection via browser automation — DOM, accessibility tree, computed colors/font sizes, and screen captures of the main view, answer/rationale states, the keyboard-shortcuts modal, the command palette, and the empty-search state.

Severity key: 🔴 Critical · 🟡 Moderate · 🟢 Minor

---

## Overall impression

This is a polished, information-dense, keyboard-first study tool. The three-pane layout (filters → question list → question detail) is conventional and immediately legible, the typography hierarchy is clean, and the power-user features — a `⌘K` command palette, J/K navigation, single-key actions, a full shortcuts reference, and deep-linkable URLs — are genuinely well above average for an internal tool. The biggest opportunities are a stale-state bug when filters return nothing, a handful of contrast values that fall just under the AA threshold, and a modal that isn't exposed to assistive technology.

---

## 1. Design critique

### Usability

| Finding | Severity | Recommendation |
|---|---|---|
| When a filter or search returns 0 results, the list correctly shows "No questions match…" but the **detail pane keeps rendering a stale question** (e.g. #10). The header reads "0 questions" while a full question is still on screen — contradictory. | 🔴 Critical | Clear the detail pane on an empty result set and show a matching empty state ("No question selected" / "Adjust your filters to see questions"). |
| Toolbar actions (bookmark, mark done, add to print set, add note, copy link, random) are **icon-only**. They carry tooltips with shortcut hints, but meaning relies on hover or the shortcuts modal. | 🟡 Moderate | Keep the icons, but consider a first-run tooltip or a brief label on hover-delay; ensure the print-set and note icons in particular are distinguishable at a glance. |
| The **"Original" / "Set #1"** tabs above the filters don't explain what a "Set" is. | 🟡 Moderate | Rename or add a tooltip ("Your saved/print question sets"). See UX copy section. |
| Strong keyboard model (`⌘K`, J/K, single-key toggles, `?` help) — but these are only discoverable via the small footer hint and the modal. | 🟢 Minor | Surface the `⌘K` palette with a subtle persistent affordance (e.g. a faint "⌘K" pill in the search bar). |

### Visual hierarchy

- **What draws the eye first:** the large bold question number (`#1`) and the question text — correct for a study/browse tool.
- **Reading flow:** left-to-right, coarse-to-fine (filter → pick → read) is natural and well supported.
- **Emphasis:** answer choices are well-spaced cards with clear letter avatars; the selected/correct answer highlights with a green fill and check. Whitespace in the detail pane is generous and calm.
- **Watch-out:** **green carries two meanings** — the "Easy" difficulty badge *and* the correct-answer highlight are both green. A user could momentarily read the green answer state as a difficulty cue. Consider a distinct color (or an explicit "Correct" label/icon) for the answer state.

### Consistency

| Element | Issue | Recommendation |
|---|---|---|
| Headings | Two `<h1>` elements exist on the page (app title and question). | Use one `<h1>` and demote the other to `<h2>`/`<h3>` for a clean outline. |
| Difficulty accent | Green "Easy" is used consistently in list and breadcrumb — good. | No change; just disambiguate from the answer-correct green above. |
| List items | With the current data, many rows repeat the same truncated stem ("Which expression is equivalent to ?"), making rows hard to tell apart. | Likely seed data (see Content note), but ensure the stem preview shows enough distinguishing text and the math renders in the list as it does in the detail pane. |

### What works well

- Keyboard-first interaction model with a real command palette (Recent / Questions / Commands sections, arrow-key nav).
- Comprehensive, well-organized keyboard-shortcuts reference.
- Deep-linkable state — the URL encodes question, difficulty, and search, so views are shareable/bookmarkable.
- Live filter counts (per section, difficulty, and domain) update instantly.
- Clean, restrained visual design with strong body-text contrast and good spacing.

### Priority recommendations

1. **Fix the empty-result stale detail pane** (🔴) — it's the one place the UI actively contradicts itself.
2. **Disambiguate the "correct answer" green from the "Easy" green** (🟡) — small change, removes a real source of momentary confusion.
3. **Clarify "Original / Set #1"** (🟡) — a label or tooltip closes a comprehension gap for new users.

---

## 2. Accessibility audit (WCAG 2.1 AA)

**Issues found:** 6 · **Critical:** 0 · **Major:** 3 · **Minor:** 3
Measurements below are computed values pulled directly from the running page.

### Perceivable

| # | Issue | WCAG | Severity | Recommendation |
|---|---|---|---|---|
| 1 | Question count subtitle ("1,240 questions" / "0 questions") is `#80828A` on white at 12px → **3.83:1** | 1.4.3 Contrast | 🟡 Major | Darken to ≥ `#6A6C75` (≈4.5:1) or increase size/weight. |
| 2 | Empty-state text "No questions match the current filters." is `#80828A` at 13px → **3.83:1** | 1.4.3 Contrast | 🟡 Major | Same darker token; this text matters when results are empty. |
| 3 | Search **placeholder** text `#9B9DA5` → **2.71:1** | 1.4.3 Contrast | 🟢 Minor | Darken placeholder to ≥4.5:1, or keep a persistent visible label. |

### Operable

| # | Issue | WCAG | Severity | Recommendation |
|---|---|---|---|---|
| 4 | The keyboard-shortcuts modal does **not move focus into the dialog** on open (focus stays on the trigger button) and has **no focus trap**. | 2.4.3 Focus Order | 🟡 Major | On open, move focus to the dialog (or its close control) and trap focus until dismissed; return focus to the trigger on close. |

*Positive:* `Esc` closes the modal; the search field shows a clear visible focus ring (blue 2px). Full tab-order through the list + detail and 200% zoom reflow still need a manual pass (see below).

### Understandable

| # | Issue | WCAG | Severity | Recommendation |
|---|---|---|---|---|
| 5 | Filter checkboxes surface a generic accessible name (the accessibility tree reports **"on"**) rather than "Math", "Reading and Writing", "Easy", etc. A visual label is present, so this reads as a label-association gap. | 3.3.2 Labels / 4.1.2 Name, Role, Value | 🟡 Major | Ensure each checkbox is programmatically tied to its visible text via `<label for>`/wrapping `<label>` or `aria-labelledby`, and include the count in or alongside the name. Verify with VoiceOver/NVDA. |

### Robust

| # | Issue | WCAG | Severity | Recommendation |
|---|---|---|---|---|
| 6 | The shortcuts modal is built from plain `<div>`s with **no `role="dialog"`, `aria-modal`, or accessible name**. | 4.1.2 Name, Role, Value | 🟡 Major | Add `role="dialog"` (or use `<dialog>`), `aria-modal="true"`, and label it via `aria-labelledby` pointing at the "Keyboard shortcuts" heading. |

### Color contrast check

| Element | Foreground | Background | Ratio | Required | Pass? |
|---|---|---|---|---|---|
| Body / question text | `#1D1D20` | white | 16.8:1 | 4.5:1 | ✅ |
| Filter labels (Math, etc.) | `#3E3F47` | `#FAFAFB` | 10.0:1 | 4.5:1 | ✅ |
| Breadcrumb (active) | `#65676F` | white | 5.64:1 | 4.5:1 | ✅ |
| `kbd` shortcut keys | `#3E3F47` | `#F3F3F5` | 9.44:1 | 4.5:1 | ✅ |
| Question count subtitle | `#80828A` | white | 3.83:1 | 4.5:1 | ❌ |
| Empty-state message | `#80828A` | white | 3.83:1 | 4.5:1 | ❌ |
| Search placeholder | `#9B9DA5` | white | 2.71:1 | 4.5:1 | ❌ |

### Structure / landmarks

`lang="en"` is set (good). The page uses `<main>` and `<aside>`, but there is **no `<nav>` landmark** for the filter/list region and there are **two `<h1>`s**. Adding a labelled `nav` (or `role="region"` with `aria-label`) and a single top-level heading would improve screen-reader navigation. (1.3.1)

### Manual follow-up recommended

My audit catches the structural and contrast issues; please also verify with real assistive tech: full keyboard tab order through the list and detail, how answer-correctness is *announced* to a screen reader, focus return after closing the modal/palette, and layout reflow at 200% zoom.

---

## 3. UX copy review

### What's working
Terminology is consistent, labels are concise, and shortcut hints (e.g. "Hide answer · A", footer "J/K navigate · A answer · R rationale · ? help") teach the keyboard model in context. The empty states for the domain list ("No domains match the current filters.") and result list are present and plainly worded.

### Recommendations

| Element | Current | Issue | Suggested |
|---|---|---|---|
| Empty result state | "No questions match the current filters." | Clear, but offers **no way out** — dead end. | Add a recovery action: "No questions match your filters. **Reset filters** to see all questions." (link/button) — follows the *what + why + how-to-recover* pattern. |
| Question-set tabs | "Original" / "Set #1" | "Set" is unexplained; unclear these are user collections. | Tooltip or relabel, e.g. "All questions" / "Print set 1", or a heading "Question sets" with hover help. |
| Toolbar icons | Tooltips "Bookmark (B)", "Mark done (D)", "Add to print set (S)", "Add note (N)", "Copy link (C)", "Random question (G)" | Good — they pair action + shortcut. | Keep. Just confirm tooltips are reachable on keyboard focus, not hover only. |
| Count subtitle | "1,240 questions" / "0 questions" | Clear and correct. | No change (just fix its contrast — see A11y #1). |

---

## Content / data note (not a design issue)

While testing the answer/rationale states, the question "Which expression is equivalent to 19x² − 7?" marks **A (19x² − 133)** as correct, and the rationale text ("…can be rewritten as 19x² − 197, which is equivalent to 19x² − 133") is mathematically inconsistent. This looks like placeholder/seed data rather than a UI problem, but flagging it in case real content is expected here — it would be misleading to a student.

---

## Summary of priorities

1. 🔴 **Empty-result stale detail pane** — clear/replace the detail view when 0 questions match.
2. 🟡 **Modal semantics + focus management** — `role="dialog"`, `aria-modal`, move/trap/return focus.
3. 🟡 **Checkbox accessible names** — make screen readers announce "Math", "Easy", etc., not "on".
4. 🟡 **Contrast fixes** — count subtitle, empty-state text, and search placeholder.
5. 🟡 **Empty-state recovery copy** + **"Original/Set #1" clarity**.
6. 🟢 **Polish** — single `<h1>`, a `nav` landmark, disambiguate the two greens.
