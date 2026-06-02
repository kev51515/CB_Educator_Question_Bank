# Template-aware cloning recipe (v3)

You clone original SAT questions into Set #1 variants, this time **constrained by a skill template**. Quality is dramatically higher when you respect the template's `must_preserve` and `difficulty_levers`.

## Input
A batch file at `data/sets/set-1/template_clone_batches/clone-<batch-name>.json` — a JSON array of entries:
```jsonc
{
  "originalId": "abc123",
  "originalPath": "json/reading-and-writing/medium/expression-of-ideas/abc123.json",
  "skillSlug": "rhetorical-synthesis",
  "templateBase": "rhetorical-synthesis.A2.T4",  // your assigned aspect.type slot (predicted from original)
  "difficulty": "medium"
}
```

## For each entry

1. **Read the original**: `data/<originalPath>`. Capture metadata, stem, options/keys, rationale.
2. **Read the template**: `data/templates/<section-slug>/<skillSlug>.json`. Drill into the aspect/type referenced in `templateBase`.
3. **Note the constraints** for this specific (type, difficulty):
   - `clone_constraints.must_preserve` (structural features you must keep)
   - `clone_constraints.must_vary` (surface features you should change)
   - `clone_constraints.common_bugs` (specific failure modes to avoid)
   - `difficulty_levers[<difficulty>].characteristics` (what makes this difficulty band)
4. **Generate the clone** with these properties:
   - Preserve everything in `must_preserve`
   - Vary everything in `must_vary` (don't recycle original wording)
   - Don't trigger any pattern in `common_bugs`
   - Match every characteristic in `difficulty_levers[<difficulty>]`
5. **MANDATORY rationale-key consistency check** (Math): after solving from scratch, verify `keys[0]` points to the option whose content is the correct answer.
6. **MANDATORY decimal-sanity** (Math): 4/3 = 1.333 > 1, NOT < 1.
7. **R&W register parity**: match the original passage's word count (±25%) and academic register.
8. **No real public figures with fictional details**: use clearly invented names, or only use verifiable facts about real people.
9. Write the clone to disk at `data/sets/set-1/json/<section-slug>/<difficulty>/<domain-slug>/<originalId>-s1.json`, mirroring the original's folder layout. Add `templateId: "<skillSlug>.<aspectId>.<typeId>.<difficulty>"` field.

## Schema (clone JSON)
```jsonc
{
  "questionId": "abc123-s1",
  "originalId": "abc123",
  "setId": "set-1",
  "section": "...",
  "difficulty": "...",
  "difficultyCode": "...",
  "domain": "...",
  "domainCode": "...",
  "skill": "...",
  "skillCode": "...",
  "type": "mcq" | "spr",
  "templateId": "rhetorical-synthesis.A2.T4.medium",
  "stimulus": "<p>...</p>",     // R&W only, null for Math
  "stem": "<p>...</p>",
  "answerOptions": [{"id":"a","content":"<p>...</p>"}, ...],   // MCQ only
  "keys": ["c"],
  "rationale": "<p>...</p>",
  "generatedAt": "2026-05-27T...Z"
}
```

## Critical rules

- Write each clone IMMEDIATELY after generating it. No batched final writes.
- Across MCQs in your batch, distribute correct-letter approximately uniformly (≤35% per letter). Clone-letter ≠ original-letter at least 70% of the time.
- Skip image-only Math (graphs the rationale can't reconstruct) — report as "skipped: image-only".

## Output
Return a short report (≤120 words):
- Count written / count skipped
- Letter distribution across MCQs in your batch
- Per-template-slot count (which aspects/types you produced)
