# Learnings

Non-obvious things we discovered along the way, and the design decisions that came out of them. Roughly chronological.

## The API is public

The biggest finding. The College Board educator question bank UI is gated behind a sign-in, but the underlying JSON endpoints at `qbank-api.collegeboard.org` accept anonymous POST requests with zero authentication. A single `curl -X POST` works.

This collapsed an entire planned architecture (Playwright + persistent session + manual login) into "use httpx, no browser at all." Total scrape time went from "hours, fragile" to **~3 minutes, deterministic**.

**Implication**: anyone scraping a College-Board-style site should check whether the JS app talks to a documented or undocumented JSON endpoint before reaching for Playwright. The JS bundle is a great place to look — `grep -oE "/questionbank/[a-zA-Z0-9/_-]+" bundle.js` immediately surfaced every endpoint the SPA uses.

## Two question stores

The bank has two underlying content stores:
1. **Modern**: served from `qbank-api.collegeboard.org/.../digital/get-question` keyed by a UUID (`external_id`). MathML-based math rendering.
2. **Legacy ("IBN")**: served from `saic.collegeboard.org/disclosed/<ibn>.json`. Math rendered as base64-encoded PNG images embedded in the rationale.

~25% of Math questions (and 0% of R&W in our scrape) have `external_id: null` and need the legacy path. Their `ibn` field (e.g. `022222-DC`) is the legacy key.

**Implication for future scrapes**: don't trust that one endpoint is enough. Always inspect the JS app's call patterns for branching logic on null/empty fields.

## Data quirks worth knowing

- **Case duplicates in skill names**: 2 questions originally had `"Cross-text Connections"` (lowercase t) while 56 had `"Cross-Text Connections"`. Fixed by `scripts/normalize_skills.py`, which picks the most-common case variant as canonical.
- **Some MCQs have empty `keys`**: 11 in the scrape. The viewer surfaces a clear amber warning rather than silently showing a misleading "Show answer" button.
- **R&W stimulus is mandatory but separate from stem**: every R&W question has both a `stimulus` (the passage) and a `stem` (the actual question, often very short). We originally rendered only stem and missed all the passages. Lifted via `scripts/add_stimulus.py` and rendered as a left-bordered callout in `Detail.tsx`.
- **Math stem can include SVGs with inline `<style>` blocks**, which the regex `<[^>]+>` does NOT strip. The preview generator now removes `<style>`/`<script>`/`<math>` blocks first, then tags.

## Bot detection on the SPA

The HTML/UI side (not the API) is fronted by Akamai bot management (`bm_sz`, `_abck` cookies, sensor-data POSTs to `/9dnmZdV7UelvXi.../...`). High-rate Playwright traffic gets the IP slow-rolled — pages start timing out, HTTP/2 connections refuse to negotiate.

**Implication**: never put a scraper on the SPA when there's a JSON endpoint available. The API is unmonitored.

## Faceted filters are a UX upgrade, not a perf trick

Initial version: filter counts were totals across the whole index. That's fast and simple but actively misleading — picking R&W left the Difficulty pills showing "Easy 1,240" when only ~600 of those were actually R&W Easy.

The proper pattern: each category's counts exclude **only its own filter**, applying all the others. A facet count answers "how many would I see if I picked this value, given everything else I've already picked?" Zero-counts get dimmed so the user immediately sees what's a dead-end combination.

## Hierarchical filters need both visible nesting and live data

Three iterations:
1. **Pills, flat layout**, Skill section shown when a Domain is checked. → Users didn't realize Skill was a sub-category of Domain.
2. **Pills with a "Skill · in Craft and Structure" label**. → Helped, but still flat — Domains and Skills lived in separate sections.
3. **Real tree: each Domain is a collapsible parent containing its Skills**. → This finally communicates the structure. Auto-expansion based on `domain checked OR any of its skills checked OR manually expanded` keeps the sidebar tidy while still being clickable.

## Display ID vs canonical ID

