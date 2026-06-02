"""Tag Set #1 clones with templateId based on their originalId.

For each clone, look up its originalId in the relevant skill template's
example_originals lists, then write back a `templateId` field of the form
"<skillSlug>.<aspectId>.<typeId>.<difficulty>".

Outputs:
  - data/sets/set-1/_tag_report.json with mapping coverage stats
  - Each clone gets a `templateId` field if its original is found

Run: python scripts/tag_clones.py [--set set-1] [--dry-run]
"""
from __future__ import annotations
import argparse
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"


def slugify(s: str) -> str:
    s = s.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def build_orig_to_template_map() -> dict[str, str]:
    """Walk all skill templates and extract originalId → templateId mapping.

    A given original may appear in multiple types (the distillers allowed this for
    some hard items). We pick the FIRST occurrence — the dominant assignment.
    """
    mapping: dict[str, str] = {}
    duplicates: dict[str, list[str]] = defaultdict(list)
    template_files = list((DATA / "templates").rglob("*.json"))
    for tf in template_files:
        if ".v1.json" in tf.name or tf.parent.name == "_manifests":
            continue
        try:
            tpl = json.loads(tf.read_text())
        except Exception:
            continue
        skill_slug = tf.stem  # e.g. "linear-equations-in-one-variable"
        for aspect in tpl.get("aspects", []):
            for typ in aspect.get("types", []):
                # Collect example IDs from type-level and difficulty-level
                ids = list(typ.get("example_originals", []))
                for diff in ("easy", "medium", "hard"):
                    lev = typ.get("difficulty_levers", {}).get(diff, {})
                    for oid in lev.get("example_ids", []) or []:
                        ids.append((oid, diff))
                # Tag with difficulty if known
                for entry in ids:
                    if isinstance(entry, tuple):
                        oid, diff = entry
                    else:
                        oid = entry
                        diff = None  # unknown — will be inferred from the clone
                    tid_base = f"{skill_slug}.{aspect['id']}.{typ['id']}"
                    if diff:
                        tid = f"{tid_base}.{diff}"
                    else:
                        tid = tid_base
                    if oid in mapping:
                        if mapping[oid] != tid:
                            duplicates[oid].append(tid)
                    else:
                        mapping[oid] = tid
    return mapping, duplicates


def diff_from_clone_path(p: Path) -> str | None:
    parts = p.relative_to(DATA / "sets").parts
    # data/sets/set-1/json/<section>/<difficulty>/<domain>/<id>-s1.json
    if len(parts) >= 5:
        return parts[3]  # easy/medium/hard
    return None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--set", default="set-1")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    set_dir = DATA / "sets" / args.set / "json"
    if not set_dir.exists():
        print(f"FAIL: {set_dir} missing")
        return 2

    print("Building original→template map from skill templates...")
    mapping, dupes = build_orig_to_template_map()
    print(f"  Mapped {len(mapping)} unique originals to templates")
    if dupes:
        print(f"  {len(dupes)} originals had multiple template candidates (kept first)")

    clones = list(set_dir.rglob("*-s1.json"))
    print(f"\nFound {len(clones)} clones on disk")

    tagged = 0
    untagged = 0
    untagged_ids = []
    skill_dist = Counter()
    already_tagged = 0

    for p in clones:
        try:
            c = json.loads(p.read_text())
        except Exception:
            untagged += 1
            continue
        orig_id = c.get("originalId")
        if not orig_id:
            untagged += 1
            continue
        if c.get("templateId"):
            already_tagged += 1
            continue
        tid = mapping.get(orig_id)
        if tid:
            # If template id doesn't include difficulty, append from clone path
            parts = tid.split(".")
            if len(parts) == 3:  # skillSlug.A?.T?
                diff = diff_from_clone_path(p) or (c.get("difficulty") or "").lower()
                if diff in ("easy", "medium", "hard"):
                    tid = f"{tid}.{diff}"
            c["templateId"] = tid
            skill_dist[parts[0]] += 1
            tagged += 1
            if not args.dry_run:
                p.write_text(json.dumps(c, indent=2))
        else:
            untagged += 1
            untagged_ids.append(orig_id)

    report = {
        "total_clones": len(clones),
        "tagged_now": tagged,
        "already_tagged": already_tagged,
        "untagged": untagged,
        "untagged_ids_sample": untagged_ids[:50],
        "skill_distribution": dict(skill_dist.most_common()),
    }
    report_path = DATA / "sets" / args.set / "_tag_report.json"
    if not args.dry_run:
        report_path.write_text(json.dumps(report, indent=2))

    print(f"\nTagging report:")
    print(f"  Tagged now:      {tagged}")
    print(f"  Already tagged:  {already_tagged}")
    print(f"  Untagged:        {untagged}")
    print(f"\nTop skills (by # clones tagged this run):")
    for slug, n in skill_dist.most_common(10):
        print(f"  {n:5d}  {slug}")
    if untagged_ids:
        print(f"\nSample untagged originalIds:")
        for oid in untagged_ids[:15]:
            print(f"  {oid}")
    print(f"\nReport written to {report_path.relative_to(ROOT)}" if not args.dry_run else "\n(dry-run)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
