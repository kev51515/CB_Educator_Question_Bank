"""Triage `_verify_flagged.json` into re-tag vs re-clone buckets.

Verdicts and their triage destination:
  - wrong_answer            → re-clone (real bug)
  - rationale_inconsistent  → re-clone (rationale doesn't lead to keyed answer)
  - constraint_violation    → re-clone (clone broke a must-preserve)
  - aspect_drift            → re-tag (clone is fine, tag wrong aspect)
  - type_drift              → re-tag (clone fine, wrong type within aspect)
  - difficulty_drift        → triage (sometimes regression = re-clone, sometimes just lever miss = accept)

Outputs:
  - data/sets/set-1/_triage_reclone.json     — clones to regenerate
  - data/sets/set-1/_triage_retag.json       — clones with cosmetic tag issues
  - data/sets/set-1/_triage_difficulty.json  — difficulty drifts (manual review)
"""
from __future__ import annotations
import json
from pathlib import Path
from collections import Counter, defaultdict

ROOT = Path(__file__).resolve().parent.parent
SET = ROOT / "data" / "sets" / "set-1"

RECLONE_VERDICTS = {"wrong_answer", "rationale_inconsistent", "constraint_violation"}
RETAG_VERDICTS = {"aspect_drift", "type_drift"}
DIFFICULTY_VERDICTS = {"difficulty_drift"}


def main() -> int:
    flagged = json.loads((SET / "_verify_flagged.json").read_text())
    reclone, retag, diff = [], [], []
    by_skill = defaultdict(lambda: Counter())

    for item in flagged:
        v = item.get("verdict")
        tid = item.get("templateId", "")
        skill = tid.split(".")[0] if tid else "?"
        by_skill[skill][v] += 1
        if v in RECLONE_VERDICTS:
            reclone.append(item)
        elif v in RETAG_VERDICTS:
            retag.append(item)
        elif v in DIFFICULTY_VERDICTS:
            diff.append(item)

    (SET / "_triage_reclone.json").write_text(json.dumps(reclone, indent=2))
    (SET / "_triage_retag.json").write_text(json.dumps(retag, indent=2))
    (SET / "_triage_difficulty.json").write_text(json.dumps(diff, indent=2))

    print(f"Flagged: {len(flagged)}")
    print(f"  Re-clone   (real bugs):       {len(reclone)}")
    print(f"  Re-tag     (cosmetic drift):  {len(retag)}")
    print(f"  Difficulty (manual review):   {len(diff)}")
    print()
    print("By skill:")
    print(f"  {'skill':50s}  {'reclone':>7s} {'retag':>5s} {'diff':>4s}")
    for sk in sorted(by_skill):
        rc = sum(by_skill[sk].get(v,0) for v in RECLONE_VERDICTS)
        rt = sum(by_skill[sk].get(v,0) for v in RETAG_VERDICTS)
        df = by_skill[sk].get("difficulty_drift", 0)
        if rc + rt + df > 0:
            print(f"  {sk[:50]:50s}  {rc:>7d} {rt:>5d} {df:>4d}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
