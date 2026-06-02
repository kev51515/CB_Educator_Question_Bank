# Set #1 cloning recipe

## What "Set #1" means
A clone of an original question that tests the SAME skill at the SAME difficulty but with different surface content — different numbers, different names, different scenario. A student who knows the underlying concept should solve both equally easily; a student who memorized the original answer should NOT be able to skate by on the clone.

## Input
A batch manifest at `data/sets/set-1/batches/batch-NNN.json` — a JSON list of entries like:
```json
[{ "id": "789975b7", "path": "json/math/easy/algebra/789975b7.json", "section": "Math", "difficulty": "Easy", "domain": "Algebra", "skill": "Linear equations in two variables", "type": "mcq" }, ...]
```

## What to do for each entry
1. Read the original JSON at `data/<path>` from the manifest.
2. Generate a parallel variant:
   - **Math**: change the numbers (use different clean values), change variable names sometimes (x→y, a→b), change the narrative context if it's a word problem (gardener → florist, two stores → two factories) — but preserve the algebraic/geometric structure exactly. Difficulty must feel identical.
   - **R&W passages (questions with `stimulus`)**: write a NEW passage of similar length, register, and reading-skill demand. Same skill: e.g. "Words in Context" needs a blank to fill; "Cross-Text Connections" needs two texts; "Inferences" needs a paragraph from which a logical inference can be drawn. Test the same exact reading micro-skill.
   - **R&W rhetorical / grammar**: change the underlying sentence(s) while preserving the same grammatical or rhetorical decision. Transitions → new sentence pair requiring the same kind of transition. Boundaries → new sentence requiring the same punctuation decision.
3. Generate matching answer options (4 plausible distractors for MCQ; the literal answer for SPR) and a correct-answer key. Re-derive the rationale — don't copy the original.
4. Preserve all metadata: `section`, `difficulty`, `domain`, `skill`, `type`, `difficultyCode`, `domainCode`, `skillCode`. The clone's `questionId` is the original id + `-s1` suffix.
5. Write to `data/sets/set-1/json/<section-slug>/<difficulty-slug>/<domain-slug>/<original-id>-s1.json` mirroring the original's folder layout exactly. The folder slugs are lowercase, spaces→`-`, like `reading-and-writing/easy/standard-english-conventions/`. To get them right, just preserve the same folder structure as the original file's path.
6. Schema:
```jsonc
{
  "questionId": "789975b7-s1",
  "originalId": "789975b7",
  "setId": "set-1",
  "section": "Math",
  "difficulty": "Easy",
  "difficultyCode": "E",
  "domain": "Algebra",
  "domainCode": "H",
  "skill": "Linear equations in two variables",
  "skillCode": "H.C.",
  "type": "mcq",
  "stimulus": null,
  "stem": "<p>...new question HTML, can use MathML or plain HTML...</p>",
  "answerOptions": [
    {"id": "a", "content": "<p>...</p>"},
    {"id": "b", "content": "<p>...</p>"},
    {"id": "c", "content": "<p>...</p>"},
    {"id": "d", "content": "<p>...</p>"}
  ],
  "keys": ["b"],
  "rationale": "<p>...new rationale explaining why the new key is correct and others wrong...</p>",
  "generatedAt": "<UTC ISO timestamp>"
}
```

## Rules for fidelity
- **Math correctness — MANDATORY two-pass**: every clone must have a verifiable correct answer. After writing the clone, treat the stem as a fresh problem and **solve it from scratch** ignoring any reference to the original. Only then mark the matching letter. Never assume that because you changed numbers from the original by a clean factor, the answer "becomes the analog" — re-derive every time.
- **DANGER PATTERN — edit-without-recompute**: if the original stem has `f(x) = ax² + 4x + c` and asks "which must be true: I. c<0, II. a≥1" (with answer "Neither" because a = 2/3 < 1), and you change `4x` → `8x` in the clone, the answer **changes to "II only"** because now a = 4/3 ≥ 1. Many similar problems have answer-flips hidden inside the same surface structure. Always recompute.
- **Distractors as common errors**: distractors should encode plausible mistakes — sign errors, off-by-one, swapped operations, mis-applied formulas. Avoid distractors that are obviously absurd (e.g. an answer 100x larger than the right one with no derivation that would lead there).
- **Difficulty calibration**: difficulty must feel identical to the original. For Math, the *structural complexity* matters more than the *magnitude of numbers* — what makes a problem Hard is the number of steps, the presence of fractions / algebraic manipulation / abstract constants, the need to rearrange before solving, not whether a constant is 7 vs 700. **Anti-pattern**: simplifying `y = x² + 3x − 7` and `y − 5x + 8 = 0` to `y = x²` and `y = 2x − 1` — same skill, but visibly easier. **Good pattern**: preserve structure, change constants. If the original uses fractional or compound coefficients (e.g. `9/2 x + 5y = 22`), the clone should too.
- **MathML / HTML**: don't be precious about MathML. Plain HTML with inline text math (e.g. `<p>If 3x + 5 = 17, what is x?</p>`) is acceptable. The viewer renders both fine.
- **R&W difficulty**: pitch the new passage at the right reading level. "Easy" ≈ 5th–8th grade vocabulary, single straightforward idea. "Medium" ≈ 9th–10th grade. "Hard" ≈ 11th–12th, denser argumentation, more advanced vocabulary.
- **R&W register parity**: match the *paragraph length, sentence complexity, and topical density* of the original. A "Hard" R&W stimulus is typically 75-150 words of dense academic prose. Don't write a 40-word easy stimulus and label it Hard.
- **No real public figures with fictional details**: avoid attaching real authors / scientists / artists to invented careers, employers, books, or claims. Either use a clearly invented name ("the linguist Tomás Reyes") or, if you must use a real person, only use verifiable facts about them. This protects students from picking up false trivia.
- **Don't preserve the original's wording verbatim** — that defeats the purpose. The clone should look freshly written.
- **CRITICAL — answer-letter randomization**: across the whole batch, distribute correct-answer letters approximately uniformly across a/b/c/d. Don't let any single letter exceed ~35% of MCQ answers. And specifically: the clone's correct-answer LETTER should match the original's letter no more than ~30% of the time. Track this as you go and intentionally re-shuffle distractor order to break the pattern when you notice it forming.

## Self-verification checklist (run before writing each clone)
1. Did I solve the new problem from scratch, not by analogy to the original? (Math)
2. Does the rationale's arithmetic actually arrive at the keyed letter, with no inconsistencies? (Math)
3. Is the surface complexity (number of steps, types of operations, vocabulary level) comparable to the original?
4. For R&W: does the stimulus match the original's word-count and reading register?
5. Does the keyed answer logically follow from my rationale (not the original's rationale)?
6. Are all 4 distractors plausible misconceptions, not obvious nonsense?

## Don't
- Don't modify the original files under `data/json/`.
- Don't run any other scripts.
- Don't write any files outside `data/sets/set-1/json/`.

## When you're done
Return a SHORT report (<150 words):
- How many of the batch you successfully wrote (target: 50/50).
- A letter-distribution count across MCQs in your batch (e.g. `a=12 b=13 c=11 d=14`).
- Any cases where you couldn't generate a faithful clone (e.g., questions whose images you can't replace).
- That's it. Don't paste excerpts. Don't list filenames.
