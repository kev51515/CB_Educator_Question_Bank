#!/usr/bin/env python3
"""Build a flat data/index.json from data/json/**/*.json question files.

Includes a short text preview (stimulus for R&W passages, stem for Math) so the
viewer can show meaningful list subtitles without fetching each question.
"""
from __future__ import annotations

import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
JSON_DIR = DATA_DIR / "json"
INDEX_PATH = DATA_DIR / "index.json"

PREVIEW_MAX = 140  # ~2 lines in the list column at 12.5px


_MATH_RE = re.compile(
    r'<math\b[^>]*?\balttext="([^"]*)"[^>]*>.*?</math>',
    re.IGNORECASE | re.DOTALL,
)
_BLOCK_RE = re.compile(r"<(style|script)\b[^>]*>.*?</\1>", re.IGNORECASE | re.DOTALL)
_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


def strip_html_to_text(s: str) -> str:
    """Replace <math> with alttext, strip <style>/<script>, then tags, collapse whitespace."""
    if not s:
        return ""
    txt = _MATH_RE.sub(r" \1 ", s)
    # Strip any remaining <math> blocks that lack alttext
    txt = re.sub(r"<math\b[^>]*>.*?</math>", " ", txt, flags=re.IGNORECASE | re.DOTALL)
    txt = _BLOCK_RE.sub(" ", txt)
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
    """Plaintext blob for full-text search across stem, stimulus, and rationale."""
    parts = [
        strip_html_to_text(q.get("stem") or ""),
        strip_html_to_text(q.get("stimulus") or ""),
        strip_html_to_text(q.get("rationale") or ""),
    ]
    return " ".join(p for p in parts if p).lower()


_MATH_ALT_RE = re.compile(r'<math\b[^>]*?\balttext="([^"]*)"', re.IGNORECASE)


def extract_math_text(q: dict) -> str:
    """Extract all MathML alttext values from question content."""
    sources = [q.get("stem", ""), q.get("stimulus", "") or ""]
    for opt in (q.get("answerOptions") or []):
        sources.append(opt.get("content", ""))
    sources.append(q.get("rationale", "") or "")
    parts: list[str] = []
    for s in sources:
        if s:
            parts.extend(_MATH_ALT_RE.findall(s))
    return " ".join(parts).lower()


def main() -> None:
    entries: list[dict] = []
    if not JSON_DIR.exists():
        print(f"No data dir at {JSON_DIR}")
        return
    for path in sorted(JSON_DIR.rglob("*.json")):
        try:
            with path.open("r", encoding="utf-8") as f:
                q = json.load(f)
        except (json.JSONDecodeError, OSError) as exc:
            print(f"skip {path}: {exc}")
            continue
        qid = q.get("questionId") or path.stem
        rel = path.relative_to(DATA_DIR).as_posix()
        entries.append(
            {
                "id": qid,
                "section": q.get("section") or "",
                "difficulty": q.get("difficulty") or "",
                "domain": q.get("domain") or "",
                "skill": q.get("skill") or "",
                "type": q.get("type") or "",
                "preview": make_preview(q),
                "searchText": make_search_text(q),
                "mathText": extract_math_text(q),
                "path": rel,
                "scoreBand": q.get("scoreBand") or None,
                "hasStimulus": bool(q.get("stimulus")),
                "updateDate": q.get("updateDate") or q.get("createDate") or None,
            }
        )

    # User-facing numbering restarts per skill (the most granular taxonomy level).
    # Within each skill we sort by difficulty then id so #1, #2, ... feels natural
    # (easier questions first). The skill name on each row + the breadcrumb in the
    # detail header give the numbers context.
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
    from collections import defaultdict
    counters: dict[tuple[str, str], int] = defaultdict(int)
    for e in entries:
        # Key by (section, skill_lowercase) — skills are scoped within sections in CB taxonomy.
        key = (e["section"], (e["skill"] or "").lower())
        counters[key] += 1
        e["number"] = counters[key]

    INDEX_PATH.write_text(json.dumps(entries, indent=2), encoding="utf-8")
    print(f"Wrote {len(entries)} entries to {INDEX_PATH}")


if __name__ == "__main__":
    main()
