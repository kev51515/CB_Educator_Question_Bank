# Re-cloning recipe

You are fixing existing flagged clones. Each input item names a clone that failed verification with a real bug (wrong_answer, rationale_inconsistent, or constraint_violation). Your job: regenerate the clone correctly, respecting the template's constraints.

## Input
A batch file at `data/sets/set-1/reclone_batches/reclone-<skill-slug>.json` — a JSON array of entries:
```jsonc
{
  "id": "abc123-s1",                        // clone questionId
  "templateId": "linear-functions.A1.T4.medium",
  "verdict": "wrong_answer",
  "detail": "Rationale says 'a=4/3=1.333 ≥ 1 so II is TRUE' but key 'a' (Neither) is wrong. Correct: 'c' (II only)."
}
```

## For each item

1. **Locate the existing clone**: `data/sets/set-1/json/**/<id>.json`. Read it to see the current (broken) state.
2. **Locate the original**: search for `<originalId>.json` under `data/json/`. Read it for the source content.
3. **Load the template**: `data/templates/<section-slug>/<skill-slug>.json`. Drill into the aspect/type/difficulty referenced in `templateId`. Note `clone_constraints.must_preserve`, `difficulty_levers[<diff>].characteristics`, and `common_bugs`.
4. **Generate a fresh clone**, preserving the original's metadata exactly and the template's constraints. **Solve the problem from scratch yourself** — don't trust the existing clone or original's answer letter.
5. **MANDATORY decimal-sanity discipline** (Math):
   - Convert every fraction to a decimal before any inequality.
   - `4/3 = 1.333` is GREATER than 1, NOT less. Restate inequalities numerically.
6. **MANDATORY rationale-key consistency check**:
   - After choosing the correct answer, write the rationale that arrives at it.
   - **Verify the keyed letter matches the option whose content is the correct answer.** This is the #1 bug in the original batch and exactly what we're fixing.
7. Add a `templateId` field (same value as input).
8. Write to disk at the same path, overwriting the broken clone.

## Critical rules

- Write each clone IMMEDIATELY after generating it. Don't batch the final writes — the watchdog kills silent agents.
- Preserve `originalId`, `setId`, `section`, `difficulty`, `difficultyCode`, `domain`, `domainCode`, `skill`, `skillCode`, `type`, `questionId`.
- Add or update `templateId` and `generatedAt` (current ISO timestamp).
- Re-randomize the option order so the correct-letter distribution doesn't bias to one letter. Track within your batch.
- Don't recycle the original's distractors verbatim — refresh them as plausible misconceptions.

## Output

Return a short report (≤120 words):
- Count fixed
- Letter distribution across MCQs in your batch (target: ≤35% per letter)
- Any items you couldn't fix (e.g., image-only Math) — leave those alone and report.
