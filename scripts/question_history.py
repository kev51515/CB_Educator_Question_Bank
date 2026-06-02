#!/usr/bin/env python3
"""Show change history for a question by comparing it to backups.

Usage: python scripts/question_history.py <question_id>

Reads from data/.history/ (created by sync.py if changes are detected).

History layout (expected):
  data/.history/
    <questionId>.<updateDate>.json   # snapshot taken before overwrite

If data/.history/ doesn't exist, this script prints instructions for enabling
history tracking in sync.py.
"""

from __future__ import annotations

import argparse
import difflib
import json
import re
import sys
from pathlib import Path
from typing import List, Optional, Tuple

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"
HISTORY_DIR = DATA_DIR / ".history"
JSON_DIR = DATA_DIR / "json"


_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


def strip_html(text: str) -> str:
    if not text:
        return ""
    text = _TAG_RE.sub(" ", text)
    return _WS_RE.sub(" ", text).strip()


# ─────────────────────────────── lookups ─────────────────────────────


def find_current(question_id: str) -> Optional[Path]:
    if not JSON_DIR.exists():
        return None
    for path in JSON_DIR.rglob(f"{question_id}.json"):
        return path
    # Fall back to scanning JSON for matching questionId field
    for path in JSON_DIR.rglob("*.json"):
        try:
            with path.open("r", encoding="utf-8") as fh:
                obj = json.load(fh)
        except (OSError, json.JSONDecodeError):
            continue
        if isinstance(obj, dict) and obj.get("questionId") == question_id:
            return path
    return None


def find_history_snapshots(question_id: str) -> List[Path]:
    if not HISTORY_DIR.exists():
        return []
    snaps = sorted(HISTORY_DIR.glob(f"{question_id}.*.json"))
    return snaps


def load_json(path: Path) -> Optional[dict]:
    try:
        with path.open("r", encoding="utf-8") as fh:
            obj = json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"warning: failed to read {path}: {exc}", file=sys.stderr)
        return None
    return obj if isinstance(obj, dict) else None


# ─────────────────────────────── diffing ─────────────────────────────


_DIFFABLE_FIELDS = ("stem", "stimulus", "rationale", "difficulty", "skill", "domain")


def diff_questions(older: dict, newer: dict, label_older: str, label_newer: str) -> str:
    lines: List[str] = []
    lines.append(f"=== {label_older}  →  {label_newer}")
    for field in _DIFFABLE_FIELDS:
        a = strip_html(str(older.get(field, "") or ""))
        b = strip_html(str(newer.get(field, "") or ""))
        if a == b:
            continue
        lines.append(f"\n--- {field} ---")
        diff = difflib.unified_diff(
            a.splitlines() or [""],
            b.splitlines() or [""],
            fromfile=label_older,
            tofile=label_newer,
            n=1,
            lineterm="",
        )
        diff_lines = list(diff)
        if diff_lines:
            lines.extend(diff_lines)
        else:
            lines.append(f"  {label_older}: {a[:200]}")
            lines.append(f"  {label_newer}: {b[:200]}")
    if len(lines) == 1:
        lines.append("(no diff-able field changes)")
    return "\n".join(lines)


# ─────────────────────────────── messaging ───────────────────────────


HISTORY_NOT_ENABLED_MSG = """\
History tracking is not enabled.

Expected directory: {history_dir}

To enable history tracking, modify scripts/sync.py so that before any
question file is overwritten, the previous version is copied into
data/.history/ keyed by questionId and updateDate.
"""


def print_history_not_enabled() -> None:
    print(HISTORY_NOT_ENABLED_MSG.format(history_dir=HISTORY_DIR))


# ─────────────────────────────── main ────────────────────────────────


def parse_snapshot_name(path: Path) -> Tuple[str, str]:
    """Return (questionId, updateDate-tag) from filename."""
    stem = path.stem  # <qid>.<updateDate>
    parts = stem.split(".", 1)
    if len(parts) != 2:
        return (stem, "")
    return (parts[0], parts[1])


def main(argv: List[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("question_id", help="The questionId to inspect")
    args = parser.parse_args(argv)
    qid: str = args.question_id

    if not HISTORY_DIR.exists():
        print_history_not_enabled()
        return 0

    snapshots = find_history_snapshots(qid)
    current_path = find_current(qid)

    if not snapshots and not current_path:
        print(f"No history or current data found for question {qid}.")
        return 1

    if not snapshots:
        print(f"Current data found for {qid} but no history snapshots in {HISTORY_DIR}.")
        return 0

    print(f"Question: {qid}")
    print(f"History snapshots: {len(snapshots)}")
    for s in snapshots:
        _, tag = parse_snapshot_name(s)
        print(f"  • {tag}  ({s.name})")

    print()

    # Build the chronological version list: snapshots (oldest → newest), then current
    versions: List[Tuple[str, dict]] = []
    for snap in snapshots:
        obj = load_json(snap)
        if obj is None:
            continue
        _, tag = parse_snapshot_name(snap)
        versions.append((tag or snap.name, obj))

    if current_path:
        current_obj = load_json(current_path)
        if current_obj is not None:
            versions.append(("current", current_obj))

    if len(versions) < 2:
        print("Only one version on file; nothing to diff.")
        return 0

    for i in range(len(versions) - 1):
        label_a, obj_a = versions[i]
        label_b, obj_b = versions[i + 1]
        print(diff_questions(obj_a, obj_b, label_a, label_b))
        print()

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))


# ─────────────────────────────────────────────────────────────────────
# To enable history tracking, before overwriting a question file in sync.py,
# add: shutil.copy2(existing_path, history_dir / f"{qid}.{updateDate}.json")
#
# Suggested integration sketch (do NOT paste this into sync.py as-is — adapt
# variable names to whatever sync.py uses for the existing path and update
# timestamp):
#
#     from pathlib import Path
#     import shutil
#
#     HISTORY_DIR = Path("data/.history")
#     HISTORY_DIR.mkdir(parents=True, exist_ok=True)
#
#     # inside the change-detection branch, before write_atomic(existing_path, new_payload):
#     if existing_path.exists():
#         old_update = existing_payload.get("updateDate") or "unknown"
#         shutil.copy2(existing_path, HISTORY_DIR / f"{qid}.{old_update}.json")
# ─────────────────────────────────────────────────────────────────────
