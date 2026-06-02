#!/usr/bin/env python3
"""
Task 1: Strip trailing/leading whitespace from skill, domain, section fields.

Scans:
  - data/json/**/*.json  (per-question source files)
  - viewer/dist/data/index.json
  - viewer/public/data/index.json
"""
from __future__ import annotations

import json
import os
import sys
from typing import Tuple

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
JSON_ROOT = os.path.join(REPO_ROOT, "data", "json")
INDEX_PATHS = [
    os.path.join(REPO_ROOT, "viewer", "dist", "data", "index.json"),
    os.path.join(REPO_ROOT, "viewer", "public", "data", "index.json"),
]
TARGET_FIELDS = ("skill", "domain", "section")


def strip_obj(obj: dict) -> bool:
    """Strip target fields in-place. Return True if changed."""
    changed = False
    for k in TARGET_FIELDS:
        v = obj.get(k)
        if isinstance(v, str) and v != v.strip():
            obj[k] = v.strip()
            changed = True
    return changed


def fix_source_files() -> int:
    modified = 0
    for root, _, files in os.walk(JSON_ROOT):
        for name in files:
            if not name.endswith(".json"):
                continue
            path = os.path.join(root, name)
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except Exception as e:
                print(f"  ! load error {path}: {e}", file=sys.stderr)
                continue
            if not isinstance(data, dict):
                continue
            if strip_obj(data):
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                modified += 1
    return modified


def fix_index_file(path: str) -> int:
    if not os.path.exists(path):
        print(f"  (skip; not found) {path}")
        return 0
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        print(f"  ! unexpected shape {path}", file=sys.stderr)
        return 0
    modified = 0
    for entry in data:
        if isinstance(entry, dict) and strip_obj(entry):
            modified += 1
    if modified:
        # index.json is compact (no indent) -- preserve that
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
    return modified


def verify_clean(path: str) -> Tuple[int, list]:
    """Return (count_remaining, examples)."""
    if not os.path.exists(path):
        return 0, []
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    remaining = []
    if isinstance(data, list):
        for entry in data:
            if not isinstance(entry, dict):
                continue
            for k in TARGET_FIELDS:
                v = entry.get(k)
                if isinstance(v, str) and v != v.strip():
                    remaining.append((entry.get("id"), k, repr(v)))
    return len(remaining), remaining[:5]


def verify_sources() -> Tuple[int, list]:
    remaining = []
    for root, _, files in os.walk(JSON_ROOT):
        for name in files:
            if not name.endswith(".json"):
                continue
            path = os.path.join(root, name)
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except Exception:
                continue
            if not isinstance(data, dict):
                continue
            for k in TARGET_FIELDS:
                v = data.get(k)
                if isinstance(v, str) and v != v.strip():
                    remaining.append((path, k, repr(v)))
    return len(remaining), remaining[:5]


def main() -> int:
    print("Stripping whitespace from per-question source files...")
    modified_sources = fix_source_files()
    print(f"  Modified {modified_sources} source files.")

    for p in INDEX_PATHS:
        print(f"Stripping whitespace in {p} ...")
        n = fix_index_file(p)
        print(f"  Modified {n} entries.")

    print("\nVerifying...")
    n_src, src_examples = verify_sources()
    if n_src == 0:
        print("  Source files: 0 trailing-whitespace fields remain")
    else:
        print(f"  ! Source files: {n_src} trailing-whitespace fields remain")
        for ex in src_examples:
            print(f"    {ex}")

    for p in INDEX_PATHS:
        n, examples = verify_clean(p)
        if n == 0:
            print(f"  {p}: 0 trailing-whitespace fields remain")
        else:
            print(f"  ! {p}: {n} trailing-whitespace fields remain")
            for ex in examples:
                print(f"    {ex}")

    print(f"\nTotal source files modified: {modified_sources}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
