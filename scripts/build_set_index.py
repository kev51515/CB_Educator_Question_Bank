#!/usr/bin/env python3
"""Build a per-set index.json. Mirrors the original build_index.py shape but
scoped to one set (data/sets/<setid>/) and adds a setId column."""
from __future__ import annotations

import argparse
import html
import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PREVIEW_MAX = 140

_BLOCK_RE = re.compile(r"<(style|script|math)\b[^>]*>.*?</\1>", re.IGNORECASE | re.DOTALL)
_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


def strip_html_to_text(s: str) -> str:
    if not s:
        return ""
    txt = _BLOCK_RE.sub(" ", s)
    txt = _TAG_RE.sub(" ", txt)
    txt = html.unescape(txt)
    txt = _WS_RE.sub(" ", txt).strip()
    return txt


def make_preview(q: dict) -> str:
    src = strip_html_to_text(q.get("stimulus") or "") or strip_html_to_text(q.get("stem") or "")
    if len(src) > PREVIEW_MAX:
        src = src[: PREVIEW_MAX - 1].rstrip() + "…"
    return src


def make_search_text(q: dict) -> str:
    parts = [
        strip_html_to_text(q.get("stem") or ""),
        strip_html_to_text(q.get("stimulus") or ""),
    ]
    return " ".join(p for p in parts if p).lower()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--set", required=True, help="Set id, e.g. set-1")
    args = ap.parse_args()

    set_dir = ROOT / "data" / "sets" / args.set
    json_dir = set_dir / "json"
    if not json_dir.exists():
        print(f"No questions at {json_dir}")
        return
    index_path = set_dir / "index.json"

    entries: list[dict] = []
    for path in sorted(json_dir.rglob("*.json")):
        try:
            q = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            print(f"skip {path}: {exc}")
            continue
        qid = q.get("questionId") or path.stem
        # Path is relative to data/sets/<setid>/, so it always starts with 'json/...'
        rel = path.relative_to(set_dir).as_posix()
        entries.append(
            {
                "id": qid,
                "setId": q.get("setId") or args.set,
                "originalId": q.get("originalId"),
                "section": q.get("section") or "",
                "difficulty": q.get("difficulty") or "",
                "domain": q.get("domain") or "",
                "skill": q.get("skill") or "",
                "type": q.get("type") or "",
                "preview": make_preview(q),
                "searchText": make_search_text(q),
                "path": rel,
            }
        )

    # Per-skill numbering, same approach as the main index
    diff_rank = {"Easy": 0, "Medium": 1, "Hard": 2}
    entries.sort(
        key=lambda e: (
            e["section"],
            e["domain"],
            e["skill"],
            diff_rank.get(e["difficulty"], 99),
            e["id"],
        )
    )
    counters: dict[tuple[str, str], int] = defaultdict(int)
    for e in entries:
        key = (e["section"], (e["skill"] or "").lower())
        counters[key] += 1
        e["number"] = counters[key]

    index_path.write_text(json.dumps(entries, indent=2), encoding="utf-8")
    print(f"Wrote {len(entries)} entries to {index_path}")


if __name__ == "__main__":
    main()
