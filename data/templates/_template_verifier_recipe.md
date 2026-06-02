# Template-aware verifier recipe

You verify clones against the constraints in their template. This is more rigorous than ad-hoc verification because the *type's* must-preserve constraints and *difficulty variant's* measurable characteristics give you a concrete checklist.

## Input
A list of clone file paths (one per line) sharing the same skill. Each clone has a `templateId` field of form `<skill-slug>.<aspectId>.<typeId>.<difficulty>`.

The template file is at `data/templates/<section-slug>/<skill-slug>.json`.

## For each clone

1. **Load template & locate Aspect.Type.Difficulty.** Parse the clone's `templateId`. Open the template file. Drill down to `aspects[].types[].difficulty_levers[difficulty]`.

2. **Solve from scratch** (Math) or **analyze stem→answer logic** (R&W). Same decimal-sanity discipline as before:
   - Convert every fraction to decimal before comparing to an integer.
   - 4/3 = 1.333 > 1. NOT < 1.
   - Restate inequalities numerically: "Is a ≥ 1? a=4/3=1.333. Is 1.333 ≥ 1? YES."

3. **Apply template checks** (in this order):

   **(a) Aspect-drift check**: Does the clone actually test the cognitive operation of its aspect? Look at the aspect's `description` and `boundary_with_other_aspects`. If the clone fits a *different* aspect better, flag `aspect_drift`.

   **(b) Type-structural check**: Does the clone's stem structure match the type's `description` and `core_skill_demand`? If it's been simplified to a different stem pattern, flag `type_drift`.

   **(c) Difficulty-lever check**: Examine the type's `difficulty_levers[<clone's difficulty>].characteristics` list. The clone should satisfy each measurable characteristic (e.g., "uses fractional coefficients," "≥3 rearrangement steps"). If multiple characteristics fail, flag `difficulty_drift` with the specific missing levers.

   **(d) must_preserve check**: For each item in `type.clone_constraints.must_preserve`, verify the clone respects it. If not, flag `constraint_violation` with the violated item.

   **(e) Answer-correctness check**: Independently solve the clone. Compare to keyed answer. If they don't match, flag `wrong_answer`.

   **(f) Rationale-consistency check**: Trace the rationale's reasoning. Does it actually lead to the keyed answer? If the rationale's intermediate values are inconsistent with the stem (common bug: agent edited stem but copied rationale), flag `rationale_inconsistent`.

## Output destination

Write a JSON array to `data/sets/set-1/verify_results/<batch-name>.json` (the same basename as the input txt file, but `.json`). The aggregator script reads these.

Also return the JSON array in your final message.

## Output format
JSON array, no prose:
```json
[
  {"id": "abc123-s1", "templateId": "linear-functions.A1.T3.medium", "verdict": "ok"},
  {"id": "xyz789-s1", "templateId": "nonlinear-equations.A3.T7.hard", "verdict": "difficulty_drift",
    "detail": "Hard variant requires fractional coefficient (lever 'uses fractional coefficients'); clone uses integer coefficients only."},
  {"id": "...", "templateId": "...", "verdict": "wrong_answer",
    "detail": "Clone has 8x in stem giving a=4/3>1, so II is TRUE. Keyed 'Neither' is wrong; correct is 'II only'."}
]
```

Verdicts:
- `ok` — passes all checks
- `aspect_drift` — clone tests a different aspect than tagged
- `type_drift` — stem structure doesn't match the type description
- `difficulty_drift` — clone doesn't satisfy measurable difficulty levers
- `constraint_violation` — violates a `must_preserve` constraint (state which)
- `wrong_answer` — keyed answer is mathematically/logically incorrect
- `rationale_inconsistent` — rationale doesn't lead to keyed answer
- `unverifiable` — can't determine from JSON alone (e.g., requires image)

## Critical rules
- DO NOT modify any clone file. Read-only verification.
- Decimal-sanity discipline applies to ALL fraction comparisons.
- Be confident in verdicts. Only `ok` if you actually verified the answer yourself and all template checks pass.
- If you encounter many issues, prioritize reporting `wrong_answer` and `rationale_inconsistent` over `difficulty_drift`.
- Output one JSON array as the final message. Nothing else.
