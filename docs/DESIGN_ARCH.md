# Design Architecture

Formal record of the cross-cutting design rules and architectural patterns
adopted across the SAT Question Bank. Reusable as the source-of-truth when
adding new surfaces or extending the existing ones. Sibling references:

- [DESIGN.md](./DESIGN.md) — visual language, tokens, components.
- [DESIGN_PRINCIPLES.md](./DESIGN_PRINCIPLES.md) — UX bar per-surface.
- [ARCHITECTURE.md](./ARCHITECTURE.md) — overall system architecture.

This doc is the **how we make decisions and structure data** layer. Things
that should not change without team discussion live here.

---

## 1. The Aspect taxonomy

### 1.1 Three-tier hierarchy

```
Section            (e.g. "Math" | "Reading and Writing")
└── Domain         (e.g. "Advanced Math", "Algebra", "Information and Ideas")
    └── Skill      (e.g. "Equivalent expressions", "Boundaries")
        └── Aspect (e.g. "Combine like terms", "Semicolon between clauses")
```

Aspects are the leaf layer that lets students filter within a single skill.
Section / Domain / Skill come from College Board's official taxonomy and
are immutable. **Aspects are our addition** — designed by us, surfaced as
an "Aspects within selected skills" panel in the sidebar (Advanced mode).

### 1.2 Rules for aspects

| Rule | Why |
|---|---|
| **Each skill has ≤ 10 aspects.** | Cognitive load: a filter list longer than ~10 is unusable. |
| **Slugs are globally unique** kebab-case strings prefixed per skill (`eq-expr-*`, `nlf-*`, `boundary-*`). | Avoids cross-skill ambiguity; lets one map serve every UI. |
| **Slugs never get renamed once shipped.** | They are referenced by stored attempts, analytics, and DB rows. Rename by adding a new slug + redirecting in the tagger. |
| **Labels are jargon-light, student-facing.** | "Solve a system by substitution" not "Substitution method system". |
| **An aspect must group ≥ 3 representative questions** to earn its own slot. | Below that, fold into a sibling or into `*-other`. |
| **First-match-wins predicate ordering.** | Each skill's predicate chain is ordered most-specific → most-general. The catch-all `*-other` always lives at the end. |
| **Every question is assigned exactly one aspect.** | 100% coverage. `*-other` is the residual when no specific predicate matched — never empty. |
| **The catalog is the single source of truth.** | `data/aspects/catalog.json` lists every slug with `{label, skill, domain, section, count}`. The UI never invents a label. |

### 1.3 File layout

```
data/aspects/
├── catalog.json        # canonical {slug, label, skill, domain, section, count}[]
├── aspects.json        # { byId: { qid: [slug] } } — 1:1 question→aspect map
├── catch_all_qids.json # diagnostic: which qids hit the *-other catch-alls
├── REPORT.md           # coverage stats per skill
└── TREE.md             # human-readable tree with examples per aspect
```

The same `catalog.json` is hardlinked into `viewer/public/data/aspects/` so
the dev viewer fetches it as a runtime resource.

### 1.4 The tagger contract

`scripts/tag_aspects.py` is **deterministic, stdlib-only, idempotent**, and
runs in under a second on the 3,444-question bank.

- One predicate function per aspect; predicates read a normalised
  `searchText` blob (MathML pre-expanded to alttext).
- Predicates are pure functions over `(searchText, stemHtml, rationaleHtml, type)`.
- A `_install_catch_alls()` helper appends a `True`-predicate at the end of
  every skill's rule chain emitting `<prefix>-other`. This is the only way
  100% coverage is guaranteed.
- Every run snapshots `aspects.json` before mutating and aborts on any
  unauthorised slug flip — see "Regression guard" below.

### 1.5 When evolving the taxonomy

1. **Don't add an aspect for fewer than 3 questions.** Fold into an existing
   sibling or into `*-other`.
2. **Don't exceed 10 aspects per skill.** Merge or restructure first. The
   skill cap is more important than slug granularity.
3. **Don't rename a shipped slug.** Add the new slug, redirect the
   predicate, leave the catalog record marked deprecated for one release.
