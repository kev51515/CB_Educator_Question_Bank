# Clone-tagger recipe

You assign each clone a `templateId` based on its skill's template catalog.

## Input
- A batch file: `data/sets/set-1/tag_batches/tag-<skill-slug>.json` — list of {path, originalId, difficulty} entries.
- The template: `data/templates/<section-slug>/<skill-slug>.json` — has `aspects[].types[].difficulty_levers`.

## What to do
1. Read the template once. Note each aspect's description and each type's `description`, `core_skill_demand`, and `difficulty_levers[easy|medium|hard].characteristics`.
2. For each clone in the batch:
   a. Read the clone JSON.
   b. Determine which **aspect** the clone tests, using the template's aspect descriptions and boundaries.
   c. Within that aspect, determine which **type** the clone fits, based on stem structure.
   d. Use the clone's `difficulty` field for the difficulty variant (lowercase: easy/medium/hard).
   e. Construct `templateId` = `<skill-slug>.<aspectId>.<typeId>.<difficulty>` — e.g. `linear-functions.A1.T3.medium`.
   f. Write the clone back to disk with the new `templateId` field (preserve all other fields).
3. After every 10 clones, output a short progress line ("tagged 10/47…") to keep the stream active.

## Critical rules
- Write each clone back IMMEDIATELY after determining its tag. Don't batch writes at the end — the watchdog kills silent agents.
- The skill-slug part of templateId is the FILE NAME of the template (e.g. `nonlinear-functions`, not `Nonlinear functions`).
- Aspect IDs are like `A1`, `A2`, etc. Type IDs are like `T1`, `T2`, etc. Don't invent new IDs — pick from the template.
- If a clone genuinely doesn't fit any aspect (rare), tag it with `<skill-slug>.misc.<difficulty>` and note it in your report.
- Do NOT modify any other field in the clone JSON. Just add `templateId`.

## Output
- Modified clone JSONs on disk (each with a new `templateId`).
- A short final report (≤120 words):
  - count tagged, count fallback-to-misc (if any), distribution across aspects.
