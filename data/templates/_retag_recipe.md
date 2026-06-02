# Retag recipe (cosmetic-fix)

You are correcting templateId tags on clones the verifier flagged as `aspect_drift` or `type_drift`. The clone itself is correct — only the tag is in the wrong slot.

## Input
A batch file at `data/sets/set-1/retag_batches/retag-<skill-slug>.json` — entries with:
```jsonc
{
  "id": "abc123-s1",
  "templateId": "linear-functions.A1.T4.medium",  // currently-wrong tag
  "verdict": "type_drift",                       // or "aspect_drift"
  "detail": "Clone tests A3.T1 (graph reading), not A1.T4. ..."
}
```

## For each item

1. Locate the clone: `data/sets/set-1/json/**/<id>.json`. Read it.
2. Read the relevant template: `data/templates/<section>/<skill-slug>.json`.
3. Examine the clone's stem and options. Determine the correct `aspect.type.difficulty` slot:
   - First read the verifier's `detail` — it often suggests the right slot ("fits A3.T1", "belongs in T6").
   - Verify the suggestion against the template's aspect descriptions and type `description`s.
   - If the verifier's suggestion is wrong or absent, pick the best-fit aspect+type yourself.
4. Update the clone's `templateId` field to the corrected value: `<skill-slug>.<aspectId>.<typeId>.<difficulty>`.
5. **Do NOT modify any other field** in the clone. This is a tag-only fix.
6. Write the clone back to disk.

## Critical rules

- Write each clone IMMEDIATELY after re-tagging. Don't batch.
- Aspect IDs are like `A1`, `A2`. Type IDs are like `T1`, `T2`. Difficulty is `easy`/`medium`/`hard` (lowercase). Don't invent new IDs.
- If a clone genuinely fits no template type, use `<skill-slug>.misc.<difficulty>` and report.
- This is a *fix*, not regeneration — preserve every other field exactly.

## Output

Return a short report (≤100 words): count fixed, count fallback-to-misc, distribution of new aspect tags.