4. **Cross-skill re-routes** (a question landed in the wrong skill's bucket)
   live in a `CROSS_SKILL_OVERRIDES` dict at the top of the tagger.
   Document the rationale inline.

---

## 2. The Regression-guard pattern

Used by the tagger; reusable for any classifier or migration that mutates
in-place data over many iterations.

### 2.1 Shape

```python
PRE_SNAPSHOT = json.load("aspects.json")["byId"]

# Allow specific flips per phase
CITED_FLIPS = {"abc123", "def456"}     # question ids whose slugs may change
KNOWN_UPGRADES = {"ghi789"}            # ids that the new predicate legitimately
                                       # promotes out of *-other

def regression_check(new_map):
    for qid, old in PRE_SNAPSHOT.items():
        new = new_map.get(qid)
        if new == old:
            continue
        # Upgrades from *-other to a positive slug are always OK
        if old and old.endswith("-other") and new and not new.endswith("-other"):
            continue
        # Authorized flips
        if qid in CITED_FLIPS or qid in KNOWN_UPGRADES:
            continue
        sys.exit(f"REGRESSION: {qid} {old} → {new} not in allowlist")
```

### 2.2 Rules

- **Allowlist by question id**, never by slug — slug-level allowlists drift.
- **Catch-all → positive is always an upgrade**, never a regression.
- **Positive → different positive is a flip** that must be in the allowlist.
- **Positive → catch-all is always a regression** (information loss).
- **The guard runs every iteration**, not as a one-shot smoke test.

---

## 3. The Phased iteration pattern

When refining a heuristic system (tagger, classifier, UI rules) against a
large existing corpus, run as **discrete phases** with checkpoint between
each — never as one big bang.

### 3.1 Phase shape

```
Phase N proposal  ──►  Subagent implements  ──►  Tagger re-runs  ──►
Regression guard  ──►  TREE.md regenerates  ──►  User reviews  ──►  decide next phase
```

Each phase:
- Touches a defined set of slugs (the cited example IDs are the spec).
- Has an explicit allowlist of expected flips.
- Has a target bucket-size delta (`nlf-other` 39 → ~14, etc.).
- Re-runs the regression guard with the cumulative allowlist of all prior
  phases plus its own.

### 3.2 Why phasing

- Catches over-broad heuristics early (Phase 2 caught 5 over-broad widens
  via the regression guard before they shipped).
- Lets the user eyeball the impact in TREE.md between phases.
- Bounded scope per subagent prompt → faster, more accurate.
- A bad phase can be reverted without unwinding subsequent work.

---

## 4. The Adapter-swap pattern for persistence

When the same client logic needs to work against multiple persistence
backends (e.g. localStorage in static exports, Supabase in the live app),
**define the interface, ship the cheap adapter first, swap later**.

### 4.1 The persistence interface

Locked once; both adapters honour it.

```ts
interface AttemptPersistence {
  // While the user is mid-test
  saveDraft(setUid: string, draft: Draft): void
  loadDraft(setUid: string): Draft | null
  clearDraft(setUid: string): void

  // On submit
  saveAttempt(setUid: string, attempt: Attempt): Promise<void>

  // For index-page badges
  listLatestAttempts(): Promise<{ setUid, score, total, submittedAt }[]>
  listInProgress(): Promise<{ setUid, startedAt, answeredCount }[]>
}

interface Draft  { answers: Record<QId, Choice>; startedAt: number }
interface Attempt {
  startedAt: number; submittedAt: number; secondsTaken: number
  score: number; total: number
  source: "static" | "viewer"
  answers: { qid: QId; chosen: Choice; isCorrect: boolean; answerTimeMs: number }[]
}
```

### 4.2 Adapter selection

```js
const Persistence =
  (await SupabaseAdapter.isAvailable())  // signed-in + reachable
    ? SupabaseAdapter
    : LocalStorageAdapter
```

- **LocalStorageAdapter is the default**, never goes away — guarantees the
  static exports work offline / signed-out / file://.
- **SupabaseAdapter enriches** when a session exists, syncing on submit and
  back-filling badges from the DB on index load.
- **One-way sync on sign-in**: local drafts can be migrated up; never
  pulled back down to overwrite local.

### 4.3 Why this pattern

- The static HTML exports must keep working without auth.
- The same JS file ships into static exports AND the React viewer.
- Backend changes (e.g. Supabase → something else) only touch the adapter.

---

## 5. Static-export design rules

The HTML/PDF exports under `data/exports/` follow these rules to stay
information-dense without being cluttered.

### 5.1 Eliminate triple-repetition

Same fact stated three times = noise.

| Fact | Allowed places |
|---|---|
| Skill name (single-skill set) | Cover chip · sticky strip — **never** on every card |
| Difficulty | Cover chip — **never** on every card |
| Section | Cover chip only |
| Mixed-skill set | Per-card tag is mandatory; strip omits skill |

### 5.2 Canonical stem promotion

When every question in a set has an identical stem (typical of R&W skills
like Boundaries / Words in Context / Transitions), the stem is rendered
**once on the cover** under a small "Each question asks:" label, then
**suppressed per-card**. Mixed stems → per-card stem stays.

Detection rule at build time:
```js
const canonicalStem = allEqual(items.map(it => it.stem.trim()))
                       ? items[0].stem.trim() : null
```

### 5.3 Cover hierarchy

A cover is one block, not a layered montage. Drop:
- Horizontal rules between chips/title/footer.
- Big secondary numerals (the old right-side "01" — set number lives in
  the meta line as `Set 1` instead).
- Date as a primary element — small footer only.

Cover composition: `chips → title → meta → optional canonical-stem → footer`.

### 5.4 Strip

The sticky strip across every page after the cover shows position, not
identity. The strip is for "where am I in the set", not "what is this set".

| Old strip | New strip |
|---|---|
| EASY · STANDARD ENGLISH CONVENTIONS · Boundaries  •  Set 1 | Boundaries · Set 1  •  Q 1 / 10 |

### 5.5 Print parity

All interactive chrome (test-mode toggles, submit buttons, timers) MUST be
hidden under `@media print`. Print output is identical pre/post the test
runner.

---

## 6. Test-mode workflow

Pattern adopted across both the static exports and the live viewer.

### 6.1 Two modes, one file

`_questions.html` is self-contained and supports both Study and Test modes
via a single JS runner. No separate `_test.html` proliferation.

Mode source of truth (in order of precedence):
1. URL query `?mode=test`
2. localStorage `exports:mode` set by the index page toggle
3. Default: study

### 6.2 Index-page toggle

A global `[ Study · Test ]` pill in the header. Per-set cards adapt their
primary action: in Test mode, links append `?mode=test`. Badges show:
- **"Resume"** if a draft exists for that set.
- **"Last: 8/10"** if a completed attempt exists.

### 6.3 Test-mode contract

Inside the questions HTML:
- Each `.choice` becomes a clickable radio; selection persists to
  `saveDraft()` on every click.
- A timer in the strip shows `Date.now() - startedAt`.
- A floating submit button shows "Submit (X/N answered)"; finalises with
  `saveAttempt()`.
- Per-card visual feedback after submit: green / red border + correct-letter
  alongside chosen-letter.
- Inline rationale on demand: a "Show rationale" link per wrong card loads
  the corresponding `<article>` from `_key.html`.

### 6.4 Drafts vs attempts

- **Draft** = in-progress, mutable, single row per setUid. Cleared on
  submit or explicit "Discard".
- **Attempt** = immutable record of one finished test. Appended; never
  edited. Multiple attempts per setUid are kept and used for "last score".

---

## 7. Reusable iteration discipline

These conventions kept the multi-phase aspect work safe and reversible.
Apply them to any future multi-phase data transformation.

1. **Every proposal is a Markdown doc first.** Implementation comes after
   sign-off. (See `/tmp/aspects/OTHER-PROPOSAL.md` for the canonical form.)
2. **Per-proposal "cluster size verified" lists.** Every claim like
   "absorbs 8 questions" is backed by 8 cited question IDs. The
   implementation MUST hit all of them, validated post-run.
3. **Subagents get the cited-IDs list as their allowlist**, then run the
   regression guard with it. They abort on any unauthorised flip.
4. **Coverage targets per phase**, not just an end-of-project goal. Each
   phase declares "Other shrinks 266 → ~170" so the user can call drift.
5. **Incidental upgrades are documented, not silently absorbed.** When the
   new heuristic legitimately fixes an old mis-tag, the question ID is
   added to `KNOWN_UPGRADES` with a one-line rationale, not hidden in
   `CITED_FLIPS`.
6. **Sync the public copies** (`viewer/public/data/...`) at the end of
   every run. Dev server reads from `public/`; data drift between
   `dist/` and `public/` causes hard-to-debug "I changed it but it
   didn't update" reports.

---

## 8. Anti-patterns to avoid

| Anti-pattern | Why it's banned | Use instead |
|---|---|---|
| Skill or difficulty tag on every card in a single-skill set | Triple repetition; visual noise | Cover chip + strip only |
| Renaming a shipped aspect slug | Breaks stored attempts, analytics, DB refs | New slug + predicate redirect |
| One big subagent doing 30 widens at once | Hard to review, easy to over-broaden | Phased proposals with cited IDs |
| Persistence directly to Supabase only | Static exports + offline use break | Adapter pattern, localStorage default |
| Generating a separate `_test.html` per set | File proliferation; sync drift | One `_questions.html` with mode toggle |
| Per-skill caps relaxed "just for this one" | Slippery slope; UI degrades silently | Merge or split aspects to fit |
| Skipping the regression guard "this run is small" | Small runs leak mistagging | Always run the guard |

---

## 9. Build pipeline mechanics

### 9.1 Stylesheet source of truth

The canonical stylesheet for the static exports is
`scripts/export-sets/templates/styles.css`. The build pipeline's
`extract-styles.mjs` post-processes it into the shipped
`data/exports/_assets/styles.css` (deduped, with cross-file CSS pulled in).

**Always edit the template**, not the shipped file. The shipped file is
regenerated on every export run and will silently overwrite manual edits.

**Gotcha:** `extract-styles.mjs` only re-writes `_assets/styles.css` when it
finds inline `<style>` blocks to extract (i.e. when at least one HTML file
hasn't been linked yet). When the only change is to the template stylesheet
and no `*_questions.html` got re-emitted, the script is a no-op and the
shipped asset will stay stale. Two ways to push the change:

```bash
# Fast: copy template → shipped asset (CSS-only changes)
cp scripts/export-sets/templates/styles.css data/exports/_assets/styles.css

# Full: regenerate everything (HTML + styles)
node scripts/export-sets/build-sets.mjs --all
node scripts/export-sets/lib/extract-styles.mjs
```

### 9.2 SPR hybrid input pattern

Student-Produced-Response questions present a unique problem: the
bubble-grid layout is the authentic SAT visual (needed for study mode +
print), but it's not a usable answer field in test mode.

Solution: render both, hide one by mode.

```html
<div class="gridin">                              <!-- always visible -->
  ...bubble grid for visual reference / print...
</div>
<input class="gridin__entry" type="text"          <!-- hidden in study -->
       placeholder="Enter your answer">
```

```css
.gridin__entry { display: none; }
body[data-mode="test"] .gridin__entry { display: flex; }
@media print { .gridin__entry { display: none !important; } }
```

The same `data-mode` attribute on `<body>` that gates test-mode UI also
toggles the SPR entry. Print output remains authentic.

### 9.3 Symlink + hardlink for same-origin asset sharing

The static SAT exports need to be reachable from **two origins**:
- `file://…/data/exports/` — direct open, no server
- `http://localhost:5173/exports/` — served by the viewer dev server, so
  the exports see the viewer's Supabase auth session (different origins
  = different localStorage = different session)

We use OS-level links to avoid duplicating ~40 MB of HTML/CSS:

```
viewer/public/exports/         → symlink → ../../data/exports/
data/exports/_assets/persistence.js  ←─hardlink─→  viewer/public/data/exports/_assets/persistence.js
```

- **Symlinking the whole tree** is simplest and survives `git add` (git
  records the symlink as a special blob).
- **Hardlinking individual assets** (the test runner, persistence.js) is
  used where the file is referenced from multiple unrelated tree
  locations and a single source-of-truth edit must propagate everywhere.
- Vite's HMR watcher must ignore the linked paths
  (`viewer/vite.config.ts → server.watch.ignored`) or it thrashes when
  the exporter regenerates files.

When adding a new same-origin asset, prefer symlinking the parent
directory once over hardlinking individual files — easier to reason about.

### 9.4 Current-position counter is mode-agnostic

The `data-current-q` counter in the strip (`Q 3 / 10`) updates via
`IntersectionObserver` regardless of mode. It's useful in study mode too
("which question am I scrolled to") and gating it to test mode would just
mean re-implementing the same observer twice. **Always-on observers that
do no harm in either mode are preferable** to mode-gated logic.

---

## 10. Where each rule is enforced

| Rule | Enforced in |
|---|---|
| ≤10 aspects per skill | Manual review during proposals + the cap is asserted at the top of the tagger |
| Slug uniqueness, kebab-case | Tagger constructor walks the catalog at startup, fails on duplicates / bad format |
| First-match-wins ordering | Hard-coded in `tag_aspects.py` per-skill rule list |
| 100% coverage via catch-all | `_install_catch_alls()` runs after every per-skill list |
| Regression guard | Every tagger run; allowlists in `PHASE*_KNOWN_*` sets |
| Canonical-stem promotion | `scripts/export-sets/lib/render.mjs` `allEqual()` check |
| No per-card skill tag (single-skill) | Same renderer; tag block omitted when `skills.size === 1` |
| Print parity | `@media print { .test-* { display: none } }` in `_assets/styles.css` |
| Persistence interface stability | `_assets/test-runner.js` exports only the interface; adapters are private |
| Sync `dist/` and `public/` | Tagger writes both; exporter writes both |
