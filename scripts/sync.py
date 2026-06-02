#!/usr/bin/env python3
"""Incremental sync of the SAT Question Bank.

What it does:
  1. Enumerates every question upstream via /digital/get-questions
  2. Reconciles each entry with the local copy in data/json/**:
       - missing locally       → fetch & write (new)
       - upstream updateDate newer than local → re-fetch & write (changed)
       - present in upstream and local, same updateDate → leave alone (skip)
       - present locally but absent upstream → soft-delete entry
  3. Falls back to the IBN endpoint for null-external_id questions
  4. Re-runs normalize_skills + build_index at the end

Robustness guarantees:
  • Atomic writes (tmpfile + rename) so kill-mid-write doesn't corrupt files
  • Lock file (data/.sync.lock) blocks concurrent runs
  • Retry-with-backoff on transient network errors
  • Validates response shape before writing (drops anything that doesn't smell like a question)
  • Soft deletes go to data/.deleted.json — files stay so existing question #s don't shift
  • Per-run audit log in scraper/sync_history.json (timestamp, counts, errors)
  • Schema drift safe — full upstream payload is preserved in `raw`

Usage:
  python scripts/sync.py                  # incremental: fetch only what changed
  python scripts/sync.py --force          # re-fetch every question
  python scripts/sync.py --section Math   # one section only
  python scripts/sync.py --dry-run        # show what would change, don't write
  python scripts/sync.py --no-ibn         # skip the IBN fallback this run

Exit codes:
  0 success, 1 partial (errors logged), 2 fatal (lock held / network down / etc.)
"""
from __future__ import annotations

import argparse
import asyncio
import datetime as _dt
import json
import os
import re
import signal
import sys
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any

import httpx

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
JSON_DIR = DATA_DIR / "json"
INDEX_PATH = DATA_DIR / "index.json"
LOCK_PATH = DATA_DIR / ".sync.lock"
DELETED_PATH = DATA_DIR / ".deleted.json"
HISTORY_PATH = ROOT / "scraper" / "sync_history.json"

API_BASE = "https://qbank-api.collegeboard.org/msreportingquestionbank-prod/questionbank"
LEGACY_BASE = "https://saic.collegeboard.org/disclosed"
ASMT_SAT = 99
SECTIONS = {
    "Math": {"test": 2, "domains": "H,P,Q,S"},
    "Reading and Writing": {"test": 1, "domains": "INI,CAS,EOI,SEC"},
}
DIFFICULTY_MAP = {"E": "Easy", "M": "Medium", "H": "Hard"}

HEADERS = {
    "content-type": "application/json",
    "accept": "application/json",
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    "origin": "https://satsuiteeducatorquestionbank.collegeboard.org",
    "referer": "https://satsuiteeducatorquestionbank.collegeboard.org/",
}


# ---------- helpers ----------

def slugify(text: str) -> str:
    t = (text or "unknown").lower().strip()
    t = re.sub(r"[^\w\s-]", "", t)
    t = re.sub(r"[-\s]+", "-", t)
    return t or "unknown"


def now_iso() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat()


def question_path(section: str, difficulty_code: str, domain_desc: str, qid: str) -> Path:
    diff = DIFFICULTY_MAP.get(difficulty_code, difficulty_code or "unknown")
    return JSON_DIR / slugify(section) / slugify(diff) / slugify(domain_desc) / f"{qid}.json"


