# Skill-template distiller recipe

You are a *distiller*: given one skill from the SAT question bank, you read the originals for that skill and produce a JSON template catalog describing its recurring question types and difficulty levers.

## Input
A manifest path under `data/templates/_manifests/<skill-slug>.json` containing:
```jsonc
{
  "section": "Math",
  "domain": "Advanced Math",
  "skill": "Nonlinear equations in one variable and systems of equations in two variables",
  "originals": [
    {"id": "2c5c22d0", "path": "data/json/math/hard/advanced-math/2c5c22d0.json", "difficulty": "Hard", "type": "mcq"},
    ...
  ]
}
```

## What to do
1. Read the schema doc at `data/templates/_schema.md` first. Pay particular attention to the **Aspect → Type → Difficulty Variant** hierarchy.
2. Open every original in the manifest. Read its stem and answer options (skip the long rationale unless needed for disambiguation).
3. **Pass 1 — find Aspects (2-6 per skill).** Group originals by the *cognitive operation* they demand. Examples:
   - For "Linear equations in one variable": A1 *Solve for unknown*, A2 *Equation in context*, A3 *Analyze equation structure*, A4 *Substitute & evaluate*.
   - For "Inferences" (R&W): A1 *Predictive inference*, A2 *Causal inference*, A3 *Evaluative inference*, A4 *Scope inference*.
   The boundary test: if you can't write a one-sentence rule separating two candidate aspects, they're the same aspect — merge.
4. **Pass 2 — within each Aspect, find Types.** A type is a recurring stem pattern *inside* one aspect. Aim for 6-15 types across all aspects.
5. For each type, identify what makes a given instance Easy / Medium / Hard. Compare easy examples vs hard examples *in your specific bank* to extract concrete, measurable differences. Reference originals by ID when describing the levers.
6. Identify the *common bugs* a cloner is likely to make on each type. Think: edit-without-recompute, difficulty regression, structural-simplification. Be concrete.
7. Write the result to `data/templates/<section-slug>/<skill-slug>.json` matching the schema exactly. The structure is `aspects[].types[]` — types live inside aspects, not at the top level.

## Discovery checklist
- Have I read ≥80% of the originals before finalizing aspects and types? (For skills with >100 originals, sample widely across difficulties.)
- Have I produced 2-6 aspects? Each one with a one-sentence boundary rule against the others?
- Does each type belong to exactly one aspect?
- Does each type have at least 3 example IDs across the difficulties where it appears?
- Are my difficulty levers *measurable*? ("uses fractional coefficients," not "harder phrasing")
- Could a stranger, given only the template, recognize that a new question is a faithful instance? If not, refine.

## Output rules
- Write exactly one file: `data/templates/<section-slug>/<skill-slug>.json`. Section slug: `math` or `reading-and-writing`. Skill slug: lowercase, spaces→hyphens, strip punctuation.
- Output must be valid JSON. Validate with `python3 -m json.tool < your-file > /dev/null` before reporting done.
- Do NOT modify any other files. Do NOT write under `data/sets/`.
- Return a short report (≤150 words): which file you wrote, how many types you identified, frequency breakdown by difficulty, any originals that didn't fit cleanly.

## Anti-stall rules (this work involves reading many files)
- Read files in batches. After reading every 10-15 originals, write a partial outline of your types in your head, then continue reading. Don't read everything then start writing — the output stream watchdog kills agents that go silent.
- If the skill has >50 originals, write your template JSON incrementally: start with structure, add types as you discover them, refine as you read more.
