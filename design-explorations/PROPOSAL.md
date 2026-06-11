# Design Direction Proposal — June 2026

Research + audit + three candidate design systems for taking the LMS from
"clean admin template" to a branded, production-grade product. The three
sample mockups in this folder (`index.html` is the hub) are the deliverable;
this doc is the reasoning.

---

## 1. Why the app currently reads as "not production"

A code audit of the four flagship surfaces (StaffShell + Dashboard, ModulesPage,
student home, FullTestApp) found the interaction layer is genuinely strong —
⌘K palette, collapsible rail with persistence, optimistic UI, skeletons,
focus-visible rings. The problem is entirely the **identity layer**:

| Finding | Evidence |
|---|---|
| Stock Tailwind `slate` outnumbers the bespoke `ink` palette ~5:1 | `bg-slate-800` ×462, `bg-slate-900` ×382 vs `bg-ink-100` ×84. The canvas itself is `bg-slate-50` (StaffShell.tsx:442) |
| Brand color is default `indigo-600` flat fills | `bg-indigo-600 hover:bg-indigo-700` on every CTA — the single most recognizable "default Tailwind / AI-generated" look |
| Type ramp is flat | text-sm ×956 + text-xs ×751; nothing above 24px anywhere in the chrome; every page reads like a dense settings panel |
| Radius entropy | rounded-md/lg/xl/2xl/full all in heavy rotation (~1,500 uses) with no governing rule |
| Cards barely separate from the page | white + ring-1 slate-200 + 0.04-alpha shadow on slate-50 ≈ wireframe |
| Dark mode is two systems | inline `dark:` variants AND a fragile `!important` override block (index.css:124-152) that restyles bare selectors like `.dark aside` |
| Test runner ignores the brand system | FullTestApp hardcodes `blue-500/600/700` instead of the themeable accent ramp |

Key asset: the `--accent-*` channel-var architecture (the whole indigo ramp is
already aliased to CSS vars, rethemed per domain). **A redesign is therefore
mostly a token swap, not a component rewrite.**

## 2. What the landscape research says

- **Bluebook (College Board's real DSAT app):** spacious white, near-zero chrome
  color, hideable timer (explicit anxiety-reduction), bottom navigator pill,
  letter-circle answer cards. Students report less anxiety purely from interface
  familiarity → the runner should clone Bluebook's grammar, and brand
  personality must stay OUT of the passage/question panes. All three samples
  honor this.
- **Canvas/Schoology/Classroom:** keep Canvas's IA (left contextual course nav —
  teachers' mental model); the "district software" smell comes from gray tables,
  boxes-in-boxes, icon-only toolbars. Classroom's lesson: one accent per course
  gives identity cheaply.
- **Khan Academy:** mastery squares (one small square per skill, filled by
  mastery state) are the steal-worthy pattern — dense, legible, motivating, and
  they map 1:1 onto the existing 8 CB skill domains. **Progress is the
  decoration.**
- **Brilliant (not Duolingo):** the right register for test-prep teens —
  smart, calm, tactile; borrow streak *mechanics*, never the cartoon skin.
- **Linear/Stripe/Vercel:** the anti-admin-template formula — one type family
  with a strict ramp; gray does layout, color does semantics; borders one step
  above background; density via typography not padding-shrinking; 150–200ms
  feedback motion only.

## 3. Reading-science constraints (apply to ALL directions)

- Passages: serif, 16–17px, line-height 1.6–1.7, measure ≤ ~36rem (55–66 cpl).
- Body text ≥ 7:1 contrast (sessions run 30–60+ min), secondary ≥ 4.5:1.
- Off-white grounds beat #FFFFFF (less glare; free elevation hierarchy because
  cards stay pure white).
- **Light mode is the test-taking default** (positive polarity reads better;
  matches Bluebook = practice mirrors test day). Dark mode = opt-in for evening
  review; never #000 grounds, never #FFF text, desaturate accents 15–25%.
- KaTeX renders Computer Modern regardless of page font — pick passage serifs
  in CM's family (Source Serif 4 / STIX Two / Literata) and bump
  `.katex { font-size: 1.05–1.1em }` to equalize optical size.
- CJK names: stack `'Noto Sans TC'/'PingFang TC'` fallbacks; never italicize CJK.

