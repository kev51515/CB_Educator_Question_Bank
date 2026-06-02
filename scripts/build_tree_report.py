#!/usr/bin/env python3
"""
Task 4 + 5: Regenerate data/aspects/TREE.md.

Reads:
  - data/aspects/catalog.json    (slug -> label/skill/domain/section/count)
  - data/aspects/aspects.json    (byId: qid -> [slug])
  - viewer/dist/data/index.json  (entries with id/difficulty/type/preview/skill)

Writes:
  - data/aspects/TREE.md

Layout:
  - Header (# Aspect catalog — full tree with examples)
  - Stats line, Naming conv
  - Table of contents (Section -> Domain -> Skill)
  - One section per skill with its aspects (sorted count desc), each with one
    example question (Easy > Medium > Hard, then longest preview).
  - Fat *-other section listing buckets with count >= 5.
"""
from __future__ import annotations

import json
import os
import sys
from collections import defaultdict, OrderedDict
from typing import Dict, List, Tuple

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ASPECTS_DIR = os.path.join(REPO_ROOT, "data", "aspects")
CATALOG_PATH = os.path.join(ASPECTS_DIR, "catalog.json")
ASPECTS_PATH = os.path.join(ASPECTS_DIR, "aspects.json")
CATCH_ALL_PATH = os.path.join(ASPECTS_DIR, "catch_all_qids.json")
INDEX_PATH = os.path.join(REPO_ROOT, "viewer", "dist", "data", "index.json")
TREE_PATH = os.path.join(ASPECTS_DIR, "TREE.md")

DIFFICULTY_RANK = {"Easy": 0, "Medium": 1, "Hard": 2}


def slug_for_anchor(s: str) -> str:
    # GitHub-style anchor: lowercase, spaces -> '-', punctuation removed.
    import re

    out = s.lower()
    out = re.sub(r"[^a-z0-9\s-]", "", out)
    out = re.sub(r"\s+", "-", out).strip("-")
    return out


