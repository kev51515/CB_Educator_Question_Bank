"""One-shot migration: copy raw.stimulus → top-level stimulus on each question JSON."""
from __future__ import annotations
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
JSON_DIR = ROOT / "data" / "json"


def main() -> None:
    updated = 0
    skipped = 0
    for path in JSON_DIR.rglob("*.json"):
        try:
            with path.open("r", encoding="utf-8") as f:
                q = json.load(f)
        except (json.JSONDecodeError, OSError):
            continue
        raw = q.get("raw", {}) or {}
        stim = raw.get("stimulus")
        if not stim:
            skipped += 1
            continue
        if q.get("stimulus") == stim:
            skipped += 1
            continue
        q["stimulus"] = stim
        path.write_text(json.dumps(q, indent=2), encoding="utf-8")
        updated += 1
    print(f"updated {updated}, skipped {skipped}")


if __name__ == "__main__":
    main()
