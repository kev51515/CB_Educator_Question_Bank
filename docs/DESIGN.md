# Design System

The SAT Question Bank viewer follows a tightly restrained design language: monochromatic neutrals with semantic color used as functional markers rather than decoration.

> See also: [COMPONENTS.md](./COMPONENTS.md) for the component catalogue, [PROCEDURES.md](./PROCEDURES.md) for usage workflows, [MECHANISMS.md](./MECHANISMS.md) for system internals.

## Foundations

### Brand voice
- **Restrained, scholarly, precise.** This is a study tool used by educators and students, often for long study sessions. The aesthetic should reduce cognitive load, not add to it.
- **Information density is a feature.** Power users want to see many questions, many filters, many metrics at once. Whitespace is used for separation, not for decoration.
- **Keyboard-first.** All UI is accessible without a mouse. Visual elements should not block keyboard discoverability.

### Color philosophy
- **Color is functional, not decorative.** Every color used has a meaning.
- **Tints over saturation.** Use 50–100 tints for backgrounds, 400 for markers, 700 for high-contrast text. Avoid mid-saturation 500 fills.
- **Semantic consistency.** The same color always means the same thing across the app. Indigo = curriculum structure. Teal = topic. Amber = difficulty. Violet = format.

## Glossary

| Term | Means |
|---|---|
| **Identity** | The 5 semantic color identities (content/topic/difficulty/format/status/accent) — see Palette section |
| **Active** | An interactive element currently being engaged (hover/press/keyboard focus) — short-lived |
| **Selected** | A persistent user choice (e.g., a question added to print set, a filter chip checked) — survives navigation |
| **Pressed** | The visual state during a click — usually < 200ms |
| **Checked** | A form control's binary state (checkbox, radio) |
| **Focus** | The keyboard cursor location — at most one element on the page |
| **Status** (filter group) | The sidebar group containing Bookmarked / Done / In print set |
| **Status** (per-question) | A specific persistent state on a question (bookmarked, done, etc.) |
| **Score band** | College Board's internal 1-8 difficulty calibration |

## Palette

### Neutral scale (`ink`)
Custom Apple-ish cool grays defined in `tailwind.config.js`:

| Token | Hex | Usage |
|---|---|---|
| `ink-50` | `#fafafb` | Sidebar background |
| `ink-100` | `#f3f3f5` | Card pillow tint, kbd background |
| `ink-150` | `#ececef` | Dividers |
| `ink-200` | `#e6e6ea` | Borders |
| `ink-300` | `#cfd0d6` | Disabled accents |
| `ink-400` | `#9b9da5` | Tertiary text |
| `ink-450` | `#6E7078` | A11y-compliant muted text (5.1:1 on white) |
| `ink-500` | `#80828a` | Captions |
| `ink-600` | `#65676f` | Secondary text |
| `ink-700` | `#3e3f47` | Body text emphasis |
| `ink-800` | `#1d1d20` | Primary text |
| `ink-900` | `#000000` | (rare) |

### Accent (SF blue)
Single accent color for interactive/active states. Defined as `accent-50` through `accent-700` (anchored at `accent-600 = #007aff`, SF/iOS system blue).

### Identity colors
Five named identities, each tied to a meaning. Defined in `viewer/src/lib/designTokens.ts`:

| Identity | Color | Meaning | Examples |
|---|---|---|---|
| **content** | indigo | curriculum structure | Section (Math/RW), Domain |
| **topic** | teal | skill / specificity | Skill name, Domain & Skill tree |
| **difficulty** | amber/emerald/rose | challenge level | Difficulty pill, Score Band |
| **format** | violet | question shape | Type (MCQ/SPR), Has stimulus, Freshness |
| **status** | slate | metadata | Bookmarked / Done / Tags |
| **accent** | blue | interactive/active | Buttons, selection, focus |

These appear as:
- **6px colored dots** before group headers (e.g., filter sections in sidebar)
- **3px colored top borders** on modal dialogs
- **Tinted chips** in breadcrumbs (50 background + 700 text)
- **2px stripes** on left edges of items (e.g., question list rows by difficulty)

### Dark mode
Implemented via CSS custom properties + `.dark` class overrides in `index.css`. No component edits required — Tailwind utility classes (`bg-white`, `text-ink-800`, etc.) are remapped via `!important` overrides in `.dark` selectors.

