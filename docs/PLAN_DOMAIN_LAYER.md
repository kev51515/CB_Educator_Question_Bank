# PLAN — Domain layer (vocabulary + accent theming)

Status: **planning** · 2026-06-10 · Owner decisions locked.

One **login channel**; the signed-in user is routed into a **domain-specific experience**
(vocabulary + accent color now; deeper per-domain skin later). The security model is
untouched — `profiles.role = teacher|admin|student` and all RLS stay exactly as-is. "Domain"
is a **presentation + routing layer**, not a new security role.

## Owner decisions (locked)
| Decision | Choice |
|---|---|
| Role model | **Domain layer over existing roles** (RLS untouched) |
| Domain source | **Explicit `profiles.domain`** (set at invite; self-switcher; default derived from courses) |
| Theming depth (first build) | **Vocabulary + accent color** (+ login redirect-light) |
| Scope | **Educator AND student** sides |

## Domains & vocabulary

| Domain | Course types | Educator label | Accent |
|---|---|---|---|
| `academic` | `class` | **Teacher** | indigo (current) |
| `counseling` | `counseling` | **Counselor** | **emerald** |
| `coaching` | `pickleball_player`, `pickleball_coach` | **Coach** | **orange** |

Student labels are **per course type** (a domain can hold >1):
`class`→**Student**, `counseling`→**Advisee**, `pickleball_player`→**Player**,
`pickleball_coach`→**Coach-in-training**.

`domainOf(courseType)`: class→academic · counseling→counseling · pickleball_*→coaching.

## Data model

**Migration (provisional `0171` — renumber with the whole pickleball set at the main reconcile):**
- `ALTER TABLE profiles ADD COLUMN domain text` with CHECK `domain IN ('academic','counseling','coaching')` (nullable; NULL = derive on the client).
- RPC `set_my_domain(p_domain text)` — self-update of the caller's own `profiles.domain` (stable errors). SECURITY DEFINER + `SET search_path = public, auth`; GRANT authenticated. (Self-update only — no privilege change, RLS-safe.)
- Optional helper `derive_user_domain(p_user uuid)` — returns the domain implied by the user's owned course types (coaching > counseling > academic precedence), used to seed a default.

## Frontend

- **`viewer/src/lib/domain.ts`** — `Domain` type, `DOMAIN_VOCAB` map (educator label, home noun, accent token), `studentLabel(courseType)`, `domainOf(courseType)`, accent token tables.
- **`DomainProvider` + `useDomain()`** — reads `profiles.domain` (or derives from the user's courses), sets the active domain, writes `--accent-*` CSS variables on the app root, exposes `{ domain, vocab, setDomain }`. `setDomain` calls `set_my_domain` + re-themes (the **switcher**).
- **Tailwind accent** — add an `accent` color whose shades map to the `--accent-*` CSS vars, so `accent-600`/`accent-50` etc. work and re-theme live by domain.
- **Accent application (CONSERVATIVE first pass)** — migrate ONLY the high-visibility shared chrome from hardcoded `indigo-*` to `accent-*`: the top nav/app header, the primary action button style, the active tab/nav-link indicator (`CourseTabStrip`), and the new role/domain chip. Everything else stays indigo for a later, broader pass.
- **Domain chip + switcher** in the top bar (educator + student shells): shows the current domain label; the switcher lets a multi-domain user flip active domain.
- **Login redirect (light)** — on landing, set the active domain from `profiles.domain` (or derived) and theme accordingly. A full per-domain landing page is a later step.
- **Student side** — student shell shows the per-course-type student label (Player/Advisee/…) and inherits the domain accent.

## Sequencing (IMPORTANT)

This rides on `feat/pickleball-coaching`, which is **behind `main`** (main advanced to `0159`+
while we built). Before cloud push, the branch must be **reconciled with `main`** (merge +
resolve shared-file conflicts in ClassLayout/StudentCourseView/etc. + **renumber the whole
pickleball+domain migration set above main's live head**). The domain migration is `0171`
provisionally and will be renumbered with the rest at that reconcile. **No cloud push until
the reconcile is done.**
