#!/usr/bin/env python3
"""
audit-passages.py — report-only word-fidelity check of seed passage/stem text
vs the faithful pdftotext extraction. Surfaces dropped/substituted words the
vision agents introduced in the stimulus prose. Does NOT auto-fix (passage
alignment is fuzzy; review first).

Usage: python3 audit-passages.py <testDir> <pdf> [--math]
  (RW modules 1-2 only unless --math; math passages are $-heavy and noisy.)
"""
import json, re, subprocess, sys, difflib
from pathlib import Path

PAGE_W = 612
STRIP_TAGS = re.compile(r'</?(?:i|u|b|sup|sub)>')

def clean(s):
    if not s: return ''
    s = STRIP_TAGS.sub('', s)
    s = re.sub(r'\$[^$]*\$', ' MATH ', s)                # blank out math
    s = re.sub(r'\(Figure:.*?\)', ' ', s, flags=re.S)    # figure annotations
    s = re.sub(r'\|', ' ', s)                            # table pipes
    return (s.replace('’',"'").replace('‘',"'").replace('“','"').replace('”','"')
             .replace('—','--').replace('–','-'))

def words(s):
    return re.findall(r"\S+", clean(s))
def key(w):
    return re.sub(r'[^a-z0-9]', '', w.lower())

def page_count(pdf):
    return int(re.search(r'Pages:\s+(\d+)', subprocess.run(['pdfinfo',pdf],capture_output=True,text=True).stdout).group(1))
def col_text(pdf,p,x,w):
    return subprocess.run(['pdftotext','-layout','-f',str(p),'-l',str(p),'-x',str(x),'-y','0','-W',str(w),'-H','792',pdf,'-'],
                          capture_output=True,text=True).stdout

def faithful_words(pdf):
    out=[]
    for p in range(1,page_count(pdf)+1):
        for x,w in ((0,PAGE_W//2),(PAGE_W//2,PAGE_W//2)):
            for tok in col_text(pdf,p,x,w).split():
                out.append(tok)
    return out

def align(seed_words, faith_words, faith_keys):
    sk=[key(w) for w in seed_words]
    sm=difflib.SequenceMatcher(None, sk, faith_keys, autojunk=False)
    blocks=[b for b in sm.get_matching_blocks() if b.size>0]
    if not blocks: return None
    lo=min(b.b for b in blocks); hi=max(b.b+b.size for b in blocks)
    # require a reasonable match density
    matched=sum(b.size for b in blocks)
    if matched < max(4, len(sk)*0.5): return None
    return faith_words[lo:hi]

def main():
    test_dir, pdf = sys.argv[1], sys.argv[2]
    do_math='--math' in sys.argv
    fw=faithful_words(pdf); fk=[key(w) for w in fw]
    findings=[]
    mods=range(1,5) if do_math else (1,2)
    for m in mods:
        p=Path(test_dir)/'raw'/f'm{m}.json'
        if not p.exists(): continue
        for x in json.loads(p.read_text()):
            for fld in ('passage','stem'):
                sw=words(x.get(fld))
                if len(sw)<5: continue
                aligned=align(sw, fw, fk)
                if not aligned: continue
                sk=[key(w) for w in sw]; ak=[key(w) for w in aligned]
                sm=difflib.SequenceMatcher(None, sk, ak, autojunk=False)
                ops=[]
                for tag,i1,i2,j1,j2 in sm.get_opcodes():
                    if tag=='equal': continue
                    s=' '.join(sw[i1:i2]); pdft=' '.join(aligned[j1:j2])
                    if key(s)==key(pdft): continue
                    ops.append((tag, s, pdft))
                if ops:
                    findings.append((m,x.get('number'),fld,ops))
    print(f"=== {test_dir} passage/stem word audit ({'RW+MATH' if do_math else 'RW only'}) ===")
    print(f"fields with diffs: {len(findings)}\n")
    for m,num,fld,ops in findings:
        print(f"  M{m} Q{num}.{fld}:")
        for tag,s,pdft in ops[:8]:
            print(f"      {tag}: seed={s!r}  pdf={pdft!r}")

if __name__=='__main__':
    main()