### Accessibility variants
Three additional preference modes apply via CSS classes:
- `.dyslexia-mode` — OpenDyslexic font + increased letter/word spacing
- `.high-contrast` — Forced B/W palette + 3px focus rings
- `.math-speech-on` — Marks `<math>` elements for screen-reader narration

CSS variables `--letter-spacing` and `--line-height` are user-adjustable via sliders.

## Typography

Apple system stack — SF Pro Text / SF Pro Display via `-apple-system`. MathML uses STIX Two Math fallback.

Defined in `lib/designSystem.ts → TYPE`:

| Token | Size | Weight | Usage |
|---|---|---|---|
| `title` | 14px | 600 | App title |
| `body` | 14px | 400 | Question text |
| `hero` | 26px | 600 | Question number |
| `groupHead` | 10.5px | 600 (uppercase) | Sidebar group headers |
| `caption` | 11px | 400 | Helper text |
| `hint` | 10.5px | 400 | Sub-control hints |
| `label` | 13px | 400 | Control labels |
| `labelSm` | 12px | 400 | Sub-control labels |
| `num` | 12px | 400 (tabular-nums) | Counts |

Tabular numerals (`tabular-nums`) are used for all counts to avoid jitter as numbers change.

## Spacing

8px grid + Tailwind's default scale. Defined in `lib/designSystem.ts → SPACE`.

Notable patterns:
- Modal padding: `p-7` (28px)
- Card padding: `p-4` (16px)
- Section gap: `mb-5` (20px)
- Icon button: `w-7 h-7` (28px square)
- Identity dot: `w-1.5 h-1.5` (6px round)

### Z-index scale

Defined in `lib/designSystem.ts → Z`. Use these consistently to predict stacking:

