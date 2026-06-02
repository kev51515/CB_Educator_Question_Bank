"""SAT Question Bank scraper — pure httpx, no browser, no auth needed.

The qbank-api endpoints are unauthenticated. We just POST JSON.

  POST /msreportingquestionbank-prod/questionbank/digital/get-questions
       body: {"asmtEventId":99, "test":<1|2>, "domain":"H,P,Q,S"}
       returns: list of question metadata
  POST /msreportingquestionbank-prod/questionbank/digital/get-question
       body: {"external_id":"<uuid>"}
       returns: full question content (stem, choices, keys, rationale)

Output:
  data/json/<section>/<difficulty>/<domain>/<questionId>.json
  data/index.json
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data" / "json"
INDEX_PATH = ROOT / "data" / "index.json"
PROGRESS_PATH = ROOT / "scraper" / "api_progress.json"
FAILED_PATH = ROOT / "scraper" / "api_failed.json"

API_BASE = "https://qbank-api.collegeboard.org/msreportingquestionbank-prod/questionbank"
ASMT_SAT = 99
SECTIONS = {
    "Math": {"test": 2, "domains": "H,P,Q,S"},
    "Reading and Writing": {"test": 1, "domains": "INI,CAS,EOI,SEC"},
}
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


@dataclass
class Stats:
    enumerated: int = 0
    fetched: int = 0
    skipped: int = 0
    errors_validation: int = 0  # null external_id (IBN questions)
    errors_other: int = 0
    current: str = ""

    def save(self) -> None:
        snap = {**self.__dict__, "updated": now_iso()}
        PROGRESS_PATH.write_text(json.dumps(snap, indent=2))


# ---------- API helpers ----------

async def get_questions(client: httpx.AsyncClient, test: int, domain: str) -> list[dict]:
    r = await client.post(
        f"{API_BASE}/digital/get-questions",
        json={"asmtEventId": ASMT_SAT, "test": test, "domain": domain},
    )
    r.raise_for_status()
    return r.json()


async def get_question(client: httpx.AsyncClient, external_id: str, *, attempts: int = 4) -> dict:
    last_err: Exception | None = None
    for attempt in range(attempts):
        try:
            r = await client.post(
                f"{API_BASE}/digital/get-question",
                json={"external_id": external_id},
                timeout=20.0,
            )
            if r.status_code == 500 and "VALIDATION_ERROR" in r.text:
                # Permanent — don't retry, signal as a structured error
                raise ValidationError(r.text)
            if r.status_code >= 500 and attempt < attempts - 1:
                await asyncio.sleep(1.5 * (2 ** attempt))
                continue
            r.raise_for_status()
            return r.json()
        except ValidationError:
            raise
        except (httpx.HTTPError, httpx.ReadTimeout) as e:
            last_err = e
            if attempt < attempts - 1:
                await asyncio.sleep(1.5 * (2 ** attempt))
                continue
            raise
    raise RuntimeError(f"exhausted: {last_err}")


class ValidationError(Exception):
    pass


# ---------- scraping ----------

async def fetch_one(client: httpx.AsyncClient, item: dict, section: str, stats: Stats, failed: list[dict]) -> None:
    qid = item["questionId"]
    diff = item.get("difficulty", "")
    domain = item.get("primary_class_cd_desc", "Unknown")
    out = question_path(section, diff, domain, qid)
    if out.exists():
        stats.skipped += 1
        return

    if not item.get("external_id"):
        # Null external_id — record for second pass
        stats.errors_validation += 1
        failed.append({"qid": qid, "section": section, "reason": "null_external_id", "meta": item})
        return

    try:
        detail = await get_question(client, item["external_id"])
    except ValidationError as e:
        stats.errors_validation += 1
        failed.append({"qid": qid, "section": section, "reason": "validation", "meta": item, "error": str(e)[:200]})
        return
    except Exception as e:
        stats.errors_other += 1
        failed.append({"qid": qid, "section": section, "reason": "network", "meta": item, "error": str(e)[:200]})
        print(f"[err] {qid}: {type(e).__name__}: {e}", flush=True)
        return

    merged = {
        "questionId": qid,
        "externalId": item.get("external_id"),
        "section": section,
        "difficulty": DIFFICULTY_MAP.get(diff, diff),
        "difficultyCode": diff,
        "domain": domain,
        "domainCode": item.get("primary_class_cd"),
        "skill": item.get("skill_desc"),
        "skillCode": item.get("skill_cd"),
        "scoreBand": item.get("score_band_range_cd"),
        "ibn": item.get("ibn"),
        "updateDate": item.get("updateDate"),
        "createDate": item.get("createDate"),
        "scrapedAt": now_iso(),
        "type": detail.get("type"),
        "stimulus": detail.get("stimulus") or None,
        "stem": detail.get("stem"),
        "answerOptions": detail.get("answerOptions") or detail.get("options"),
        "keys": detail.get("keys"),
        "rationale": detail.get("rationale"),
        "raw": detail,
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(merged, indent=2), encoding="utf-8")
    stats.fetched += 1


async def run_section(client: httpx.AsyncClient, section: str, stats: Stats, failed: list[dict], concurrency: int) -> None:
    cfg = SECTIONS[section]
    stats.current = section
    stats.save()
    print(f"\n=== {section} (test={cfg['test']}) ===", flush=True)

    items = await get_questions(client, cfg["test"], cfg["domains"])
    stats.enumerated += len(items)
    print(f"[enum] {section}: {len(items)} questions", flush=True)

    sem = asyncio.Semaphore(concurrency)

    async def worker(item: dict) -> None:
        async with sem:
            await fetch_one(client, item, section, stats, failed)

    batch = 100
    for i in range(0, len(items), batch):
        chunk = items[i:i + batch]
        await asyncio.gather(*(worker(it) for it in chunk), return_exceptions=False)
        print(
            f"[{section}] batch {i//batch+1}/{(len(items)+batch-1)//batch}: "
            f"fetched={stats.fetched} skipped={stats.skipped} "
            f"val_err={stats.errors_validation} net_err={stats.errors_other}",
            flush=True,
        )
        stats.save()


# ---------- index ----------

def build_index_from_disk() -> None:
    entries: list[dict] = []
    if not DATA_DIR.exists():
        return
    for p in sorted(DATA_DIR.rglob("*.json")):
        try:
            q = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        rel = p.relative_to(ROOT / "data").as_posix()  # 'json/.../qid.json' (viewer-compatible)
        entries.append({
            "id": q.get("questionId") or p.stem,
            "section": q.get("section", ""),
            "difficulty": q.get("difficulty", ""),
            "domain": q.get("domain", ""),
            "skill": q.get("skill", ""),
            "type": q.get("type", ""),
            "path": rel,
        })
    INDEX_PATH.parent.mkdir(parents=True, exist_ok=True)
    INDEX_PATH.write_text(json.dumps(entries, indent=2), encoding="utf-8")
    print(f"[index] {len(entries)} entries → {INDEX_PATH.relative_to(ROOT)}")


async def amain(args: argparse.Namespace) -> int:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    stats = Stats()
    failed: list[dict] = []

    sections = [args.section] if args.section else list(SECTIONS.keys())

    headers = {
        "content-type": "application/json",
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        "accept": "application/json",
        "origin": "https://satsuiteeducatorquestionbank.collegeboard.org",
        "referer": "https://satsuiteeducatorquestionbank.collegeboard.org/",
    }
    limits = httpx.Limits(max_connections=args.concurrency + 2, max_keepalive_connections=args.concurrency)
    async with httpx.AsyncClient(headers=headers, limits=limits, http2=False, timeout=30.0) as client:
        for section in sections:
            await run_section(client, section, stats, failed, args.concurrency)

    FAILED_PATH.write_text(json.dumps(failed, indent=2))
    build_index_from_disk()
    print(
        f"\nDone. enumerated={stats.enumerated} fetched={stats.fetched} "
        f"skipped={stats.skipped} validation_errors={stats.errors_validation} "
        f"network_errors={stats.errors_other}"
    )
    print(f"Failed list: {FAILED_PATH.relative_to(ROOT)}")
    return 0


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--section", choices=list(SECTIONS.keys()))
    ap.add_argument("--concurrency", type=int, default=4)
    return ap.parse_args()


if __name__ == "__main__":
    sys.exit(asyncio.run(amain(parse_args())))
