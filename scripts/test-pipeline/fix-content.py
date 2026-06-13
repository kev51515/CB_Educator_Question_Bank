#!/usr/bin/env python3
"""
fix-content.py — auto-correct seeded raw/mN.json against the faithful PDF.

PHASE A (this pass): answer choices + prose-italic restoration.
  * Choice fidelity: identify each JSON MCQ choice-group by requiring >=3 of 4
    choices to match a PDF group EXACTLY (alnum). The PDF group then becomes the
    source of truth for all 4 choices (fixes the word/punctuation drift). Groups
    that can't reach a >=3 match are LEFT UNTOUCHED and logged for manual/visual
    review (avoids the char-bag mis-match that paired a vocab item to a passage).
  * Italics: pdftohtml -xml emits <i>…</i> for the MinionPro-It font. We keep
    only PROSE italics (titles / scientific binomials / foreign terms) and wrap
    their occurrences in passage/stem/choices with <i>…</i>, skipping math ($…$)
    regions and anything already wrapped. Math-variable italics (single letters,
    formula fragments) are excluded — those render via KaTeX already.

Run with --apply to write changes; default is dry-run (report only).
Usage: python3 fix-content.py <testDir> <pdf> [--apply]
"""
import json, re, subprocess, sys
from pathlib import Path

PAGE_W = 612
CHOICE_RE = re.compile(r'^\s*([A-D])\)\s+(.*\S)\s*$')

STRIP_TAGS = re.compile(r'</?(?:i|u|b|sup|sub)>')
def norm(s: str) -> str:
    s = STRIP_TAGS.sub('', s)
    return (s.replace('’', "'").replace('‘', "'").replace('“', '"').replace('”', '"')
             .replace('—', '--').replace('–', '-').replace(' ', ' ')).strip()
def alnum(s: str) -> str:
    return re.sub(r'[^a-z0-9]', '', norm(s).lower())

def page_count(pdf):
    return int(re.search(r'Pages:\s+(\d+)', subprocess.run(['pdfinfo', pdf], capture_output=True, text=True).stdout).group(1))
def col_text(pdf, page, x, w):
    return subprocess.run(['pdftotext','-layout','-f',str(page),'-l',str(page),'-x',str(x),'-y','0','-W',str(w),'-H','792',pdf,'-'],
                          capture_output=True, text=True).stdout
def parse_column(text):
    lines = text.split('\n'); out=[]; i=0
    while i < len(lines):
        m = CHOICE_RE.match(lines[i])
        if not m: i+=1; continue
        letter, buf = m.group(1), m.group(2).strip(); i+=1
        while i < len(lines) and not CHOICE_RE.match(lines[i]) and lines[i].strip():
            buf += ' ' + lines[i].strip(); i+=1
        out.append((letter, buf.strip()))
    return out
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