The raw question id (`03c9f327`) is a stable hash but not human-friendly. We added a `number` field assigned at index-build time, sorted by `(section, difficulty, domain, skill, id)`, displayed as `#1..#3444`.

URLs still use the hash id (`#q=03c9f327`), not the number. Numbers shift if the dataset grows; hashes don't. Users see and discuss "Question #1234" but bookmarks survive re-indexing.

## "Safeguards" — required facets

Browsing 3,444 questions on first load is not useful. Difficulty was made a required facet: if no difficulty is checked, the result list shows a clear setup guidance instead of dumping everything. Other categories (Section, Domain, Skill) remain optional.

The required-facet list is a constant (`REQUIRED_FACETS` in App.tsx) — easy to add Section/Domain later if desired without restructuring.

## React-specific gotchas

- **`EMPTY_FILTERS` as a const** with `new Set()` instances is a footgun. Even if nothing currently mutates the sets, the next contributor will. Replaced with `emptyFilters()` factory.
- **`Locator.check(force=true)` in Playwright** still bypasses *some* checks but not visibility. For hidden-input checkbox patterns (Apple-style radios with `sr-only` inputs), set `checked` via the React-aware native setter or click the visible label.
- **`dangerouslySetInnerHTML` + lazy images**: you can't set `loading="lazy"` in markup that's only stringified; do it via a `useEffect` that walks the mounted DOM.
- **`history.replaceState` does NOT fire `hashchange`**, which conveniently prevents update loops between hash sync and filter state.
- **Vite + Tailwind custom palette**: a custom color in `tailwind.config.js` is only picked up at dev-server start. If you add `accent-600` to the config while Vite is running, the class won't be generated. Restart Vite.

## Filename gotcha

`scraper/inspect.py` couldn't import `playwright.async_api` because Python's `asyncio` imports `inspect`, and the local `inspect.py` shadowed the stdlib. Don't name files after standard library modules. (Renamed to `probe.py` originally; long since deleted with the rest of the probe code.)

## What we didn't need

Things that initially looked necessary and turned out not to be:
- **Playwright** for the main pipeline
- **Logged-in browser sessions** anywhere in the production flow
- **Persistent Chromium profile** (`scraper/.profile/`)
- **PDF generation / parsing** — the API gives structured JSON, which is strictly more useful for a viewer
- **Schema migrations** for most changes — the `raw` blob is preserved on every question so we could re-derive fields without re-scraping (the stimulus migration used exactly this)

## Filter architecture: from hardcoded to declarative

The original sidebar had hardcoded UI for each filter dimension (sections, difficulties, domains, skills). Adding a new filter required edits across Sidebar.tsx (~700 lines), App.tsx (apply logic), types.ts (URL hash), and the DSL parser. A 5-file change per new filter.