| Token | Value | Purpose |
|---|---|---|
| `sticky` | 1 | Sticky headers, breadcrumb bars within scrollable content |
| `contextBar` | 2 | Print drawer / batch ops bar overlays |
| `tooltip` | 5 | Hover tooltips |
| `modal` | 20 | Standard dialogs |
| `drawer` | 25 | Slide-out panels |
| `fullscreen` | 30 | Full-screen overlays (Compare, Reading, Knowledge Graph) |
| `toast` | 40 | Toasts (above modals so they're never lost) |

Existing modals may use ad-hoc values; new code should use these tokens. **Known stacking gotcha**: if you open multiple modals, the second one renders at the same z and may visually merge — opening dialogs from inside dialogs is not currently supported.

## Components

### Surfaces
Defined in `lib/designSystem.ts → SURFACE`:

| Token | Pattern |
|---|---|
| `card` | `bg-white border border-ink-200 rounded-xl shadow-card` |
| `modal` | `bg-white rounded-2xl shadow-modal border border-ink-100` |
| `panel` | `bg-ink-50/60 rounded-lg border border-ink-150` (e.g., note display) |
| `inset` | `bg-ink-50 rounded-lg border border-ink-200` (e.g., rationale) |
| `pillBg` | `bg-ink-100` (segmented control track) |

### Interactive states
Defined in `lib/designSystem.ts → INTERACTIVE`:

| Token | Pattern |
|---|---|
| `focusRing` | `focus-ring` class — 3px accent-blue shadow on focus-visible |
| `hoverRow` | `hover:bg-ink-50` |
| `pressedRow` | `bg-accent-50/60` (selected state) |
| `buttonPrimary` | accent-600 fill with white text |
| `buttonSecondary` | ghost outline with hover fill |
| `buttonGhost` | text-only, hover background |

### Icons
- Lucide-style line icons drawn inline as SVGs (~14×14px).
- `stroke-width: 1.8` for outline, `2.5` for emphasis.
- `aria-hidden` when decorative; `aria-label` when meaningful.

### Keyboard chips (`kbd`)
Styled in `index.css` — monospace, 11px, light gray background, 1px border with 1.5px bottom edge to suggest a physical key.

## Patterns

### Modal dialogs
- `role="dialog"`, `aria-modal="true"`, `aria-labelledby="<title-id>"`.
- Focus trap on open; restores focus to trigger on close.
- Escape closes; backdrop click closes (unless content is being edited).
- 3px colored top border identifies the modal's purpose (per identity table above).

### Sidebar filter groups
Each group is rendered with:
1. A 6px identity dot
2. The group label (uppercase, ink-500, 10.5px, tracking-wide)
3. The control body (multi-checkbox / range slider / boolean toggle / etc.)

The group label color is always `ink-500` regardless of identity — only the dot carries the identity color. This keeps the typography uniform.

### Breadcrumbs / metadata chips
- Section name → content identity (indigo-50 bg, indigo-700 text)
- Difficulty → difficulty identity (Easy=emerald, Medium=amber, Hard=rose)
- Domain → content identity
- Skill → topic identity (teal-50 bg, teal-700 text)
- All in a flex container with `gap-1.5`, no `·` separators (chips have visual breathing room).

### Tooltips
Two systems:
1. Native `title` attribute — works on hover only.
2. `data-tooltip="..."` — CSS-based, shows on hover AND focus-visible (defined in index.css).

Use `data-tooltip` for keyboard-accessible tooltips (the default for icon buttons).

### Annotation highlights
4 colors (yellow / green / blue / pink) defined as `.annotation-<color>` in index.css. Background-only, 30% opacity, no border.

### Print

`index.css` lines 246+ define a separate print stylesheet. The print system supports two paths:
1. **Single-question print** (default `P` key) — hides sidebar and list, prints the detail pane only with 0.5in padding.
2. **Worksheet print** — `PrintSet` component renders an off-screen container with all selected questions stacked plus an answer-key page; the `@media print` rules switch to show only this container.

Page-break behavior is controlled with `break-inside: avoid` on question cards. The `.print-q`, `.print-stem`, `.print-key` class family is the canonical print typography — see `index.css` for the full reference.

This is a separate design surface from the screen system. Changes to the screen tokens (font sizes, spacing) generally do NOT affect print.

## Known limitations

This system is documented as a preference, not enforced via lint. Specific gaps you should be aware of:

### Focus traps
Only `CommandPalette` implements a Tab focus trap. Other modals restore focus on close and handle Escape, but Tab can leak to the underlying page. This is a known WCAG 2.4.3 gap that should be addressed by extracting a shared `<Dialog>` primitive.

### designSystem.ts adoption
Only `IDENTITY` (via designTokens.ts) is consistently imported by production components. `DIFFICULTY`, `CONFIDENCE`, `STATUS`, `TYPE`, `SPACE`, `SURFACE`, `INTERACTIVE`, `Z` are reference tokens for new code; existing components may use equivalent inline Tailwind classes. Migration is incremental.

**ESLint enforcement** (added 2026-05-29): The `eslint.config.js` now warns on (a) inline hex color literals in components, (b) arbitrary Tailwind color brackets like `bg-[#123456]`, (c) arbitrary z-index brackets. Existing violations are exempted file-by-file (`PdfExport`, `QuestionSnapshot`, `TagSystem`, `designSystem.ts`, `designTokens.ts`); new code should use tokens.

### Font cascade
The `sans` stack lists Inter as a fallback after the Apple system fonts, but no `@font-face` declaration is shipped. On non-Apple platforms without Inter installed, the cascade falls through to system fonts. The `font-feature-settings: "ss01", "cv11"` are Inter-specific stylistic sets — they have no effect on Apple system fonts.

### Tailwind class registry for dark mode
`.dark` overrides in `index.css` map specific Tailwind utility classes (e.g., `.dark .bg-ink-50 → bg-secondary var`). Adding a new utility class used in components requires adding a matching override here, or the component won't respect dark mode. There is no automated check.

### Canvas-rendered components
`KnowledgeGraph.tsx` renders to `<canvas>` and does not pick up CSS variables. Colors are hardcoded hex literals; dark-mode rendering may have low contrast. Use `CONFIDENCE.canvasFill` / `CONFIDENCE.hex` tokens for new canvas code.

## Anti-patterns

- **Do not** introduce new colors outside the identity palette without updating this document.
- **Do not** use accent blue for non-interactive elements. Blue means "you can act here."
- **Do not** rely on color alone to convey meaning (WCAG 1.4.1). Always pair with text, icon, or pattern.
- **Do not** use 500-saturation fills as backgrounds. Use 50-tints for backgrounds and 400-saturation for markers.
- **Do not** add gradients, drop shadows beyond `shadow-card`/`shadow-modal`, or rounded corners outside `rounded-md`/`rounded-lg`/`rounded-xl`/`rounded-2xl`/`rounded-full`.
- **Do not** create animations longer than 200ms — **except** modal/drawer enter animations may use up to 240ms with iOS spring easing `cubic-bezier(0.32, 0.72, 0, 1)` to match platform conventions.

## Implementation

### Tokens are TypeScript constants
Every design token lives in `viewer/src/lib/designSystem.ts`. Components import from here:

```typescript
import { IDENTITY, DIFFICULTY, TYPE, SURFACE } from "../lib/designSystem";
```

This makes refactors searchable and gives editors autocomplete.

### Tailwind class names are values
Tokens hold Tailwind class strings, not raw hex codes. This:
- Keeps the JIT compiler happy (all classes are statically present in source).
- Lets dark mode + accessibility classes apply via CSS overrides.
- Allows search-and-replace refactors via class name.

Avoid `const color = "#3b82f6"` inline. Always go through a token.

### Adding a new identity
1. Add an entry to `IDENTITY` in `designTokens.ts`.
2. Add the identity to the `Identity` type union.
3. Update `groupIdentity()` to map the group label.
4. Document the meaning in this file's identity table.

### Adding a new filter dimension
The facet engine (`lib/facets.ts` + `lib/filterRegistry.ts`) handles UI generation automatically. Just add to the registry; the appropriate control (multi / range / boolean) renders with the matching identity color based on the `group` field.

## Audit checklist (run before PR)

- [ ] All new colors come from the identity palette
- [ ] Dark mode still works (test with `.dark` class on html)
- [ ] WCAG AA contrast on all text against backgrounds
- [ ] Focus ring visible on all interactive elements
- [ ] `data-tooltip` set on all icon-only buttons
- [ ] Modals: role, aria-modal, focus trap, Escape close
- [ ] No new fonts introduced
- [ ] No animations > 200ms (except modal/drawer entry up to 240ms with iOS spring easing)
- [ ] Reduce motion media query honored
- [ ] New modals use the `useFocusTrap` hook (or extracted Dialog primitive)
- [ ] No inline hex codes in components (ESLint will warn)
- [ ] Z-index uses Z token, not arbitrary `z-[N]` (ESLint will warn)
- [ ] Confidence colors use CONFIDENCE token (canvas/HTML export contexts use .hex / .canvasFill)

## File map

| File | Purpose |
|---|---|
| `viewer/src/lib/designSystem.ts` | Reference token catalog (IDENTITY used in production; rest is reference for new code) |
| `viewer/src/lib/designTokens.ts` | Identity colors (focused subset) |
| `viewer/src/hooks/useFocusTrap.ts` | focus trap for modals |
| `viewer/tailwind.config.js` | ink + accent palette, darkMode config |
| `viewer/src/index.css` | CSS vars, dark mode overrides, a11y modes, kbd, focus-ring, annotation colors |
| `viewer/eslint.config.js` | design rule enforcement |
| `docs/DESIGN.md` | (this file) Design system reference |
| `docs/COMPONENTS.md` | component reference catalogue |

## Recent design decisions

This log captures non-obvious decisions that shape the design system.

| Date | Decision | Rationale |
|---|---|---|
| 2026-05-29 | Adopted IDENTITY token system | Need for visual differentiation between filter groups without breaking the monochromatic aesthetic |
| 2026-05-29 | Two-mode sidebar (Basic/Advanced) | Avoid forcing depth on casual users while exposing power-user filters |
| 2026-05-29 | Aspects panel always visible in Advanced | Discoverability: previous "appears only when skill selected" hid the feature |
| 2026-05-29 | Allowed 240ms iOS-spring exception | Modal/drawer entries match platform muscle memory; flat 200ms felt abrupt |
| 2026-05-29 | designSystem.ts as reference, not enforcement | Honest about adoption: ESLint warns on new violations, existing code uses inline classes |
| 2026-05-29 | Co-located hooks with components | Single import surface (`@/components`) more ergonomic than separate `hooks/` directory for component-specific hooks |

## Roadmap

Future tokens to consider:
- Animation timing scale (subtle / standard / page)
- Form input states beyond focus (error / warning / success)
- Empty states (illustration + microcopy patterns)
- Visual regression tests (Playwright + axe-core)
- Migration of legacy hardcoded colors to tokens (incremental, ESLint-guided)
- Shared `<Dialog>` primitive to consolidate modal patterns
- Web font fallback for non-Apple platforms (Inter via @font-face)
- Canvas dark-mode support (KnowledgeGraph nodes/labels respect theme)