def extract_pdf_groups(pdf):
    # per-column (two-column layout) AND full-width (wide table-layout questions)
    groups = []
    for p in range(1, page_count(pdf)+1):
        for x, w in ((0, PAGE_W//2), (PAGE_W//2, PAGE_W//2), (0, PAGE_W)):
            groups += groups_from(parse_column(col_text(pdf, p, x, w)), p)
    return groups

# common words that show up as lone italic runs (split titles) — never wrap alone
STOP = {'the','a','an','and','or','but','of','to','in','on','his','her','its','their',
        'this','that','these','those','for','with','as','at','by','from','love','six',
        'one','two','new','old','south','north','east','west','is','was','are','he','she'}

def _keep_italic(s):
    """Return a safe-to-wrap italic phrase, or None. Conservative: titles /
    binomials / distinctive single words only; rejects common words + math garbage."""
    s = s.strip().rstrip('.,;:!').strip()
    if len(s) < 3: return None
    # only letters/space/period/apostrophe/hyphen/digits/!/accents — reject math symbols (£~_:/{}=…)
    if re.search(r"[^A-Za-z0-9 .'\-!&éèêàóñ—–]", s): return None
    if not re.search(r'[A-Za-z]', s): return None
    words = s.split()
    if len(words) >= 2:
        if all(len(w) <= 2 for w in words): return None  # 'C J w' garbage
        return s
    w = words[0]
    if w.lower() in STOP: return None
    if re.search(r'[A-Z].*[A-Z]', w) or re.search(r'[-\d]', w): return s  # VisiCalc, Babel-17
    if len(w) >= 6: return s                                              # Sphagnum, sapiens
    return None

def harvest_italics(pdf):
    out = '/tmp/_fitalic'
    subprocess.run(['pdftohtml','-xml','-i','-hidden', pdf, out], capture_output=True)
    xml = Path(out+'.xml').read_text(encoding='utf-8', errors='replace')
    spans = [re.sub(r'<[^>]+>','',s).strip() for s in re.findall(r'<i>(.*?)</i>', xml, re.S)]
    keep = set()
    for s in spans:
        k = _keep_italic(s)
        if k: keep.add(k)
    # longest first so "The House of Mirth" wraps before "Mirth"
    return sorted(keep, key=len, reverse=True)

def wrap_italics(text, italics):
    if text is None or '<i>' in text: return text, 0
    # split off math regions; only wrap in non-math segments
    parts = re.split(r'(\$[^$]*\$|\$\$.*?\$\$)', text)
    n = 0
    for idx in range(0, len(parts), 2):  # even indices are non-math
        seg = parts[idx]
        for it in italics:
            # word-ish boundary; avoid wrapping inside an existing tag
            pat = re.compile(r'(?<![<\w])' + re.escape(it) + r'(?![\w>])')
            def repl(m):
                nonlocal n; n += 1; return f'<i>{m.group(0)}</i>'
            seg = pat.sub(repl, seg)
        parts[idx] = seg
    return ''.join(parts), n

def main():
    test_dir, pdf = sys.argv[1], sys.argv[2]
    apply = '--apply' in sys.argv
    groups = extract_pdf_groups(pdf)
    italics = harvest_italics(pdf)
    by_pdf = groups
    choice_fixes, choice_flag, italic_fixes = [], [], []

    for m in range(1, 5):
        p = Path(test_dir)/'raw'/f'm{m}.json'
        if not p.exists(): continue
        data = json.loads(p.read_text())
        changed = False
        for x in data:
            # --- italics in passage / stem ---
            for fld in ('passage','stem'):
                if x.get(fld):
                    new, n = wrap_italics(x[fld], italics)
                    if n: italic_fixes.append((m, x.get('number'), fld, n)); x[fld]=new; changed=True
            # --- choices ---
            if x.get('type')=='mcq' and x.get('choices'):
                ch = x['choices']
                if any('$' in (ch.get(l) or '') for l in 'ABCD'):
                    # math choices: only italics, no text overwrite
                    for l in 'ABCD':
                        new,n = wrap_italics(ch[l], italics)
                        if n: ch[l]=new; changed=True
                    continue
                # best PDF group by exact-alnum match count
                best, bn = None, 0
                for g in by_pdf:
                    c = sum(1 for l in 'ABCD' if alnum(ch[l])==alnum(g[l]))
                    if c > bn: best, bn = g, c
                if best and bn >= 3:
                    for l in 'ABCD':
                        if norm(ch[l]) != norm(best[l]):
                            choice_fixes.append((m, x['number'], l, ch[l], best[l]))
                            ch[l] = best[l]; changed = True
                    # italics inside choices
                    for l in 'ABCD':
                        new,n = wrap_italics(ch[l], italics)
                        if n: ch[l]=new; changed=True
                elif bn < 3 and not all(alnum(ch[l])==alnum(best[l]) for l in 'ABCD') if best else True:
                    choice_flag.append((m, x['number'], bn, {l: ch[l] for l in 'ABCD'}))
        if apply and changed:
            p.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n')

    print(f"=== {test_dir}  ({'APPLIED' if apply else 'DRY-RUN'}) ===")
    print(f"choice fixes: {len(choice_fixes)} | choice groups flagged (manual): {len(choice_flag)} | italic wraps: {sum(n for *_,n in italic_fixes)} across {len(italic_fixes)} fields\n")
    if choice_fixes:
        print("--- CHOICE FIXES (seed -> PDF) ---")
        last=None
        for m,num,l,old,new in choice_fixes:
            if (m,num)!=last: print(f"  M{m} Q{num}:"); last=(m,num)
            print(f"      {l}  {old!r}  ->  {new!r}")
    if choice_flag:
        print(f"\n--- FLAGGED CHOICE GROUPS (couldn't reach >=3 match; VISUAL REVIEW) ---")
        for m,num,bn,ch in choice_flag:
            print(f"  M{m} Q{num} (best {bn}/4): " + " | ".join(f"{l}={ch[l]!r}" for l in 'ABCD')[:200])
    if italic_fixes:
        print(f"\n--- ITALIC RESTORATION (field: #wraps) ---")
        print("  " + ", ".join(f"M{m}Q{num}.{fld}:{n}" for m,num,fld,n in italic_fixes[:40]) + (" …" if len(italic_fixes)>40 else ""))

if __name__ == '__main__':
    main()
