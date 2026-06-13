#!/usr/bin/env python3
"""
audit-db.py — QA a LIVE test's answer choices (from the prod DB) against its
source PDF(s). Universal: works for any test slug regardless of how it was
seeded, because it reads the test_questions rows students actually see.

Reuses the PDF extraction + letter-paired matching from audit-choices.py
(column crops + full-width for wide table questions, markup-aware compare).

Connection: pooler host + SUPABASE_DB_PASSWORD from repo-root .env (same as the
other db scripts). Reads questions via psql → JSON (no pg python lib needed).

Usage: python3 audit-db.py <slug> <pdf1> [pdf2 ...]
  e.g. python3 .work/cb-og/audit-db.py dsat-2025-oct-asia-a \
         pdf/2025-10-asia-a-rw.pdf pdf/2025-10-asia-a-math.pdf
"""
import json, subprocess, sys, os, re
sys.path.insert(0, os.path.dirname(__file__))
from importlib import import_module
ac = import_module("audit-choices")  # extract_pdf_groups, parse_column, norm, alnum, sig

HOST = "aws-1-ap-southeast-2.pooler.supabase.com"
USER = "postgres.ljdofwovsyaqydcbohhd"

def db_password():
    for ln in open(os.path.join(os.path.dirname(__file__), "..", "..", ".env")):
        if ln.startswith("SUPABASE_DB_PASSWORD="):
            return ln.split("=", 1)[1].strip()
    raise SystemExit("SUPABASE_DB_PASSWORD not in .env")

def fetch_questions(slug):
    sql = (
        "select coalesce(json_agg(json_build_object("
        "'ref',tq.ref,'number',tq.number,'section',tm.section,'type',tq.type,"
        "'choices',tq.choices) order by tm.position, tq.position),'[]') "
        "from public.test_questions tq "
        "join public.test_modules tm on tm.id=tq.module_id "
        "join public.tests t on t.id=tm.test_id where t.slug=%s" % ("'" + slug.replace("'", "''") + "'")
    )
    env = dict(os.environ, PGPASSWORD=db_password())
    out = subprocess.run(
        ["psql", "-h", HOST, "-p", "5432", "-U", USER, "-d", "postgres", "-tAc", sql],
        capture_output=True, text=True, env=env)
    if out.returncode != 0:
        raise SystemExit("psql failed: " + out.stderr[:400])
    return json.loads(out.stdout.strip() or "[]")

def main():
    slug, pdfs = sys.argv[1], sys.argv[2:]
    if not pdfs:
        raise SystemExit("need at least one PDF")
    qs = fetch_questions(slug)
    groups = []
    for pdf in pdfs:
        groups += ac.extract_pdf_groups(pdf)
    by_sig = {}
    for g in groups:
        by_sig.setdefault(ac.sig(g), []).append(g)

    mcq = [q for q in qs if q.get("type") == "mcq" and q.get("choices")]
    punct, word, math_skip = [], [], 0
    for q in mcq:
        ch = q["choices"]
        if any("$" in (ch.get(l) or "") for l in "ABCD"):
            math_skip += 1; continue
        cands = by_sig.get(ac.sig(ch))
        exact = bool(cands)
        if cands:
            g = cands[0]
        else:
            # best by exact-alnum letter matches (>=3 trustworthy)
            best, bn = None, -1
            for cand in groups:
                c = sum(1 for l in "ABCD" if ac.alnum(ch[l]) == ac.alnum(cand[l]))
                if c > bn: best, bn = cand, c
            g = best
        if not g:
            word.append((q["ref"], {l: {"seed": ch[l], "pdf": "(no PDF match)"} for l in "ABCD"})); continue
        per = {}
        for l in "ABCD":
            if ac.norm(ch[l]) != ac.norm(g[l]):
                per[l] = {"seed": ch[l], "pdf": g[l]}
        if per:
            (punct if exact else word).append((q["ref"], per))

    print(f"=== {slug} :: {len(mcq)} MCQ from DB | {len(groups)} PDF groups ({len(pdfs)} pdf) ===")
    print(f"punctuation diffs: {len(punct)} | word/structural diffs: {len(word)} | math-skipped: {math_skip}\n")
    for title, recs in (("PUNCTUATION DIFFS", punct), ("WORD/STRUCTURAL DIFFS (review)", word)):
        if not recs: continue
        print(f"--- {title} ---")
        for ref, per in recs:
            print(f"  {ref}:")
            for l, d in per.items():
                print(f"      {l}  seed={d['seed']!r}")
                print(f"         PDF={d['pdf']!r}")

if __name__ == "__main__":
    main()
