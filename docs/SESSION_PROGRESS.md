# Session progress — Set #1 generation, template framework, verification, reclone, regeneration

Live snapshot. Resume guide if context compacts.

## High-level state (2026-05-27 late session)

| Phase | Status | Output |
|---|---|---|
| Set #1 initial cloning (v1 recipe) | ✅ 2,767/3,444 done | `data/sets/set-1/json/` |
| Template framework (29 skills × Aspect × Type × Difficulty) | ✅ complete | `data/templates/` |
| Clone tagging (templateId on every clone) | ✅ 100% | each clone JSON has `templateId` field |
| Template-aware verification | ✅ 151/151 batches, 2,767 verified | `data/sets/set-1/_verify_report.json`, `_verify_flagged.json` |
| Triage of flagged items | ✅ done | `_triage_reclone.json` (93), `_triage_retag.json` (204), `_triage_difficulty.json` (96) |
| Re-clone of 93 real bugs | ✅ 92 fixed (1 image-only skipped) | overwrote in-place |
| Re-generation of remaining 677 R&W clones with v3 template recipe | ✅ 674 generated (3 image-only skipped) | `data/sets/set-1/template_clone_batches/` |
| Final index rebuild + validation | ✅ 3,441-entry index, balanced letter distribution | `data/sets/set-1/index.json` |
| Re-tag 204 cosmetic drifts | ⬜ optional cleanup | `_triage_retag.json` is ready |
| Documentation update | ✅ complete | this file + `SESSION_REPORT.md` |

## 🟢 SET #1 IS 99.9% COMPLETE (3,441 / 3,444)

The 3 unfinished are all image-only originals (aa95fb33, d675744f, 335bbe3e) where the rationale alone can't reconstruct the visual content. Acceptable to leave as-is or generate later with image-generation capability.

## Quality findings from verification (key facts)

- **85.8% of 2,767 clones passed all template checks** (2,374 ok).
- **Real-bug rate: 1.99%** (55 wrong_answer + rationale_inconsistent across the whole bank).
- The real bugs concentrate in 4 Math skills (linear-functions, equivalent-expressions, linear-inequalities, nonlinear-functions) and exhibit a single failure mode: **rationale-key letter mismatch**. The cloning agent edited stem coefficients, derived the correct new answer in the rationale, but left the `keys` field pointing to the original option-position letter. This is the "edit-without-recompute" pattern.
- **Cosmetic drift (204 mistags)** is dominated by aspect/type slot confusion at tagging time — not actual clone-quality issues. Easy to fix with a targeted retagger.
- **Difficulty drift (96)** is mixed: some are genuine regressions (clone simpler than original), some are just lever misses. Manual triage recommended.
- **Math is fully cloned** (1,754 clones). All remaining 677 are R&W, mostly Medium.

## The v1 → v2 → v3 cloning evolution

We learned what causes quality regressions and tightened the recipe each pass:

### v1 — original recipe (`_cloning_recipe.md` original)
- Generic "make a parallel question." No template guidance, no anti-pattern warnings.
- Produced ~85% solid clones but with concentrated 13–15% bug rate in 4 skills.

### v2 — anti-pattern hardened recipe
- Added explicit warning about edit-without-recompute (with the worked example).
- Added decimal-sanity rule: "4/3 = 1.333 > 1, NOT < 1."
- Added "no real public figures with fictional details" rule.
- Added 6-step self-verification checklist.
- Used for reclones of 93 flagged items. Result: 92/93 fixed, 1 image-only.

### v3 — template-aware recipe (`_template_clone_recipe.md`)
- Cloner reads the template's `must_preserve`, `must_vary`, `common_bugs`, `difficulty_levers`.
- Required to pick the right aspect.type slot for each clone and tag with `templateId`.
- Required to verify keys[0] points to the option whose content is the correct answer **before writing the file**.
- Currently generating the remaining 677.

## What makes a high-quality clone (distilled from this work)

A faithful clone has **six properties**, and each maps to a check our pipeline enforces:

| Property | Pipeline check |
|---|---|
| Correct math/logic | Verifier solves from scratch with decimal-sanity discipline |
| Rationale-key consistency | Verifier compares rationale's derivation to keys[0]'s option content |
| Aspect fidelity | templateId aspect matches the cognitive operation the stem demands |
| Type fidelity | templateId type matches the recurring stem structure |
| Difficulty fidelity | Clone satisfies the difficulty variant's measurable `characteristics` |
| Must-preserve compliance | Clone respects every item in `type.clone_constraints.must_preserve` |

**Negative checks** (clone must NOT do these):
- Trigger any `common_bug` listed in the template for its type
- Simplify the structural complexity to a lower difficulty band
- Drift into a different aspect (different cognitive operation)
- Use real public figures with fictional careers/credits

## Process lessons (use these in future Sets / future cloning)

1. **Distill templates BEFORE cloning, not after.** When we started, we cloned blindly. The templates' `common_bugs` perfectly predicted the bugs we found *after* the fact. A template-first approach would have routed the cloner to safeguards before generating broken clones.

2. **LLM verifiers share blindspots with LLM generators.** Our first verifier missed the planted `4/3 < 1` bug — the same bug the cloner committed. Fix: anti-pattern prompts (decimal sanity + worked example of the planted bug). Different LLM instances exhibit *correlated* failure modes; voting doesn't help, but explicit anti-pattern prompts do.

