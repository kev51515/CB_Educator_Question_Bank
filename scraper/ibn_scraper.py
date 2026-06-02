"""Second-pass scraper for legacy IBN questions.

Questions with null external_id (~459 in Math) have their content served from a
different host: https://saic.collegeboard.org/disclosed/{ibn}.json

The IBN response format differs from /get-question, so we normalize it to the
same schema the viewer already consumes:
  questionId, section, difficulty, domain, skill, type, stem, answerOptions, keys, rationale

Reads scraper/api_failed.json for the list of IBN questions to fetch.
Writes data/json/<section>/<difficulty>/<domain>/<qid>.json (same layout).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data" / "json"
FAILED_PATH = ROOT / "scraper" / "api_failed.json"
PROGRESS_PATH = ROOT / "scraper" / "ibn_progress.json"
REMAINING_PATH = ROOT / "scraper" / "ibn_remaining.json"
LEGACY_BASE = "https://saic.collegeboard.org/disclosed"

DIFFICULTY_MAP = {"E": "Easy", "M": "Medium", "H": "Hard"}


def slugify(text: str) -> str:
    t = (text or "unknown").lower().strip()
    t = re.sub(r"[^\w\s-]", "", t)
    t = re.sub(r"[-\s]+", "-", t)
    return t or "unknown"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def question_path(section: str, difficulty_code: str, domain_desc: str, qid: str) -> Path:
    diff = DIFFICULTY_MAP.get(difficulty_code, difficulty_code or "unknown")
    return DATA_DIR / slugify(section) / slugify(diff) / slugify(domain_desc) / f"{qid}.json"


def normalize_ibn(raw: dict, meta: dict) -> dict:
    """Convert IBN response into the viewer's expected schema."""
    qid = meta["questionId"]
    diff_code = meta.get("difficulty", "")
    domain = meta.get("primary_class_cd_desc", "Unknown")
    section = meta.get("section") or ("Math" if meta.get("primary_class_cd") in {"H","P","Q","S"} else "Reading and Writing")

    ans = raw.get("answer", {}) or {}
    choices_raw = ans.get("choices", {}) or {}
    style = (ans.get("style") or "").lower()
    correct = (ans.get("correct_choice") or "").strip().lower()

    answer_options: list[dict] = []
    if isinstance(choices_raw, dict):
        # Sort by letter key
        for k in sorted(choices_raw.keys()):
            body = (choices_raw.get(k) or {}).get("body", "")
            answer_options.append({"id": k.lower(), "content": body})

    type_str = "mcq" if (style == "multiple choice" and answer_options) else "spr"
    keys = [correct] if correct else []

    return {
        "questionId": qid,
        "externalId": None,
        "section": section,
        "difficulty": DIFFICULTY_MAP.get(diff_code, diff_code),
        "difficultyCode": diff_code,
        "domain": domain,
        "domainCode": meta.get("primary_class_cd"),
        "skill": meta.get("skill_desc"),
        "skillCode": meta.get("skill_cd"),
        "scoreBand": meta.get("score_band_range_cd"),
        "ibn": meta.get("ibn"),
        "updateDate": meta.get("updateDate"),
        "createDate": meta.get("createDate"),
        "scrapedAt": now_iso(),
        "source": "ibn-legacy",
        "type": type_str,
        "stem": raw.get("prompt", ""),
        "answerOptions": answer_options,
        "keys": keys,
        "rationale": ans.get("rationale", ""),
        "raw": raw,
    }


async def fetch_ibn(client: httpx.AsyncClient, ibn: str, *, attempts: int = 4) -> dict | None:
    """Returns parsed first item from the IBN JSON, or None on permanent failure."""
    url = f"{LEGACY_BASE}/{ibn}.json"
    for attempt in range(attempts):
        try:
            r = await client.get(url, timeout=20.0)
            if r.status_code == 404:
                return None
            if r.status_code >= 500 and attempt < attempts - 1:
                await asyncio.sleep(1.5 * (2 ** attempt))
                continue
            r.raise_for_status()
            data = r.json()
            if not data:
                return None
            return data[0] if isinstance(data, list) else data
        except (httpx.HTTPError, httpx.ReadTimeout):
            if attempt < attempts - 1:
                await asyncio.sleep(1.5 * (2 ** attempt))
                continue
            raise
    return None


async def amain(args: argparse.Namespace) -> int:
    if not FAILED_PATH.exists():
        print(f"No failed list at {FAILED_PATH}; run the main scraper first.")
        return 1
    failed = json.loads(FAILED_PATH.read_text())
    candidates = [f for f in failed if f.get("reason") == "null_external_id" and f.get("meta", {}).get("ibn")]
    print(f"[ibn] {len(candidates)} candidates with IBN identifier")

    fetched = 0
    not_found: list[dict] = []
    errors: list[dict] = []
    skipped = 0

    headers = {
        "accept": "application/json",
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    }
    limits = httpx.Limits(max_connections=args.concurrency + 2, max_keepalive_connections=args.concurrency)
    sem = asyncio.Semaphore(args.concurrency)

    async with httpx.AsyncClient(headers=headers, limits=limits, http2=False, timeout=30.0) as client:
        async def worker(entry: dict) -> None:
            nonlocal fetched, skipped
            meta = entry["meta"]
            qid = meta["questionId"]
            ibn = meta["ibn"]
            domain = meta.get("primary_class_cd_desc", "Unknown")
            diff = meta.get("difficulty", "")
            section = entry.get("section") or "Math"
            out = question_path(section, diff, domain, qid)
            if out.exists():
                skipped += 1
                return
            async with sem:
                try:
                    raw = await fetch_ibn(client, ibn)
                except Exception as e:
                    errors.append({"qid": qid, "ibn": ibn, "error": str(e)[:200]})
                    print(f"[err] {qid} ibn={ibn}: {e}", flush=True)
                    return
            if not raw:
                not_found.append({"qid": qid, "ibn": ibn})
                return
            # Inject the section we know from metadata
            meta_with_section = {**meta, "section": section}
            merged = normalize_ibn(raw, meta_with_section)
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(json.dumps(merged, indent=2), encoding="utf-8")
            fetched += 1

        batch = 50
        for i in range(0, len(candidates), batch):
            chunk = candidates[i:i + batch]
            await asyncio.gather(*(worker(e) for e in chunk))
            done = fetched + skipped + len(not_found) + len(errors)
            print(f"[ibn] batch {i//batch+1}: fetched={fetched} skipped={skipped} not_found={len(not_found)} err={len(errors)}", flush=True)
            PROGRESS_PATH.write_text(json.dumps({
                "fetched": fetched, "skipped": skipped, "not_found": len(not_found),
                "errors": len(errors), "total": len(candidates), "updated": now_iso()
            }, indent=2))

    REMAINING_PATH.write_text(json.dumps({"not_found": not_found, "errors": errors}, indent=2))
    print(f"\nDone. fetched={fetched} skipped={skipped} not_found={len(not_found)} errors={len(errors)}")
    return 0


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--concurrency", type=int, default=5)
    return ap.parse_args()


if __name__ == "__main__":
    sys.exit(asyncio.run(amain(parse_args())))
