"""Normalize case-duplicate skill names across all question JSONs.

For each skill, picks the most-common case variant as canonical and rewrites
the rare variants. Re-runnable safely.
"""
from __future__ import annotations
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
JSON_DIR = ROOT / "data" / "json"


def main() -> None:
    # Pass 1: count case variants
    by_lower: dict[str, Counter[str]] = {}
    for p in JSON_DIR.rglob("*.json"):
        try:
            q = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        s = q.get("skill") or ""
        if not s:
            continue
        by_lower.setdefault(s.lower(), Counter())[s] += 1

    canonical: dict[str, str] = {}
    for low, counts in by_lower.items():
        canonical[low] = counts.most_common(1)[0][0]

    # Pass 2: rewrite files whose skill is not already canonical
    rewrote = 0
    for p in JSON_DIR.rglob("*.json"):
        try:
            q = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        s = q.get("skill") or ""
        if not s:
            continue
        canon = canonical[s.lower()]
        if s != canon:
            q["skill"] = canon
            p.write_text(json.dumps(q, indent=2), encoding="utf-8")
            rewrote += 1
    print(f"normalized {rewrote} files; canonical map has {len(canonical)} unique skills")


if __name__ == "__main__":
    main()
