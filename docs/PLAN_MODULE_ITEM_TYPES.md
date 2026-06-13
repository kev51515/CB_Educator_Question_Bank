# Plan — Premium module item types + grouped add picker

Owner decision (2026-06-13): expand module item types from 6 → 17 and reorganise
the add-item bar into 4 sub-tab groups so it stays scannable.

## Final taxonomy (add-item sub-tabs)

| Sub-area | Types | Status |
|---|---|---|
| **Learn** (content) | Page · Video · File · Vocabulary | new |
| **Assess** (graded) | Assignment · Practice Test · Question Set · Full-Test · Skill Drill | 4 exist, Skill Drill new |
| **Engage** (interaction) | Discussion · Goal · Live Session · Survey | new |
| **Structure** | Header · Note/Callout · Divider · Link | Header+Link exist; Note+Divider new |

The picker renders only sub-tabs that have ≥1 available type, so groups appear as
their types ship. Sub-tab choice persists per (user, class) like the current
last-type memory.

## Data-model strategy

Most new types are **inline** — no separate table. Add one column:

- `module_items.config jsonb NOT NULL DEFAULT '{}'` — per-type payload.
- Widen `module_items.item_type` CHECK as each type ships.
- Reuse the existing `url` column for Video/File/Link.

Per-type `config` / storage:

| Type | item_type | Storage |
|---|---|---|
| Page | `page` (exists) | `config.body` (markdown) |
| Video | `video` | `url` + `config.provider` (youtube/vimeo/loom) |
| File | `file` (exists) | `url` (material URL) + `config.size`/`mime` |
| Note/Callout | `note` | `config.body` (markdown) + `config.tone` (info/tip/warning) |
| Divider | `divider` | — (visual only) |
| Goal | `goal` | `config.target` (e.g. "1400 by mock #3") + `config.metric` |
| Live Session | `live_session` | `url` (meet link) + `config.starts_at`/`duration` (→ Calendar) |
| Discussion | `link`-style → reuse | links a `discussion_topic` by short_code; `config.topic_id` |
| Survey | `survey` | needs `module_item_surveys` + `survey_responses` tables |
| Vocabulary | `vocab` | needs `vocab_decks` + `vocab_cards` (+ SRS state) tables |
| Skill Drill | new assignment `kind='skill_drill'` | per-student generated set; reuses skills infra |

Renderers to touch for every new type:
- `viewer/src/teacher/modules-page/tree.tsx` — `ItemTypeIcon`, `ITEM_KIND_LABEL`, row body.
- `viewer/src/student/ModuleItemRowView.tsx` — student row.
- `viewer/src/teacher/useCourseModules.ts` — `ModuleItemType`, raw row, `select`, mapping.
- `viewer/src/student/studentCourseHelpers.ts` — `ModuleItemRow.item_type`, `config`.
- `viewer/src/student/StudentCourseView.tsx` — module_items `select` (add `config`).
- `viewer/src/teacher/modules-page/inline-add/*` — picker sub-tabs, per-type form, submit.

## Phasing (each phase ships green + pushed)

- **Phase 1 (foundation + Structure):** `config` column + item_type widen; grouped
  sub-tab picker; **Note/Callout** + **Divider** (the Header-family types). Tabs
  shown: Assess, Structure.
- **Phase 2 (Learn content):** Page, Video, File. Adds the Learn tab.
- **Phase 3 (Engage):** Goal, Discussion, Live Session (→ Calendar), Survey
  (+ response table). Adds the Engage tab.
- **Phase 4 (Premium):** Vocabulary (deck + SRS), Skill Drill (per-student
  generator + new assignment kind). The differentiators.

Phase 1 lands the architecture (config jsonb, sub-tab band, dual-renderer
pattern) so 2–4 are additive.
