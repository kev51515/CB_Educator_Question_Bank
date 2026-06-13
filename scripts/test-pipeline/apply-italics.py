#!/usr/bin/env python3
"""
apply-italics.py — restore italic markup on a live test by (a) converting any
markdown *…* italics to <i>…</i>, and (b) wrapping an explicit list of italic
spans (from a vision-QA JSON file) in <i>…</i>. Word-boundary + math-aware +
idempotent. Emits UPDATE statements (does NOT execute) so they can be reviewed
and rolled into a corrective migration.

Usage: python3 apply-italics.py <slug> [spans.json]
  spans.json: [{"ref":"1-7","field":"passage|stem|choiceA..D","text":"<exact DB substring>"}, ...]
"""
import json, re, subprocess, sys, os

HOST="aws-1-ap-southeast-2.pooler.supabase.com"; USER="postgres.ljdofwovsyaqydcbohhd"
def pw():
    for ln in open(os.path.join(os.path.dirname(__file__),"..","..",".env")):
        if ln.startswith("SUPABASE_DB_PASSWORD="): return ln.split("=",1)[1].strip()
def psql(sql):
    return subprocess.run(["psql","-h",HOST,"-p","5432","-U",USER,"-d","postgres","-tAc",sql],
        capture_output=True,text=True,env=dict(os.environ,PGPASSWORD=pw()))

FIELD_COL={"passage":"passage","stem":"stem","choiceA":"A","choiceB":"B","choiceC":"C","choiceD":"D"}

def md_convert(seg):
    # markdown *word…* -> <i>word…</i> (must start with a letter; never spans newlines)
    return re.sub(r'\*([A-Za-z][^*\n]*?)\*', r'<i>\1</i>', seg)

def wrap_span(text, span):
    """Wrap word-boundary occurrences of span in <i>…</i> within non-math parts,
    skipping any occurrence already adjacent to a tag (idempotent)."""
    if not text or not span: return text
    parts=re.split(r'(\$[^$]*\$)', text)
    pat=re.compile(r'(?<![<\w>])'+re.escape(span)+r'(?![\w>])')
    for i in range(0,len(parts),2):
        parts[i]=pat.sub(lambda m:f'<i>{m.group(0)}</i>', parts[i])
    return ''.join(parts)

def process_field(val, ref, field, spans):
    if val is None: return None
    # 1) markdown conversion in non-math segments
    parts=re.split(r'(\$[^$]*\$)', val)
    for i in range(0,len(parts),2): parts[i]=md_convert(parts[i])
    val=''.join(parts)
    # 2) explicit spans for this ref+field — longest first so a title that
    #    contains a shorter title (e.g. "I GOT UP at 7.19…" ⊃ "I GOT UP") wraps
    #    whole before the substring, and the substring's lookbehind then skips it.
    mine=sorted((s["text"] for s in spans if s["ref"]==ref and s["field"]==field),
                key=len, reverse=True)
    for text in mine:
        val=wrap_span(val, text)
    return val

def main():
    slug=sys.argv[1]
    spans=json.load(open(sys.argv[2])) if len(sys.argv)>2 else []
    out=psql("select coalesce(json_agg(json_build_object('ref',tq.ref,'passage',tq.passage,'stem',tq.stem,"
             "'choiceA',tq.choices->>'A','choiceB',tq.choices->>'B','choiceC',tq.choices->>'C','choiceD',tq.choices->>'D')"
             " order by tm.position,tq.position),'[]') from public.test_questions tq "
             "join public.test_modules tm on tm.id=tq.module_id join public.tests t on t.id=tm.test_id "
             "where t.slug='%s'"%slug.replace("'","''"))
    if out.returncode: sys.exit("psql failed: "+out.stderr[:300])
    rows=json.loads(out.stdout.strip() or "[]")
    refs_with_spans={s["ref"] for s in spans}
    updates=[]
    def q(s): return "'"+s.replace("'","''")+"'"
    for r in rows:
        ref=r["ref"]
        # only touch rows that have spans or contain markdown italics
        has_md=any('*' in (r[f] or '') and re.search(r'\*[A-Za-z][^*\n]*?\*', r[f] or '') for f in FIELD_COL)
        if ref not in refs_with_spans and not has_md: continue
        sets=[]; choice_expr="choices"
        for field,col in FIELD_COL.items():
            new=process_field(r[field], ref, field, spans)
            if new is not None and new!=r[field]:
                if field=="passage": sets.append(f"passage={q(new)}")
                elif field=="stem": sets.append(f"stem={q(new)}")
                else: choice_expr=f"jsonb_set({choice_expr},'{{{col}}}',to_jsonb({q(new)}::text))"
        if choice_expr!="choices": sets.append(f"choices={choice_expr}")
        if sets:
            updates.append(f"UPDATE public.test_questions tq SET {', '.join(sets)} "
                f"FROM public.test_modules tm, public.tests t WHERE tq.module_id=tm.id AND tm.test_id=t.id "
                f"AND t.slug='{slug}' AND tq.ref='{ref}';")
    print(f"-- {slug}: {len(updates)} question(s) updated, {len(spans)} spans")
    for u in updates: print(u)

if __name__=="__main__": main()
