#!/usr/bin/env python3
"""
audit-choices.py — diff seeded answer choices (raw/m{1..4}.json) against the
faithful pdftotext extraction of the source PDF. Catches the vision-transcription
text/punctuation drift (dropped colons/periods/quotes) that silently breaks
questions — fatal on Standard-English-convention items where punctuation IS the
answer.

Method:
  * Extract choices column-by-column (crop each page into left/right halves so
    multi-line choices capture cleanly and the two columns never interleave).
  * Identify each JSON MCQ question's matching PDF choice-group by a multiset
    signature of its 4 alnum-normalized choices (order-independent, robust to
    page-range / grid drift).
  * Compare strictly LETTER-BY-LETTER (A<->A …) so convention questions whose
    choices differ only by punctuation are diffed correctly.

Usage: python3 audit-choices.py <testDir> <pdf>
"""
import json, re, subprocess, sys
from collections import Counter
from pathlib import Path

PAGE_W = 612
CHOICE_RE = re.compile(r'^\s*([A-D])\)\s+(.*\S)\s*$')

STRIP_TAGS = re.compile(r'</?(?:i|u|b|sup|sub)>')
def norm(s: str) -> str:
    s = STRIP_TAGS.sub('', s)
    return (s.replace('’', "'").replace('‘', "'")
             .replace('“', '"').replace('”', '"')
             .replace('—', '--').replace('–', '-')
             .replace(' ', ' ')).strip()

def alnum(s: str) -> str:
    return re.sub(r'[^a-z0-9]', '', norm(s).lower())

def page_count(pdf: str) -> int:
    out = subprocess.run(['pdfinfo', pdf], capture_output=True, text=True).stdout
    return int(re.search(r'Pages:\s+(\d+)', out).group(1))

def col_text(pdf: str, page: int, x: int, w: int) -> str:
    return subprocess.run(
        ['pdftotext', '-layout', '-f', str(page), '-l', str(page),
         '-x', str(x), '-y', '0', '-W', str(w), '-H', '792', pdf, '-'],
        capture_output=True, text=True).stdout

def parse_column(text: str):
    """Parse one single-column text region into ordered choices with multi-line capture."""
    lines = text.split('\n')
    choices = []  # (letter, text)
    i = 0
    while i < len(lines):
        m = CHOICE_RE.match(lines[i])
        if not m:
            i += 1; continue
        letter, buf = m.group(1), m.group(2).strip()
        i += 1
        # consume continuation lines until next choice / blank / dedent marker
        while i < len(lines):
            nxt = lines[i]
            if CHOICE_RE.match(nxt) or nxt.strip() == '':
                break
            # a continuation line is the wrapped remainder of the choice text
            buf += ' ' + nxt.strip()
            i += 1
        choices.append((letter, buf.strip()))
    return choices

def groups_from(choices, page):
    groups, cur = [], {}
    for letter, txt in choices:
        if letter == 'A' and cur:
            if all(k in cur for k in 'ABCD'): groups.append(cur)
            cur = {}
        cur[letter] = txt; cur['page'] = page
        if letter == 'D':
            if all(k in cur for k in 'ABCD'): groups.append(cur)
            cur = {}
    if all(k in cur for k in 'ABCD'): groups.append(cur)
    return groups

def extract_pdf_groups(pdf: str):
    groups = []
    for p in range(1, page_count(pdf) + 1):
        for x, w in ((0, PAGE_W // 2), (PAGE_W // 2, PAGE_W // 2), (0, PAGE_W)):
            groups += groups_from(parse_column(col_text(pdf, p, x, w)), p)
    return groups

def load_json_questions(test_dir: str):
    qs = []
    for m in range(1, 5):
        p = Path(test_dir) / 'raw' / f'm{m}.json'
        if not p.exists(): continue
        for x in json.loads(p.read_text()):
            if x.get('type') == 'mcq' and x.get('choices'):
                qs.append(x)
    return qs

def sig(ch: dict):
    return tuple(sorted(alnum(ch[l]) for l in 'ABCD' if ch.get(l)))

def overlap(a: str, b: str) -> int:
    """Crude char-bag overlap for best-match of an unmatched group."""
    ca, cb = Counter(alnum(a)), Counter(alnum(b))
    return sum((ca & cb).values())

def best_group(ch: dict, groups):
    best, score = None, -1
    for g in groups:
        s = sum(overlap(ch[l], g[l]) for l in 'ABCD')
        if s > score: best, score = g, s
    return best

def main():
    test_dir, pdf = sys.argv[1], sys.argv[2]
    groups = extract_pdf_groups(pdf)
    qs = load_json_questions(test_dir)
    pdf_by_sig = {}
    for g in groups:
        pdf_by_sig.setdefault(sig(g), []).append(g)

    report = []  # machine-readable findings
    matched_diffs, word_diffs, math_skip = [], [], []
    for x in qs:
        ch = x['choices']
        if any('$' in (ch.get(l) or '') for l in 'ABCD'):
            math_skip.append(x); continue
        cands = pdf_by_sig.get(sig(ch))
        exact = bool(cands)
        g = cands[0] if cands else best_group(ch, groups)
        if not g: continue
        per = {}
        for l in 'ABCD':
            if norm(ch[l]) != norm(g[l]):
                per[l] = {'seed': ch[l], 'pdf': g[l]}
        if not per: continue
        rec = {'module': x['module'], 'number': x['number'], 'page': g.get('page'),
               'kind': 'punct' if exact else 'word', 'diffs': per}
        report.append(rec)
        (matched_diffs if exact else word_diffs).append(rec)

    Path(f'{test_dir}/choice-audit.json').write_text(json.dumps(report, indent=2, ensure_ascii=False))

    print(f"=== {test_dir} :: {len(qs)} MCQ | {len(groups)} PDF groups ===")
    print(f"punctuation diffs: {len(matched_diffs)} | word/structural diffs: {len(word_diffs)} | "
          f"math-skipped: {len(math_skip)}  →  {test_dir}/choice-audit.json\n")
    def dump(title, recs):
        if not recs: return
        print(f"--- {title} ---")
        for r in recs:
            print(f"  M{r['module']} Q{r['number']} (p{r['page']}):")
            for l, d in r['diffs'].items():
                print(f"      {l}  seed={d['seed']!r}")
                print(f"         PDF={d['pdf']!r}")
    dump("PUNCTUATION DIFFS (exact-content match, punctuation differs)", matched_diffs)
    dump("WORD / STRUCTURAL DIFFS (best-match; review — may include real word errors)", word_diffs)

if __name__ == '__main__':
    main()