## 4. The three directions

### A — Scholar's Desk (warm paper manuscript)
Warm paper ground #FAF7F2 (the page is never white), library-ink blue #3A5BC7,
Fraunces display + Hanken Grotesk UI + Source Serif 4 passages.
**Fits:** the husband-wife boutique brand; one serene world from dashboard to
test. **Risk:** needs typographic excellence to avoid reading as bland;
progress color must carry motivation alone.

### B — Instrument (Linear-grade focused workspace)
Cool slate #F6F7F9, cobalt #2B5CE6 (warmer-blue than the indigo cliché),
Schibsted Grotesk everywhere + STIX Two Text passages (closest free match to
KaTeX's Computer Modern).
**Fits:** the explicitly stated Linear/Notion/Cloudflare bar; lowest-distance
path from today's code; teacher power-users. **Risk:** "tasteful SaaS 2026" is
becoming a default look — needs the serif-passage layer + mastery-square
signature to stay distinctive.

### C — Ivy Ledger (collegiate navy + gold)
Eggshell ground, navy-cast text (#1B2A4A primary — the whole page reads
navy-tinted with zero colored backgrounds), gold #B9892C as display-only
ceremonial material (score numerals, milestones — never small text).
Newsreader display + Onest UI + Literata passages.
**Fits:** families buying a college outcome; zero competitors look like this.
**Risk:** highest execution risk — done cheaply it's a law-firm template; gold
discipline is everything.

## 5. Recommendation

**Chassis: B (Instrument). Reading surfaces: A's serif layer. Runner: Bluebook-calm (all three already agree).**

Rationale:
1. B is the bar the project already names (CLAUDE.md: "Linear / Notion /
   Cloudflare for interaction quality") and ModulesPage is halfway there — it's
   the lowest-risk, highest-coherence migration for a 2-person shop.
2. The genericness risk of B is neutralized by the two signature elements that
   should ship regardless of direction:
   - **Serif passage typography** (STIX Two Text or Source Serif 4) in the
     runner, review surfaces, and question previews — no competitor LMS does
     reading typography properly, and it's pedagogically correct.
   - **Mastery squares + score trajectory** as the recurring brand visual on
     both student and teacher surfaces — converts the actual product moat
     (per-skill data) into the visual identity.
3. C is the strongest *marketing* identity but demands a dual-system discipline
   (collegiate student surfaces + quiet staff tools + neutral runner = three
   visual contexts) that costs real maintenance for two maintainers.

If the samples change your mind — e.g. Scholar's Desk feels more "you" — the
migration plan below is identical; only token values change.

## 6. Migration plan (any direction)

Phased, each phase shippable + reversible:

1. **Token foundation (1 session):** alias `slate-*` → chosen neutral ramp in
   tailwind.config.js (same trick as the existing indigo→accent alias — ~12
   lines, rethemes every surface at once); re-seed `--accent-*` channel vars;
   add the two elevation shadows; load webfonts via @fontsource (self-hosted,
   CF Pages-friendly).
2. **Type ramp + radius canon (1 session):** page h1 → 28px tracking-tight,
   stat numerals → tabular-nums display style; codemod radii to the 3-step
   system (full / 8px / 14-16px); page-width canon constants.
3. **Card recipe + dark-mode cleanup (1-2 sessions):** single card utility
   class; migrate the index.css `!important` block to semantic CSS-var tokens
   (`bg-surface` / `border-line` / `text-fg`).
4. **Runner alignment (1 session):** FullTestApp blue-* → accent-*; serif
   passage face + measure cap; `.katex` size bump; hideable timer if not
   already.
5. **Signature elements (1-2 sessions):** mastery-squares component (student
   home + teacher heatmap share it); score-trajectory chart upgrade; stat-card
   pattern on dashboard.

Total: roughly 5–7 working sessions, no migrations, no route changes, smoke
suite untouched.

---

*Sources: line-length literature (Dyson & Haselgrove; Visible Language review),
dark-mode/astigmatism research (Stéphanie Walter; BOIA), KaTeX font docs,
Linear 2025 redesign principles, Instructure InstUI migration notes, Khan
Academy 2025 classroom redesign, Fontshare ITF license terms. Full agent
research transcripts in the session workflow logs.*