def main() -> int:
    with open(CATALOG_PATH, encoding="utf-8") as f:
        catalog = json.load(f)
    with open(ASPECTS_PATH, encoding="utf-8") as f:
        aspects = json.load(f)
    with open(INDEX_PATH, encoding="utf-8") as f:
        index = json.load(f)
    catch_all_by_slug: Dict[str, List[str]] = {}
    if os.path.exists(CATCH_ALL_PATH):
        with open(CATCH_ALL_PATH, encoding="utf-8") as f:
            catch_all_by_slug = (json.load(f) or {}).get("bySlug", {}) or {}

    by_id = aspects.get("byId", {})

    # Build skill normalization (strip whitespace just in case).
    entries_by_id: Dict[str, dict] = {e["id"]: e for e in index}

    # slug -> meta (label, skill, domain, section, count)
    slug_meta: Dict[str, dict] = {a["slug"]: a for a in catalog["aspects"]}

    # Group slugs by section -> domain -> skill (preserving catalog order).
    # Structure: section_to_domains[section][domain][skill] = [slug, ...]
    section_to_domains: "OrderedDict[str, OrderedDict[str, OrderedDict[str, List[str]]]]" = OrderedDict()
    for a in catalog["aspects"]:
        sect = a["section"]
        dom = a["domain"]
        sk = a["skill"]
        section_to_domains.setdefault(sect, OrderedDict()).setdefault(dom, OrderedDict()).setdefault(sk, []).append(
            a["slug"]
        )

    # Reverse map: slug -> [qid, ...]
    qids_by_slug: Dict[str, List[str]] = defaultdict(list)
    for qid, slugs in by_id.items():
        for s in slugs:
            qids_by_slug[s].append(qid)

    # Per-skill stats. Skill names are stripped already after the
    # whitespace pass, but be defensive.
    skill_total: Dict[str, int] = defaultdict(int)
    for e in index:
        skill_total[(e.get("skill") or "").strip()] += 1
    skill_tagged: Dict[str, int] = defaultdict(int)
    for qid, slugs in by_id.items():
        e = entries_by_id.get(qid)
        if e is None:
            continue
        if slugs:
            skill_tagged[(e.get("skill") or "").strip()] += 1

    total_tagged = sum(1 for slugs in by_id.values() if slugs)
    total_questions = len(index)
    coverage_pct = 100.0 * total_tagged / total_questions if total_questions else 0.0

    # Pick the canonical example for a slug.
    def pick_example(slug: str) -> Tuple[str, str, str, str]:
        ids = qids_by_slug.get(slug, [])
        if not ids:
            return ("", "", "", "")
        items = []
        for qid in ids:
            e = entries_by_id.get(qid)
            if not e:
                continue
            rank = DIFFICULTY_RANK.get(e.get("difficulty", ""), 3)
            preview = e.get("preview") or ""
            # tie-break: longer preview wins (proxy for completeness).
            items.append((rank, -len(preview), qid, e.get("difficulty", ""), e.get("type", ""), preview))
        if not items:
            return ("", "", "", "")
        items.sort()
        _, _, qid, diff, qtype, preview = items[0]
        return qid, diff, qtype, preview

    # Build TOC.
    lines: List[str] = []
    lines.append("# Aspect catalog — full tree with examples")
    lines.append("")
    n_aspects = len(catalog["aspects"])
    n_sections = len(section_to_domains)
    n_skills = sum(len(s) for d in section_to_domains.values() for s in d.values())
    lines.append(
        f"Generated from `data/aspects/catalog.json` ({n_aspects} aspects across "
        f"{sum(len(d) for d in section_to_domains.values())} domains and {n_skills} skills)."
    )
    lines.append("")
    lines.append(
        f"- **Total questions tagged:** {total_tagged:,} / {total_questions:,} "
        f"({coverage_pct:.1f}% coverage)"
    )
    lines.append(
        "- **Each aspect lists**: a single example question (preferring Easy → Medium → Hard), "
        "with id + difficulty + type + preview text. Use the id to look the question up in the viewer."
    )
    lines.append(
        "- **Slug naming convention**: kebab-case, prefix per skill "
        "(e.g. `eq-expr-*`, `nlf-*`, `lf-*`, `coe-*`, `wic-*`, `boundary-*`)."
    )
    lines.append("")
    lines.append("## Table of contents")
    lines.append("")
    for sect, domains in section_to_domains.items():
        lines.append(f"- [{sect}](#{slug_for_anchor(sect)})")
        for dom, skills in domains.items():
            lines.append(f"  - [{dom}](#{slug_for_anchor(dom)})")
            for sk, slugs in sorted(skills.items()):
                lines.append(f"    - {sk} ({len(slugs)} aspects)")
    lines.append("")
    lines.append("---")
    lines.append("")

    # Body.
    for sect, domains in section_to_domains.items():
        lines.append(f"# {sect}")
        lines.append("")
        for dom, skills in domains.items():
            lines.append(f"## {dom}")
            lines.append("")
            for sk in sorted(skills.keys()):
                slugs = skills[sk]
                tot = skill_total.get(sk, 0)
                tg = skill_tagged.get(sk, 0)
                pct = (100 * tg // tot) if tot else 0
                lines.append(f"### {sk}")
                lines.append(f"_{tg}/{tot} tagged ({pct}% coverage) · {len(slugs)} aspects_")
                lines.append("")
                # Sort aspects by count desc, then by slug for stability.
                slugs_sorted = sorted(slugs, key=lambda s: (-slug_meta[s]["count"], s))
                for slug in slugs_sorted:
                    meta = slug_meta[slug]
                    label = meta["label"]
                    count = meta["count"]
                    lines.append(f"#### `{slug}` — {label}")
                    lines.append(f"_Count: {count}_")
                    lines.append("")
                    qid, diff, qtype, preview = pick_example(slug)
                    if qid:
                        # Truncate preview to ~145 chars.
                        prev_short = preview if len(preview) <= 145 else preview[:145] + "…"
                        lines.append(f"> **Example** `{qid}` · {diff} · {qtype}")
                        lines.append(">")
                        lines.append(f"> {prev_short}")
                        lines.append("")
                    else:
                        lines.append("> _(no example available)_")
                        lines.append("")
            # End domain.
        # End section.

    # Fat-Other section.
    lines.append("---")
    lines.append("")
    lines.append("## Fat `*-other` buckets — worth a refinement pass")
    lines.append("")
    # For reused catch-all slugs (e.g. `xtc-other-response`, `coe-other-detail-from-data`,
    # `rs-other`, `tsp-other`, `wic-fill-other-pos`), the slug's `count` mixes
    # specific-predicate matches and trailing catch-all matches. The
    # `catch_all_by_slug[slug]` list is the true residual; if the slug was
    # introduced solely as a catch-all (e.g. `nlf-other`), every match is a
    # residual and the two lists coincide.
    fat = []
    for a in catalog["aspects"]:
        slug = a["slug"]
        if "other" not in slug:
            continue
        if slug in catch_all_by_slug:
            residual_ids = catch_all_by_slug[slug]
        else:
            # Slug not in catch-all map => no question matched the catch-all
            # rule for this slug. Treat as residual_count 0 to avoid claiming
            # specific-predicate hits as "untagged".
            residual_ids = []
        residual_count = len(residual_ids)
        if residual_count >= 5:
            fat.append({
                "slug": slug,
                "label": a["label"],
                "skill": a["skill"],
                "residual_count": residual_count,
                "residual_ids": residual_ids,
            })
    fat.sort(key=lambda x: -x["residual_count"])
    if not fat:
        lines.append("_No `*-other` buckets with count ≥ 5._")
        lines.append("")
    else:
        for item in fat:
            samples = sorted(item["residual_ids"])[:3]
            sample_str = ", ".join(samples) if samples else "(none)"
            lines.append(
                f"- `{item['slug']}` ({item['residual_count']} questions, "
                f"{item['skill']}) — top untagged sample: {sample_str}"
            )
        lines.append("")

    with open(TREE_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    n_lines = lines.count("") + len(lines)  # count actual newlines
    # Get real line count via the written file.
    with open(TREE_PATH, encoding="utf-8") as f:
        real_lines = sum(1 for _ in f)
    print(f"Wrote {TREE_PATH} ({os.path.getsize(TREE_PATH)} bytes, {real_lines} lines)")
    print(f"Fat *-other buckets (count >= 5): {len(fat)}")
    for a in fat[:5]:
        print(f"  - {a['slug']} ({a['residual_count']}, {a['skill']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
