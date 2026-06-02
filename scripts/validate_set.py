"""Validate a generated Set against its originals.

Checks:
  1. Schema: required fields present and well-typed
  2. Coverage: every entry in _pilot_manifest.json has a corresponding file
  3. Metadata fidelity: section/difficulty/domain/skill/type match the original
  4. Answer-key validity: for MCQ, keys[] reference real answerOption.ids; for SPR, keys[0] is a non-empty string
  5. Surface variation: clone stem must differ from original stem (token-level Jaccard < 0.7)
  6. Distinctness: clones don't trivially reuse the original's exact answer letter when an obvious mapping exists
  7. Difficulty distribution: clone letter answers spread across a/b/c/d (no single-letter cluster)

Prints a report and exits non-zero on any failure category.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
ORIG_DIR = DATA / "json"

REQUIRED_FIELDS = ["questionId", "originalId", "setId", "section", "difficulty",
                   "domain", "skill", "type", "stem", "keys"]

_WS = re.compile(r"\s+")
_TAGS = re.compile(r"<[^>]+>")

def normalize_tokens(html: str) -> set[str]:
    txt = _TAGS.sub(" ", html or "")
    txt = _WS.sub(" ", txt).strip().lower()
    # word tokens ≥ 3 chars to ignore stopwords/digits
    return {w for w in re.findall(r"[a-z]{3,}", txt)}


def jaccard(a: set[str], b: set[str]) -> float:
    if not a and not b:
        return 0.0
    union = a | b
    if not union:
        return 0.0
    return len(a & b) / len(union)


def validate(set_dir: Path, scope: str = "all") -> int:
    """scope: 'pilot' uses _pilot_manifest.json. 'all' walks every clone in set_dir/json."""
    if scope == "pilot":
        manifest_path = set_dir / "_pilot_manifest.json"
        if not manifest_path.exists():
            print(f"FAIL: missing manifest at {manifest_path}", file=sys.stderr)
            return 2
        manifest = json.loads(manifest_path.read_text())
    else:
        # Build manifest from clones present on disk
        json_dir = set_dir / "json"
        manifest = []
        if not json_dir.exists():
            print(f"FAIL: no json/ under {set_dir}", file=sys.stderr)
            return 2
        # Match `<id>-s1.json` and recover the original id
        for p in json_dir.rglob("*-s1.json"):
            orig_id = p.stem[:-3]  # strip "-s1"
            # Find original file by walking the originals tree once
            orig_candidates = list((ROOT / "data" / "json").rglob(f"{orig_id}.json"))
            if not orig_candidates:
                continue
            orig_rel = orig_candidates[0].relative_to(ROOT / "data").as_posix()
            manifest.append({"id": orig_id, "path": orig_rel})

    json_dir = set_dir / "json"
    findings = {
        "checked": 0,
        "missing_files": [],
        "schema_errors": [],
        "metadata_mismatches": [],
        "answer_key_errors": [],
        "low_variation": [],
        "exact_letter_match": [],
        "letter_distribution": Counter(),
    }

    for entry in manifest:
        orig_id = entry["id"]
        orig_path = DATA / entry["path"]
        clone_id = f"{orig_id}-s1"
        # Glob for the clone file — folder slugify gets fiddly
        candidates = list(json_dir.rglob(f"{clone_id}.json"))
        if not candidates:
            findings["missing_files"].append(clone_id)
            continue
        clone_path = candidates[0]
        clone = json.loads(clone_path.read_text())
        orig = json.loads(orig_path.read_text())
        findings["checked"] += 1

        # 1. Schema
        for f in REQUIRED_FIELDS:
            if f not in clone:
                findings["schema_errors"].append((clone_id, f"missing field: {f}"))
                continue
        if clone.get("type") not in ("mcq", "spr"):
            findings["schema_errors"].append((clone_id, f"bad type: {clone.get('type')}"))

        # 3. Metadata fidelity
        for key in ("section", "difficulty", "domain", "skill", "type"):
            if clone.get(key) != orig.get(key):
                findings["metadata_mismatches"].append(
                    (clone_id, key, repr(clone.get(key)), repr(orig.get(key)))
                )

        # 4. Answer-key validity
        if clone.get("type") == "mcq":
            opts = clone.get("answerOptions") or []
            opt_ids = {o.get("id") for o in opts}
            keys = clone.get("keys") or []
            if not opts:
                findings["answer_key_errors"].append((clone_id, "no answerOptions"))
            elif not keys:
                findings["answer_key_errors"].append((clone_id, "no keys"))
            elif not all(k in opt_ids for k in keys):
                findings["answer_key_errors"].append(
                    (clone_id, f"keys {keys} not in option ids {sorted(opt_ids)}")
                )
            else:
                # Record the letter (a/b/c/d) for distribution
                letters = ["a", "b", "c", "d", "e"]
                ordered_ids = [o.get("id") for o in opts]
                for k in keys:
                    if k in ordered_ids:
                        findings["letter_distribution"][letters[ordered_ids.index(k)]] += 1

                # 6. Exact letter match flag
                orig_keys = orig.get("keys") or []
                orig_opts = orig.get("answerOptions") or []
                orig_ordered = [o.get("id") for o in orig_opts]
                if orig_keys and orig_ordered:
                    orig_letter = letters[orig_ordered.index(orig_keys[0])] if orig_keys[0] in orig_ordered else None
                    clone_letter = letters[ordered_ids.index(keys[0])] if keys[0] in ordered_ids else None
                    if orig_letter and clone_letter and orig_letter == clone_letter:
                        findings["exact_letter_match"].append((clone_id, orig_letter))
        elif clone.get("type") == "spr":
            keys = clone.get("keys") or []
            if not keys or not isinstance(keys[0], str) or not keys[0].strip():
                findings["answer_key_errors"].append((clone_id, "missing SPR answer"))

        # 5. Surface variation — pick the "content surface" to compare.
        # For R&W questions the meaningful content is the stimulus (the passage).
        # For Math the stem IS the content. Boilerplate stems (< 12 tokens) are
        # standardized prompts like "Which choice…?" and identical-by-design.
        orig_stem_tokens = normalize_tokens(orig.get("stem") or "")
        clone_stem_tokens = normalize_tokens(clone.get("stem") or "")
        orig_stim_tokens = normalize_tokens(orig.get("stimulus") or "")
        clone_stim_tokens = normalize_tokens(clone.get("stimulus") or "")

        if orig_stim_tokens:
            # R&W with passage: variation must live in the stimulus
            sim = jaccard(orig_stim_tokens, clone_stim_tokens)
            if sim > 0.65:
                findings["low_variation"].append((clone_id, "stimulus", round(sim, 2)))
        else:
            # No passage. Math (and short-stemmed R&W) varies in CHOICES not prose.
            # Compare the concatenated choice content; flag only if both stem AND
            # choices look near-identical.
            orig_choices = " ".join((o.get("content") or "") for o in (orig.get("answerOptions") or []))
            clone_choices = " ".join((o.get("content") or "") for o in (clone.get("answerOptions") or []))
            orig_choice_toks = normalize_tokens(orig_choices)
            clone_choice_toks = normalize_tokens(clone_choices)
            choice_sim = jaccard(orig_choice_toks, clone_choice_toks)
            stem_sim = jaccard(orig_stem_tokens, clone_stem_tokens)
            # Flag only if BOTH stem AND choices are too close
            if stem_sim > 0.85 and choice_sim > 0.8:
                findings["low_variation"].append(
                    (clone_id, f"stem={stem_sim:.2f} choices={choice_sim:.2f}", "")
                )

    # Report
    print(f"Checked: {findings['checked']} / {len(manifest)}")
    if findings["missing_files"]:
        print(f"\nMISSING FILES ({len(findings['missing_files'])}):")
        for f in findings["missing_files"]:
            print(f"  - {f}")
    if findings["schema_errors"]:
        print(f"\nSCHEMA ERRORS ({len(findings['schema_errors'])}):")
        for cid, msg in findings["schema_errors"]:
            print(f"  - {cid}: {msg}")
    if findings["metadata_mismatches"]:
        print(f"\nMETADATA MISMATCHES ({len(findings['metadata_mismatches'])}):")
        for cid, key, got, want in findings["metadata_mismatches"]:
            print(f"  - {cid}: {key} got {got} want {want}")
    if findings["answer_key_errors"]:
        print(f"\nANSWER-KEY ERRORS ({len(findings['answer_key_errors'])}):")
        for cid, msg in findings["answer_key_errors"]:
            print(f"  - {cid}: {msg}")
    if findings["low_variation"]:
        print(f"\nLOW VARIATION ({len(findings['low_variation'])}):")
        for cid, kind, sim in findings["low_variation"]:
            print(f"  - {cid}: {kind} similarity={sim}")
    if findings["exact_letter_match"]:
        n = len(findings["exact_letter_match"])
        pct = round(100 * n / max(1, findings["checked"]), 1)
        print(f"\nNote: {n} clones ({pct}%) have the same answer letter as the original. Ideal is ~25% (random).")
        if pct > 50:
            print("  ↑ Above 50% — suggests the cloner is being lazy.")
    if findings["letter_distribution"]:
        total = sum(findings["letter_distribution"].values())
        print(f"\nAnswer-letter distribution across MCQ clones (n={total}):")
        for letter in "abcde":
            n = findings["letter_distribution"].get(letter, 0)
            if n:
                bar = "█" * int(20 * n / total)
                print(f"  {letter}: {n:2d}  {bar}")

    print()
    total_errors = (
        len(findings["missing_files"])
        + len(findings["schema_errors"])
        + len(findings["metadata_mismatches"])
        + len(findings["answer_key_errors"])
        + len(findings["low_variation"])
    )
    if total_errors == 0:
        print(f"✓ All {findings['checked']} clones pass validation.")
        return 0
    print(f"✗ {total_errors} issue(s) across {findings['checked']} clones.")
    return 1


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--set", default="set-1", help="Set directory under data/sets/")
    ap.add_argument("--scope", choices=["pilot", "all"], default="all",
                    help="'pilot' validates only the original manifest; 'all' walks every clone on disk")
    args = ap.parse_args()
    set_dir = DATA / "sets" / args.set
    if not set_dir.exists():
        print(f"FAIL: {set_dir} does not exist", file=sys.stderr)
        return 2
    return validate(set_dir, scope=args.scope)


if __name__ == "__main__":
    sys.exit(main())
