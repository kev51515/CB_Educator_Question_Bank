# Set #1 verifier recipe

You are a Set #1 *verifier*, not a generator. Your job: read existing clones and report errors. Do NOT modify any clone files. Do NOT regenerate clones.

## Input
A list of clone file paths (relative to repo root), one per line, e.g.:
```
data/sets/set-1/json/math/hard/advanced-math/4dd4efcf-s1.json
data/sets/set-1/json/math/medium/algebra/092ad67d-s1.json
...
```

## For each clone — MANDATORY VERIFICATION PROCEDURE

1. Read the clone JSON.

2. Solve the problem from scratch in writing (Markdown notepad in your scratch space). Do NOT skip steps mentally — write them out.

3. **Convert every fraction to a decimal and write the decimal next to it.** Example: when you compute `a = 4/3`, write:
   > `a = 4/3 = 1.333...`
   Never reason about whether a fraction is greater-than or less-than an integer using just the fraction form — always compute the decimal first. This is the #1 failure mode for LLMs verifying SAT math, including yours.

4. **For every inequality check in the rationale or your own derivation, restate it numerically before deciding:**
   - "Is a ≥ 1? a = 4/3 = 1.333. Is 1.333 ≥ 1? YES → II is TRUE."
   - "Is c < 0? c = 12 + k with k < 0. If k = -5, c = 7 > 0. So c < 0 is NOT necessarily true → I is FALSE."
   Catch yourself if you typed "4/3 < 1" — that is **wrong**. 4/3 = 1.333 > 1.

5. **Decimal sanity rule**: any time the numerator of a fraction is larger than the denominator (e.g., 3/2, 5/4, 7/3, 4/3, 11/8), the fraction is GREATER than 1. Any time the numerator is smaller (1/2, 2/3, 3/4), it is LESS than 1. State this explicitly when you encounter such a fraction.

6. Compare your derived answer to the keyed answer.
   - For MCQ: does your derived answer match the option text marked by `keys[0]`?
   - For SPR: does your derived answer equal `keys[0]` (after normalizing for fractions/decimals)?

7. Inspect the rationale: does its arithmetic actually lead to the keyed answer? Common bug: agent changed a number in the stem but copied original's rationale, so the rationale's intermediate values don't match the new stem. Specifically: if the rationale contains a comparison like "X < 1" or "X ≥ 0", run the decimal-sanity check on it.

8. Check distractor quality: are the 4 MCQ options plausible (results of common mistakes) or are some absurd?

9. For R&W: does the stimulus support the keyed answer logically? Does the keyed answer match the stated skill (e.g., "Inferences" vs "Words in Context")?

## Worked example of a planted bug (study this before starting)

Clone stem (paraphrased): `g(x) = ax² + 8x + c`. Parabola opens upward, vertex (h, k), k < 0, g(−7) = g(1). Which must be true? I. c < 0   II. a ≥ 1. Choices: (a) Neither, (b) I only, (c) II only, (d) Both.

Keyed answer: **(a) Neither**.

**Wrong analysis** (the bug — the cloner AND the first verifier both made this):
> Axis of symmetry x = −3. Vertex form a(x+3)² + k = ax² + 6ax + 9a + k. Matching 6a = 8 → a = 4/3. **4/3 < 1**, so II false. Neither holds. Key (a) correct.

**Correct analysis**:
> a = 4/3. **Decimal check: 4/3 = 1.333. Is 1.333 ≥ 1? YES. So II is TRUE.**
> c = 9a + k = 12 + k. k < 0 only tells us c < 12 — not c < 0 (e.g., k = −1 gives c = 11 > 0).
> So I is NOT necessarily true, II IS necessarily true. Correct answer should be **(c) II only**.
> Verdict: `wrong_answer`.

This exact bug is somewhere in the batches you'll verify. Catch it.

## Output format
Return ONLY a JSON array, no prose. One object per file inspected:
```json
[
  {"id": "4dd4efcf-s1", "verdict": "wrong_answer",
   "detail": "Clone has 8x in stem so a = 4/3 ≥ 1, making statement II true. Key 'a' (Neither) is wrong; correct is 'c' (II only). Rationale incorrectly states '4/3 < 1'."},
  {"id": "092ad67d-s1", "verdict": "ok"},
  {"id": "1fe32f7d-s1", "verdict": "ok"},
  {"id": "abc123-s1", "verdict": "weak_distractor",
   "detail": "Option (a) is 10× the correct answer with no plausible derivation."}
]
```

Verdict values:
- `ok` — clone passes all checks
- `wrong_answer` — keyed answer is mathematically/logically incorrect
- `rationale_inconsistent` — rationale's reasoning doesn't lead to keyed answer
- `difficulty_drift` — clone is noticeably easier/harder than its difficulty label
- `weak_distractor` — one or more distractors are implausibly bad
- `unverifiable` — can't determine correctness from the JSON alone (e.g., requires image)

## Critical rules
- DO NOT write to any file under `data/sets/set-1/json/`.
- DO NOT call any other scripts.
- Return your JSON array as the final message. Nothing else.
- If you encounter many issues, prioritize reporting `wrong_answer` and `rationale_inconsistent` over style nits.
- Be confident in your verdicts. Only mark `ok` if you've actually verified the answer yourself.
