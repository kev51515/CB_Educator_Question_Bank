#!/usr/bin/env python3
"""Find near-duplicate questions in the bank using simple text similarity.

Usage: python scripts/find_duplicates.py [--threshold 0.85] [--limit 50]

Outputs pairs of likely-duplicate question IDs to stdout, ranked by similarity.

Algorithm:
  1. Load every question JSON from data/json/**/*.json
  2. Build a normalized signature: HTML-stripped, lowercased, punctuation-stripped,
     first 200 characters of the stem.
  3. Group by exact signature match (similarity = 1.0).
  4. For non-exact matches within the same (skill, difficulty) bucket, compute
     bag-of-words Jaccard similarity and emit pairs above --threshold.

No third-party dependencies.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data" / "json"

# ─────────────────────────────── normalization ───────────────────────

_TAG_RE = re.compile(r"<[^>]+>")
_MATHML_RE = re.compile(r"<math\b[^>]*>.*?</math>", re.DOTALL | re.IGNORECASE)
_WS_RE = re.compile(r"\s+")
_PUNCT_RE = re.compile(r"[^a-z0-9\s]")

# Common stop words that don't help disambiguate near-duplicates.
_STOP_WORDS = frozenset(
    {
        "a", "an", "the", "and", "or", "but", "if", "of", "to", "in", "on",
        "for", "with", "is", "are", "was", "were", "be", "been", "being",
        "this", "that", "these", "those", "it", "its", "as", "at", "by",
        "from", "which", "what", "when", "where", "who", "whose", "how",
    }
)


def strip_html(text: str) -> str:
    """Remove MathML blocks and any other HTML tags."""
    if not text:
        return ""
    text = _MATHML_RE.sub(" ", text)
    text = _TAG_RE.sub(" ", text)
    return text


def normalize(text: str, limit: int = 200) -> str:
    """Produce a canonical signature for exact-match grouping."""
    text = strip_html(text or "").lower()
    text = _PUNCT_RE.sub(" ", text)
    text = _WS_RE.sub(" ", text).strip()
    return text[:limit]


def tokenize(text: str) -> set:
    """Bag-of-words (set) for Jaccard."""
    text = strip_html(text or "").lower()
    text = _PUNCT_RE.sub(" ", text)
    tokens = {t for t in text.split() if t and t not in _STOP_WORDS and len(t) > 1}
    return tokens


def jaccard(a: set, b: set) -> float:
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    inter = len(a & b)
    union = len(a | b)
    if union == 0:
        return 0.0
    return inter / union


# ─────────────────────────────── loader ──────────────────────────────


def iter_questions(data_dir: Path) -> Iterable[dict]:
    """Yield every question JSON in data/json/."""
    if not data_dir.exists():
        print(f"error: data directory not found: {data_dir}", file=sys.stderr)
        return
    for path in data_dir.rglob("*.json"):
        try:
            with path.open("r", encoding="utf-8") as fh:
                obj = json.load(fh)
        except (OSError, json.JSONDecodeError):
            continue
        if not isinstance(obj, dict):
            continue
        qid = obj.get("questionId")
        if not qid or not isinstance(qid, str):
            continue
        yield obj


# ─────────────────────────────── core ────────────────────────────────


def find_duplicates(threshold: float, limit: int) -> List[Tuple[float, str, str, str, str]]:
    """Return a list of (similarity, qid_a, qid_b, skill, difficulty)."""
    questions: List[dict] = list(iter_questions(DATA_DIR))

    signatures: Dict[str, List[dict]] = defaultdict(list)
    for q in questions:
        sig = normalize(q.get("stem", ""))
        if sig:
            signatures[sig].append(q)

    results: List[Tuple[float, str, str, str, str]] = []
    paired: set = set()

    # 1) Exact signature matches → 1.000
    for sig, group in signatures.items():
        if len(group) < 2:
            continue
        for i in range(len(group)):
            for j in range(i + 1, len(group)):
                a, b = group[i], group[j]
                qa, qb = a["questionId"], b["questionId"]
                key = tuple(sorted((qa, qb)))
                if key in paired:
                    continue
                paired.add(key)
                results.append(
                    (
                        1.000,
                        qa,
                        qb,
                        a.get("skill", "") or "",
                        a.get("difficulty", "") or "",
                    )
                )

    # 2) Bucketed Jaccard pairs within (skill, difficulty)
    buckets: Dict[Tuple[str, str], List[dict]] = defaultdict(list)
    for q in questions:
        key = (
            (q.get("skill") or "").strip().lower(),
            (q.get("difficulty") or "").strip().lower(),
        )
        buckets[key].append(q)

    # Pre-tokenize once
    token_cache: Dict[str, set] = {}

    for bucket_key, items in buckets.items():
        if len(items) < 2:
            continue
        # Cap per-bucket comparisons defensively
        if len(items) > 2000:
            items = items[:2000]
        for i in range(len(items)):
            a = items[i]
            qa = a["questionId"]
            ta = token_cache.get(qa)
            if ta is None:
                ta = tokenize(a.get("stem", ""))
                token_cache[qa] = ta
            for j in range(i + 1, len(items)):
                b = items[j]
                qb = b["questionId"]
                key = tuple(sorted((qa, qb)))
                if key in paired:
                    continue
                tb = token_cache.get(qb)
                if tb is None:
                    tb = tokenize(b.get("stem", ""))
                    token_cache[qb] = tb
                sim = jaccard(ta, tb)
                if sim >= threshold:
                    paired.add(key)
                    results.append(
                        (
                            sim,
                            qa,
                            qb,
                            a.get("skill", "") or "",
                            a.get("difficulty", "") or "",
                        )
                    )

    # Sort: similarity descending, then qid_a, qid_b
    results.sort(key=lambda r: (-r[0], r[1], r[2]))
    if limit and limit > 0:
        results = results[:limit]
    return results


# ─────────────────────────────── CLI ─────────────────────────────────


def main(argv: List[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--threshold", type=float, default=0.85,
                        help="Jaccard similarity threshold (default 0.85)")
    parser.add_argument("--limit", type=int, default=50,
                        help="Max pairs to output (default 50; 0 = no limit)")
    args = parser.parse_args(argv)

    if args.threshold < 0.0 or args.threshold > 1.0:
        print("error: --threshold must be between 0 and 1", file=sys.stderr)
        return 2

    results = find_duplicates(args.threshold, args.limit)

    if not results:
        print("No duplicates found above threshold.")
        return 0

    # Print table
    header = f"{'SIMILARITY':<12} {'QID_A':<14} {'QID_B':<14} {'SKILL':<32} {'DIFFICULTY'}"
    print(header)
    print("-" * len(header))
    for sim, qa, qb, skill, diff in results:
        skill_trunc = skill[:30] + ".." if len(skill) > 32 else skill
        print(f"{sim:<12.3f} {qa:<14} {qb:<14} {skill_trunc:<32} {diff}")

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