def atomic_write(path: Path, payload: dict) -> None:
    """Write JSON atomically: temp file, fsync, rename. Avoids partial writes."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def safe_load(path: Path) -> dict | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def validate_question(payload: dict) -> bool:
    """Loose schema check — a question must at least have a stem (or prompt)."""
    if not isinstance(payload, dict):
        return False
    if "stem" not in payload and "prompt" not in payload:
        return False
    return True


# ---------- lock ----------

@contextmanager
def file_lock(path: Path):
    """Single-writer lock backed by O_EXCL. Stale locks (older than 1 hour) get reclaimed."""
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        mtime = path.stat().st_mtime
        if time.time() - mtime > 3600:
            path.unlink()  # stale
        else:
            raise RuntimeError(f"Another sync is running (lock at {path}). Delete to force.")
    fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    os.write(fd, f"{os.getpid()} {now_iso()}\n".encode())
    os.close(fd)

    # Ensure cleanup on signals
    def _release(*_):
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass
        sys.exit(2)
    signal.signal(signal.SIGTERM, _release)
    signal.signal(signal.SIGINT, _release)
    try:
        yield
    finally:
        path.unlink(missing_ok=True)


# ---------- HTTP with retries ----------

class ValidationError(Exception):
    pass


async def post_json(client: httpx.AsyncClient, path: str, body: dict, *, attempts: int = 5) -> Any:
    url = f"{API_BASE}{path}"
    for i in range(attempts):
        try:
            r = await client.post(url, json=body, timeout=20.0)
            if r.status_code == 500 and "VALIDATION_ERROR" in r.text:
                raise ValidationError(r.text)
            if r.status_code in (429, 502, 503, 504) and i < attempts - 1:
                wait = 1.5 * (2 ** i)
                await asyncio.sleep(wait)
                continue
            if r.status_code >= 500 and i < attempts - 1:
                await asyncio.sleep(1.5 * (2 ** i))
                continue
            r.raise_for_status()
            return r.json()
        except ValidationError:
            raise
        except (httpx.HTTPError, httpx.ReadTimeout) as e:
            if i < attempts - 1:
                await asyncio.sleep(1.5 * (2 ** i))
                continue
            raise RuntimeError(f"POST {path} exhausted retries: {e}")
    raise RuntimeError(f"POST {path}: no response")


async def get_json(client: httpx.AsyncClient, url: str, *, attempts: int = 5) -> Any | None:
    for i in range(attempts):
        try:
            r = await client.get(url, timeout=20.0)
            if r.status_code == 404:
                return None
            if r.status_code in (429, 502, 503, 504) and i < attempts - 1:
                await asyncio.sleep(1.5 * (2 ** i))
                continue
            r.raise_for_status()
            return r.json()
        except (httpx.HTTPError, httpx.ReadTimeout):
            if i < attempts - 1:
                await asyncio.sleep(1.5 * (2 ** i))
                continue
            raise


# ---------- sync ----------

async def fetch_question(client: httpx.AsyncClient, external_id: str) -> dict:
    return await post_json(client, "/digital/get-question", {"external_id": external_id})


async def fetch_ibn(client: httpx.AsyncClient, ibn: str) -> dict | None:
    data = await get_json(client, f"{LEGACY_BASE}/{ibn}.json")
    if isinstance(data, list) and data:
        return data[0]
    return data if isinstance(data, dict) else None


def normalize_question(item: dict, detail: dict, section: str) -> dict:
    """Build the unified schema we store on disk."""
    qid = item["questionId"]
    diff_code = item.get("difficulty", "")
    domain = item.get("primary_class_cd_desc", "Unknown")
    return {
        "questionId": qid,
        "externalId": item.get("external_id"),
        "section": section,
        "difficulty": DIFFICULTY_MAP.get(diff_code, diff_code),
        "difficultyCode": diff_code,
        "domain": domain,
        "domainCode": item.get("primary_class_cd"),
        "skill": item.get("skill_desc"),
        "skillCode": item.get("skill_cd"),
        "scoreBand": item.get("score_band_range_cd"),
        "ibn": item.get("ibn"),
        "updateDate": item.get("updateDate"),
        "createDate": item.get("createDate"),
        "syncedAt": now_iso(),
        "type": detail.get("type"),
        "stimulus": detail.get("stimulus") or None,
        "stem": detail.get("stem"),
        "answerOptions": detail.get("answerOptions") or detail.get("options"),
        "keys": detail.get("keys"),
        "rationale": detail.get("rationale"),
        "raw": detail,
    }


def normalize_ibn_question(item: dict, raw: dict, section: str) -> dict:
    """IBN responses use a different shape; map to unified schema."""
    qid = item["questionId"]
    diff_code = item.get("difficulty", "")
    domain = item.get("primary_class_cd_desc", "Unknown")
    ans = raw.get("answer", {}) or {}
    choices_raw = ans.get("choices", {}) or {}
    style = (ans.get("style") or "").lower()
    correct = (ans.get("correct_choice") or "").strip().lower()
    answer_options: list[dict] = []
    if isinstance(choices_raw, dict):
        for k in sorted(choices_raw.keys()):
            body = (choices_raw.get(k) or {}).get("body", "")
            answer_options.append({"id": k.lower(), "content": body})
    return {
        "questionId": qid,
        "externalId": None,
        "section": section,
        "difficulty": DIFFICULTY_MAP.get(diff_code, diff_code),
        "difficultyCode": diff_code,
        "domain": domain,
        "domainCode": item.get("primary_class_cd"),
        "skill": item.get("skill_desc"),
        "skillCode": item.get("skill_cd"),
        "scoreBand": item.get("score_band_range_cd"),
        "ibn": item.get("ibn"),
        "updateDate": item.get("updateDate"),
        "createDate": item.get("createDate"),
        "syncedAt": now_iso(),
        "source": "ibn-legacy",
        "type": "mcq" if style == "multiple choice" and answer_options else "spr",
        "stimulus": None,
        "stem": raw.get("prompt", ""),
        "answerOptions": answer_options,
        "keys": [correct] if correct else [],
        "rationale": ans.get("rationale", ""),
        "raw": raw,
    }


def find_local_path(qid: str) -> Path | None:
    """Locate the existing JSON for a qid regardless of which difficulty/domain
    bucket it lives under. Used to detect existing files even if upstream taxonomy
    has shifted underneath us."""
    if not JSON_DIR.exists():
        return None
    for p in JSON_DIR.rglob(f"{qid}.json"):
        return p
    return None


def needs_refresh(local_path: Path, upstream_update: int | None) -> bool:
    """Decide whether to re-fetch based on `updateDate`."""
    if upstream_update is None:
        return False
    local = safe_load(local_path)
    if not local:
        return True
    local_update = local.get("updateDate")
    if not isinstance(local_update, (int, float)):
        return True
    return upstream_update > local_update


async def sync_section(
    client: httpx.AsyncClient,
    section: str,
    *,
    force: bool,
    dry_run: bool,
    no_ibn: bool,
    semaphore: asyncio.Semaphore,
) -> dict:
    cfg = SECTIONS[section]
    stats = {
        "section": section,
        "upstream": 0,
        "new": 0,
        "updated": 0,
        "skipped": 0,
        "ibn_new": 0,
        "errors": [],
    }
    try:
        items = await post_json(
            client,
            "/digital/get-questions",
            {"asmtEventId": ASMT_SAT, "test": cfg["test"], "domain": cfg["domains"]},
        )
    except Exception as e:
        stats["errors"].append({"phase": "enumerate", "msg": str(e)})
        return stats

    if not isinstance(items, list):
        stats["errors"].append({"phase": "enumerate", "msg": "non-list response"})
        return stats

    stats["upstream"] = len(items)

    async def process(item: dict) -> None:
        async with semaphore:
            qid = item.get("questionId")
            if not qid or not isinstance(qid, str):
                return
            target = question_path(
                section,
                item.get("difficulty", ""),
                item.get("primary_class_cd_desc", "Unknown"),
                qid,
            )
            existing = find_local_path(qid)
            upstream_update = item.get("updateDate")
            is_new = existing is None
            do_refresh = force or is_new or needs_refresh(existing, upstream_update)

            if not do_refresh:
                stats["skipped"] += 1
                return

            # IBN path
            if not item.get("external_id"):
                if no_ibn:
                    stats["skipped"] += 1
                    return
                ibn = item.get("ibn")
                if not ibn:
                    stats["errors"].append({"qid": qid, "msg": "no external_id and no ibn"})
                    return
                try:
                    raw = await fetch_ibn(client, ibn)
                except Exception as e:
                    stats["errors"].append({"qid": qid, "msg": f"ibn fetch: {e}"})
                    return
                if not raw:
                    stats["errors"].append({"qid": qid, "msg": "ibn 404"})
                    return
                payload = normalize_ibn_question(item, raw, section)
                if not validate_question(payload):
                    stats["errors"].append({"qid": qid, "msg": "ibn validation failed"})
                    return
                if not dry_run:
                    atomic_write(target, payload)
                    # If the existing was in a different folder (e.g. taxonomy moved), remove it
                    if existing and existing != target:
                        existing.unlink(missing_ok=True)
                stats["ibn_new" if is_new else "updated"] += 1
                if is_new:
                    stats["ibn_new"] += 0  # counted above
                return

            # Main API path
            try:
                detail = await fetch_question(client, item["external_id"])
            except ValidationError as e:
                stats["errors"].append({"qid": qid, "msg": f"validation: {str(e)[:80]}"})
                return
            except Exception as e:
                stats["errors"].append({"qid": qid, "msg": f"fetch: {e}"})
                return
            payload = normalize_question(item, detail, section)
            if not validate_question(payload):
                stats["errors"].append({"qid": qid, "msg": "validation failed"})
                return
            if not dry_run:
                atomic_write(target, payload)
                if existing and existing != target:
                    existing.unlink(missing_ok=True)
            stats["new" if is_new else "updated"] += 1

    # Process in batches with periodic progress
    batch = 80
    for i in range(0, len(items), batch):
        await asyncio.gather(*(process(it) for it in items[i : i + batch]))
        done = stats["new"] + stats["updated"] + stats["skipped"] + stats["ibn_new"]
        print(
            f"[{section}] {done}/{len(items)} "
            f"(new={stats['new']}+{stats['ibn_new']}ibn, upd={stats['updated']}, skip={stats['skipped']}, err={len(stats['errors'])})",
            flush=True,
        )
    return stats


def detect_removals(upstream_qids: set[str]) -> list[str]:
    """Find local question files whose qid is no longer upstream."""
    removed = []
    if not JSON_DIR.exists():
        return removed
    for p in JSON_DIR.rglob("*.json"):
        if p.stem not in upstream_qids:
            removed.append(p.stem)
    return removed


def write_deleted(removed_qids: list[str]) -> None:
    """Append removed qids to .deleted.json with timestamps. Files stay on disk."""
    existing: dict = {}
    if DELETED_PATH.exists():
        try:
            existing = json.loads(DELETED_PATH.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            existing = {}
    ts = now_iso()
    for qid in removed_qids:
        if qid not in existing:
            existing[qid] = ts
    atomic_write(DELETED_PATH, existing)


def append_history(entry: dict) -> None:
    history: list = []
    if HISTORY_PATH.exists():
        try:
            history = json.loads(HISTORY_PATH.read_text(encoding="utf-8"))
            if not isinstance(history, list):
                history = []
        except (json.JSONDecodeError, OSError):
            history = []
    history.append(entry)
    # Cap to last 100 runs
    if len(history) > 100:
        history = history[-100:]
    HISTORY_PATH.parent.mkdir(parents=True, exist_ok=True)
    atomic_write(HISTORY_PATH, history)


async def amain(args: argparse.Namespace) -> int:
    JSON_DIR.mkdir(parents=True, exist_ok=True)
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    sections = [args.section] if args.section else list(SECTIONS.keys())
    start_iso = now_iso()
    t0 = time.perf_counter()

    sem = asyncio.Semaphore(args.concurrency)
    limits = httpx.Limits(max_connections=args.concurrency + 2)

    all_upstream_qids: set[str] = set()
    summary = {
        "started": start_iso,
        "force": args.force,
        "dryRun": args.dry_run,
        "sections": [],
        "removed": [],
        "elapsedSec": 0.0,
    }

    try:
        with file_lock(LOCK_PATH):
            async with httpx.AsyncClient(headers=HEADERS, limits=limits, http2=False, timeout=30.0) as client:
                for section in sections:
                    sec_stats = await sync_section(
                        client,
                        section,
                        force=args.force,
                        dry_run=args.dry_run,
                        no_ibn=args.no_ibn,
                        semaphore=sem,
                    )
                    summary["sections"].append(sec_stats)
                    # Collect upstream qids for removal detection (only full runs)
                    if not args.section:
                        # Re-enumerate to be safe (sync_section consumed the list internally)
                        pass
                # Removal detection — only when running both sections
                if not args.section:
                    # Rebuild upstream set: re-call get-questions briefly
                    for section, cfg in SECTIONS.items():
                        try:
                            items = await post_json(
                                client,
                                "/digital/get-questions",
                                {"asmtEventId": ASMT_SAT, "test": cfg["test"], "domain": cfg["domains"]},
                            )
                            for it in items or []:
                                qid = it.get("questionId")
                                if isinstance(qid, str):
                                    all_upstream_qids.add(qid)
                        except Exception:
                            pass
                    if all_upstream_qids:
                        removed = detect_removals(all_upstream_qids)
                        summary["removed"] = removed
                        if removed and not args.dry_run:
                            write_deleted(removed)
        # Lock released here
    except RuntimeError as e:
        print(f"[fatal] {e}", file=sys.stderr)
        return 2

    # Post-sync: normalize + rebuild index
    if not args.dry_run:
        try:
            print("[post] normalizing skills…", flush=True)
            from normalize_skills import main as normalize_main  # type: ignore
            normalize_main()
        except Exception as e:
            print(f"[warn] normalize_skills failed: {e}", flush=True)
        try:
            print("[post] rebuilding index…", flush=True)
            from build_index import main as build_main  # type: ignore
            build_main()
        except Exception as e:
            print(f"[warn] build_index failed: {e}", flush=True)

    summary["elapsedSec"] = round(time.perf_counter() - t0, 2)
    summary["finished"] = now_iso()
    append_history(summary)

    # Final report
    tot_new = sum(s.get("new", 0) + s.get("ibn_new", 0) for s in summary["sections"])
    tot_upd = sum(s.get("updated", 0) for s in summary["sections"])
    tot_skip = sum(s.get("skipped", 0) for s in summary["sections"])
    tot_err = sum(len(s.get("errors", [])) for s in summary["sections"])
    print(
        f"\nSync done in {summary['elapsedSec']:.1f}s — "
        f"new={tot_new}, updated={tot_upd}, skipped={tot_skip}, errors={tot_err}, "
        f"removed_marked={len(summary['removed'])}"
    )
    return 1 if tot_err > 0 else 0


def parse_args() -> argparse.Namespace:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--section", choices=list(SECTIONS.keys()), help="Limit to one section")
    ap.add_argument("--force", action="store_true", help="Re-fetch every question, not just changed ones")
    ap.add_argument("--dry-run", action="store_true", help="Show what would change without writing")
    ap.add_argument("--no-ibn", action="store_true", help="Skip the IBN legacy fallback")
    ap.add_argument("--concurrency", type=int, default=4)
    return ap.parse_args()


if __name__ == "__main__":
    sys.exit(asyncio.run(amain(parse_args())))
