"""Aggregate verifier outputs into a flagged-list report.

Reads `data/sets/set-1/verify_results/*.json` (one per dispatched batch, each a
JSON array of {id, templateId, verdict, detail?}) and produces:

  - data/sets/set-1/_verify_report.json  — summary with counts by verdict
  - data/sets/set-1/_verify_flagged.json — list of items needing attention
"""
from __future__ import annotations
import json
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
SET = DATA / "sets" / "set-1"

VERDICT_PRIORITY = [
    "wrong_answer",
    "rationale_inconsistent",
    "constraint_violation",
    "aspect_drift",
    "type_drift",
    "difficulty_drift",
    "weak_distractor",
    "unverifiable",
    "ok",
]


def main() -> int:
    results_dir = SET / "verify_results"
    if not results_dir.exists():
        print(f"FAIL: {results_dir} missing")
        return 2

    by_verdict = Counter()
    by_skill = defaultdict(Counter)
    flagged = []
    total = 0
    for p in sorted(results_dir.glob("*.json")):
        try:
            items = json.loads(p.read_text())
        except Exception:
            print(f"WARN: skipping malformed {p.name}")
            continue
        if not isinstance(items, list):
            continue
        for it in items:
            cid = it.get("id")
            verdict = it.get("verdict", "unknown")
            total += 1
            by_verdict[verdict] += 1
            tid = it.get("templateId", "")
            skill = tid.split(".")[0] if tid else "?"
            by_skill[skill][verdict] += 1
            if verdict != "ok" and verdict != "unverifiable":
                flagged.append(it)

    summary = {
        "total_verified": total,
        "by_verdict": dict(by_verdict.most_common()),
        "by_skill": {k: dict(v.most_common()) for k, v in by_skill.items()},
    }
    (SET / "_verify_report.json").write_text(json.dumps(summary, indent=2))
    (SET / "_verify_flagged.json").write_text(json.dumps(flagged, indent=2))

    print(f"Verified: {total}")
    for v in VERDICT_PRIORITY:
        n = by_verdict.get(v, 0)
        if n:
            print(f"  {v:24s}: {n}")
    print(f"\nFlagged for re-clone: {len(flagged)}")
    print(f"Reports written to {SET.relative_to(ROOT)}/_verify_{{report,flagged}}.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
