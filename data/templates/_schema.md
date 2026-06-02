# Skill template schema

Each skill in the question bank gets one JSON file under `data/templates/<section-slug>/<skill-slug>.json` that distills its question types and difficulty levers.

## Why
- Verify each clone is an authentic instance of a known type.
- Measure variation along documented dimensions (not vibes).
- Drive future cloning with a structured spec, not just "tests the same skill."

## Hierarchy

```
Section → Domain → Skill → Aspect → Type → Difficulty Variant
```

- **Section / Domain / Skill** — official College Board categorization.
- **Aspect** — the cognitive grouping inside a skill. *What is the student actually doing?* Each skill has 2-6 aspects. Two questions in the same aspect demand the same kind of mental operation, even if their stems look very different.
- **Type** — a recurring stem-and-task pattern *inside* an aspect. A type captures surface structure: e.g., "factor and find one root," "discriminant for parameter," "graph-described intersection."
- **Difficulty Variant** — Easy / Medium / Hard within a type, governed by measurable levers.

A clone is faithful only if it preserves the **Aspect** (same cognitive demand), preserves the **Type** (same stem pattern), and matches the **Difficulty Variant** levers. A clone that drifts across aspects is a *categorical* error and should be flagged.

## Schema

```jsonc
{
  "section": "Math" | "Reading and Writing",
  "domain": "...",
  "skill": "...",                       // exact string from the original index
  "originals_count": 154,
  "aspects": [
    {
      "id": "A1",
      "name": "Short label (2-5 words)",
      "description": "1-2 sentences: what cognitive operation defines this aspect, and how it differs from other aspects of this skill.",
      "boundary_with_other_aspects": "Optional 1-sentence note clarifying drift risk, e.g., 'A2 differs from A1 in that A2 requires interpreting the equation in a real-world context; producing a context-free clone is a categorical drift.'",
      "types": [
        {
          "id": "T1",
          "name": "Short human-readable label (3-6 words)",
          "description": "1-2 sentence summary of the recurring stem structure.",
          "core_skill_demand": "What cognitive operation the student must perform — be specific. Not 'solve a quadratic' but 'apply the discriminant condition for no real solution and identify the largest integer satisfying b² < 4ac'.",
          "example_originals": ["<originalId>", "<originalId>", "..."],   // ≤ 6 ids
          "frequency": { "easy": N, "medium": N, "hard": N },
          "difficulty_levers": {
            "easy":   { "characteristics": ["...", "..."], "example_stem": "abridged stem text", "example_ids": ["..."] },
            "medium": { "characteristics": ["...", "..."], "example_stem": "abridged stem text", "example_ids": ["..."] },
            "hard":   { "characteristics": ["...", "..."], "example_stem": "abridged stem text", "example_ids": ["..."] }
          },
          "clone_constraints": {
            "must_preserve": ["specific structural feature", "..."],
            "must_vary":     ["specific surface feature",   "..."],
            "common_bugs":   ["concrete failure mode observed or predicted", "..."]
          }
        }
      ]
    }
  ],
  "skill_wide_notes": "Optional cross-cutting observations: e.g., 'all hard items have at least one rearrangement step before solving.'"
}
```

## Rules for aspect discovery
- An **aspect** captures one cognitive operation inside the skill. The test: if you handed a student a question and could only tell them the aspect (not the type or stem), would they know what *kind of thinking* to bring to it?
- Aim for **2-6 aspects per skill**. Skills with high cognitive variety (e.g., Inferences) may have more aspects; narrow procedural skills (e.g., Percentages) may have fewer.
- Aspects must be **mutually exclusive at the question level** — a single question belongs to exactly one aspect. (Types within an aspect can overlap; aspects cannot.)
- If you can't articulate the boundary between two aspects in one sentence, they're probably the same aspect.

## Rules for type discovery
- A **type** is a recurring stem-and-task combination inside one aspect. Two questions are the same type if they require the same chain of cognitive operations *and* the same stem structure.
- Aim for **6-15 types per skill** total (across all aspects). Too few = bucketing distinct cognitive demands. Too many = overfitting on surface variation.
- Every original must fit into at least one type. Use a `Tn-misc` bucket only if absolutely necessary (≤ 5% of originals).
- Difficulty levers must be **measurable**: "uses fractional coefficients," "requires ≥2 rearrangement steps," "involves a variable in the denominator." Not "feels harder."
- Common bugs are concrete: "agent might simplify hard structure to easier form" not "watch out for mistakes."

## How clones use this
- A clone is tagged with `templateId: "A2.T3.hard"` etc. in its JSON.
- The verifier checks three things:
  1. **Aspect drift** — does the clone still test the same aspect? E.g., a clone of an A2 "context word problem" that turns into an A1 "context-free solve" is a categorical error.
  2. **Type drift** — does the clone's stem structure match the type's `description`?
  3. **Difficulty drift** — does the clone's stem match the difficulty variant's `characteristics`? If the template says "≥3 rearrangement steps" and the clone has 1, flag as `difficulty_drift`.
- The cloning recipe can require: "produce a clone in aspect Ai, type Tj, at difficulty Dk that respects all `must_preserve` constraints and varies along `must_vary`."