The refactor introduced a declarative facet engine (`lib/facets.ts` + `lib/filterRegistry.ts`). Each filter is a `FacetDef` entry in a single array. The engine handles:
- Filtering (applyFacets)
- Facet counts with cascade-aware behaviour (facetCounts: drops the filter's own constraint when computing counts so the user sees "what happens if I check this")
- Cascade pruning (sanitizeFacetState: when section changes, drop now-invalid skills)
- URL hash serialization

Adding a new filter dimension now: append one line to `FILTERS`. The sidebar renders it, the URL hash serializes it, the DSL can target it. The cost of adding a filter went from a half-day to a minute.

**Insight:** When a UI surface has more than 4-5 instances of "the same kind of thing with different data," extract the kind into a registry. The pattern compounds.

## Design system: documentation vs enforcement

We initially wrote `designSystem.ts` and DESIGN.md claiming a "single source of truth." A brutal review found that *zero* components imported the file's TYPE/SPACE/SURFACE/INTERACTIVE exports — they were aspirational, not enforced. Every component used inline Tailwind class strings.

The fix wasn't to migrate every component. It was to:
1. Tell the truth in DESIGN.md (added a "Known limitations" section)
2. Add ESLint warnings for the worst offenses (inline hex, arbitrary brackets, raw z-indices)
3. Keep the tokens available for new code while existing code carries on

**Insight:** A design system that lies about its adoption is worse than no design system. Honesty about which tokens are enforced vs. aspirational is more valuable than aspirational tokens nobody uses. ESLint warnings are the right enforcement level for "we want to migrate" — they don't break the build, they nudge the next PR.

## Recursive review: catching what the first pass missed

We did a multi-pass design review where each agent had limited context. The first reviewer admitted 12 blind spots in their own critique. The second reviewer (with explicit instructions to cover those blind spots) found:
- A silent broken animation (undefined `stepFadeIn` keyframe)
- Dead code in the bundle (`Sidebar.tsx` still exported via barrel)
- 3 different color tints for the same semantic concept across files
- Inter font features set without Inter being shipped

**Insight:** "Brutal honesty" in a single review pass is not enough. Reviewers narrate their own scope and blind spots, and a second pass focused on those blind spots catches qualitatively different bugs. The dialogue between reviewer + meta-reviewer + fix agent is more thorough than any single deep dive.

## Color identity: meaning > prettiness

We added 5 named identity colors (indigo for content, teal for topic, amber for difficulty, violet for format, slate for status). The selection wasn't aesthetic — each color encodes meaning, used consistently across:
- Sidebar group header dots
- Modal top borders
- Breadcrumb chips
- List row stripes

Scanning the sidebar now shows indigo→teal→amber→violet→slate dots — the rhythm tells the user where they are.

**Insight:** Restraint compounds. 5 functional colors used everywhere beats 12 aesthetic colors used inconsistently. The constraint "every color must mean something" forces clarity.

## Sidebar depth modes: progressive disclosure for power users

Initially proposed 3 modes (Basic / Detailed / Advanced). The user simplified to 2 (Basic / Advanced) — and we made the Aspects panel always visible in Advanced (with a placeholder when no skill is selected) so users could discover it without guessing.

The width animates from 256px → 384px. The mode preference persists.

**Insight:** Progressive disclosure works best with explicit affordances (the segmented control), not implicit (hover-to-reveal). Power users don't mind clicking a button; novice users don't see what they don't need.

## Facet counts: "what if I checked this" semantics

When computing the count next to each filter option, we apply ALL OTHER filters but drop the one being counted. This means the number predicts "how many results would I see if I also checked this" — the only useful semantic.

Alternatives we rejected:
- Show absolute counts (ignores current filter context — misleading)
- Show post-filter counts (always shows 0 for unchecked options that would constrain further — useless)

The "drop my own filter" pattern is buried in lib/facets.ts:`facetCounts` and is invisible to consumers — exactly where this kind of subtle correctness should live.

## useFocusTrap: one hook, 17 modals

The codebase had 17 modal/popover components with bespoke focus management — some had partial focus traps, most had only Escape handling. A consistent WCAG 2.4.3 violation across the app.

The fix was a single `useFocusTrap(ref, active)` hook applied uniformly. 50 lines of hook code replaced 200+ lines of duplicated useEffect logic across modals. The `data-autofocus` attribute lets modals nominate their preferred initial focus target without the hook hard-coding it.

**Insight:** When you find the same hand-rolled a11y pattern in 10+ places, extract once. Done well, it's invisible to the consumer (just import and call) and removes a class of bugs from the codebase forever.

## What we'd do differently next time

1. **Start with the design system.** We built features for weeks before formalizing tokens, which left a long tail of inline class strings to migrate.
2. **Add ESLint enforcement when introducing a token.** Without lint, drift is inevitable. Token + ESLint rule together is the smallest viable unit.
3. **Document blind spots in reviews.** Asking a reviewer to admit what they didn't check is more useful than asking them to find more issues.
4. **Build the abstraction the second time, not the first.** The facet engine works because we had 4 hardcoded filter dimensions to model on. If we'd built it first, we'd have abstracted the wrong thing.