3. **Programmatic tagging covered 82% with zero LLM cost.** Templates' `example_originals` lists become free ground-truth seeds. Worth investing in for future skill catalogs.

4. **Watchdog (600s) kills long silent agents.** Splitting big batches into halves and instructing "write each clone immediately" prevents stalls. The "write-once-at-end-via-Python-script" optimization is anti-pattern for our setup.

5. **The 6-level hierarchy** (Section → Domain → Skill → Aspect → Type → Difficulty Variant) is the smallest one that makes drift detectable. Types alone are too fine. Aspects give the verifier a single cognitive-anchor question — "is this still testing what it should be testing?" — that catches the worst drifts.

6. **Two-stage tagging** (programmatic for known-original IDs, LLM for the rest) is dramatically cheaper than full-LLM tagging.

## Resume guide

### If template-aware cloning is in progress
1. Check `data/sets/set-1/template_clone_batches/` for batch files.
2. Track completion by comparing `data/sets/set-1/json/` IDs against the originals' uncloned set:
   ```bash
   python3 -c "
   import json
   from pathlib import Path
   ids = set(p.stem.replace('-s1','') for p in Path('data/sets/set-1/json').rglob('*-s1.json'))
   orig = json.load(open('data/index.json'))
   pilot = {q['id'] for q in json.load(open('data/sets/set-1/_pilot_manifest.json'))}
   left = [q['id'] for q in orig if q['id'] not in ids and q['id'] not in pilot]
   print(f'On disk: {len(ids)}, remaining: {len(left)}')
   "
   ```
3. Dispatch more subagents using `_template_clone_recipe.md`, one per remaining batch (4 parallel).

### After template-cloning completes
1. Re-run tagger on the new 677 clones (or have cloners include `templateId` themselves — recipe already requires this).
2. Run a final template-verifier pass on the new 677 clones to check quality.
3. Run `python scripts/build_set_index.py --set set-1` to refresh the index.
4. Run `python scripts/validate_set.py --scope all` for schema sanity.
5. Triage and re-process any new flagged items.

### After re-tagging
The `_triage_retag.json` list contains 204 items with verifier-suggested correct templateId. A script can apply these in bulk:
```python
# Sketch of retag.py
for item in retag_list:
    suggested_tid = parse_verifier_detail(item['detail'])
    update_clone_templateId(item['id'], suggested_tid)
```

## Key files

### Templates & taxonomy
- `data/templates/_schema.md` — schema spec for the 6-level hierarchy
- `data/templates/<section-slug>/<skill-slug>.json` — 29 distilled skill catalogs
- `data/templates/_manifests/<skill-slug>.json` — per-skill original lists (distiller input)

### Recipes (instructions to subagents)
- `data/templates/_distiller_recipe.md` — how to build a template catalog from a skill's originals
- `data/templates/_tagger_recipe.md` — how to tag a clone with templateId
- `data/templates/_template_verifier_recipe.md` — template-aware verification (with decimal-sanity)
- `data/sets/set-1/_cloning_recipe.md` — v2 cloning recipe (anti-edit-without-recompute, decimal-sanity)
- `data/sets/set-1/_reclone_recipe.md` — re-cloning recipe for fixing flagged items
- `data/sets/set-1/_template_clone_recipe.md` — **v3 template-aware cloning recipe** (current)

### Set #1 data
- `data/sets/set-1/json/` — 2,767 clones (will grow to 3,444 when complete)
- `data/sets/set-1/index.json` — viewer index
- `data/sets/set-1/batches/batch-NNN(-A|-B).json` — original cloning batches
- `data/sets/set-1/tag_batches/` — programmatic-tag overflow batches
- `data/sets/set-1/verify_batches/`, `verify_results/` — verification pipeline
- `data/sets/set-1/reclone_batches/` — per-skill reclone targets
- `data/sets/set-1/template_clone_batches/` — current v3 generation batches
- `data/sets/set-1/_verify_report.json`, `_verify_flagged.json` — verification outputs
- `data/sets/set-1/_triage_reclone.json`, `_triage_retag.json`, `_triage_difficulty.json` — triage outputs

### Scripts
- `scripts/sync.py` — robust incremental sync of original bank
- `scripts/build_set_index.py` — per-set index with per-skill numbering
- `scripts/validate_set.py` — schema + letter distribution validator
- `scripts/audit_math.py` — sympy-based programmatic math verifier (narrow, high-confidence)
- `scripts/tag_clones.py` — programmatic clone tagger
- `scripts/aggregate_verify.py` — rolls verifier outputs into report + flagged list
- `scripts/triage_flagged.py` — splits flagged items into reclone/retag/difficulty buckets

### Documentation
- `docs/SESSION_PROGRESS.md` (this file) — current state
- `docs/SESSION_REPORT.md` — comprehensive quality audit report (verification findings)
- `docs/MECHANISMS.md` — architecture (still needs template-framework section)
- `docs/PROCEDURES.md` — how to run things
- `docs/SITEMAP.md`, `LEARNINGS.md`, `README.md` — supporting docs

## Open backlog (in priority order)

1. **Finish template-aware cloning** of remaining 677 (33 batches, ~12 in flight or done).
2. **Verify the new 677** with the template-verifier (catch any new bugs early).
3. **Apply retag bulk update** for 204 cosmetic drifts.
4. **Final index rebuild + validate**.
5. **Update `docs/MECHANISMS.md`** with full template-framework architecture section.
6. (Future) **Set #2 / #3** — infrastructure is reusable as-is.
