// Builder for the CB OG linear-format full tests (66 RW + 54 Math = 120 Q;
// 33/RW module, 27/Math module). Reads the 4 per-module transcription files
// (raw/m{1..4}.json from the transcription agents) + a config (answers parsed
// from the official key, optional figure paths) → idempotent seed migration.
// Usage: node .work/cb-og/build-cbog.mjs .work/cb-og/t1 .work/cb-og/t1-config.mjs
import fs from "node:fs";

const dir = process.argv[2];
const cfgPath = process.argv[3];
if (!dir || !cfgPath) { console.error("usage: build-cbog.mjs <testDir> <config.mjs>"); process.exit(1); }
const cfg = (await import(new URL(cfgPath, `file://${process.cwd()}/`))).default;

// A field may be a plain string OR a rich array of run-objects so transcription
// can carry formatting, e.g. ["the term ", {t:"flauna", i:true}, " …"] or
// {t:"2", sup:true}. We serialize runs to the inline markup the renderer
// understands (<i>/<u>/<b>/<sup>/<sub>); math stays as $…$ inside the text.
const richToMarkup = (v) => {
  if (v == null) return v;
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(richToMarkup).join("");
  if (typeof v === "object") {
    let s = String(v.t ?? v.text ?? "");
    if (v.i || v.italic) s = `<i>${s}</i>`;
    if (v.u || v.underline) s = `<u>${s}</u>`;
    if (v.b || v.bold) s = `<b>${s}</b>`;
    if (v.sup) s = `<sup>${s}</sup>`;
    if (v.sub) s = `<sub>${s}</sub>`;
    return s;
  }
  return String(v);
};
const fixText = (s) => s == null ? s : String(richToMarkup(s))
  .replace(/_{2,}/g, "______")
  .replace(/[ \t]{2,}/g, " ")
  .trimEnd();

// merge the 4 module transcription files
let raw = [];
for (let m = 1; m <= 4; m++) {
  const p = `${dir}/raw/m${m}.json`;
  raw = raw.concat(JSON.parse(fs.readFileSync(new URL(p, `file://${process.cwd()}/`), "utf8")));
}

const SECMETA = { "reading-writing": { time: 1920, expect: 33 }, "math": { time: 2100, expect: 27 } };
const figures = cfg.figures || {};

const modules = cfg.modules.map((m) => {
  const qs = raw.filter((x) => x.module === m.module).sort((a, b) => a.number - b.number).map((x) => {
    const ref = `${m.module}-${x.number}`;
    const key = cfg.answers[m.module]?.[x.number];
    // The official key is authoritative for type: a single A–D letter ⇒ mcq,
    // anything else (number / fraction / multi) ⇒ grid. This auto-corrects
    // agent misclassifications (a missed grid transcribed as mcq, etc.).
    const isMcq = typeof key === "string" && /^[A-D]$/.test(key);
    const type = isMcq ? "mcq" : "grid";
    const choices = type === "mcq" ? Object.fromEntries(["A","B","C","D"].map((l) => [l, fixText(x.choices?.[l])])) : null;
    // A graph/geometry/chart figure: keep the description as passage_alt (alt text /
    // answerable fallback) and, until a cropped image is wired, fold it into the
    // passage too so the question is answerable. Tables are already in the passage.
    const isImgFig = x.hasFigure && x.figureType && x.figureType !== "table";
    let passage = fixText(x.passage ?? null);
    const passageAlt = isImgFig ? fixText(x.figureNote ?? null) : null;
    // Prefer a cropped figure image if one exists in the served dir.
    const figFile = `m${m.module}-q${x.number}.png`;
    const figOnDisk = fs.existsSync(`viewer/public/data/tests/${cfg.slug}/figures/${figFile}`);
    const figure = figOnDisk ? `/data/tests/${cfg.slug}/figures/${figFile}` : (figures[ref] ?? null);
    if (isImgFig && !figure && x.figureNote && !(passage || "").includes(x.figureNote.slice(0, 24))) {
      passage = `${passage ? passage + "\n\n" : ""}(Figure: ${fixText(x.figureNote)})`;
    }
    return {
      ref, number: x.number, type, passage, passageAlt, stem: fixText(x.stem), choices, figure,
      correctAnswer: type === "mcq" ? key : (Array.isArray(key) ? key[0] : String(key)),
      accepted: type === "grid" ? (Array.isArray(key) ? key.map(String) : [String(key)]) : null,
      domain: null, sourcePage: x.page,
    };
  });
  return { position: m.position, section: m.section, label: m.label, timeLimitSeconds: SECMETA[m.section].time, questionCount: qs.length, questions: qs };
});

// validate
const problems = [];
for (const mod of modules) {
  const expect = SECMETA[mod.section].expect;
  if (mod.questionCount !== expect) problems.push(`M${mod.position} has ${mod.questionCount} (expect ${expect})`);
  const nums = mod.questions.map((x) => x.number);
  for (let i = 1; i <= expect; i++) if (!nums.includes(i)) problems.push(`${mod.section} p${mod.position} missing Q${i}`);
  for (const x of mod.questions) {
    if (x.type === "mcq") {
      if (!["A","B","C","D"].every((l) => x.choices[l] && x.choices[l].length)) problems.push(`${x.ref} choices`);
      if (!/^[A-D]$/.test(x.correctAnswer || "")) problems.push(`${x.ref} bad mcq answer '${x.correctAnswer}'`);
      else if (!x.choices[x.correctAnswer]) problems.push(`${x.ref} answer not in choices`);
    } else if (!x.accepted?.length || !x.accepted[0]) problems.push(`${x.ref} grid no accepted`);
    if (!x.stem || x.stem.length < 5) problems.push(`${x.ref} empty stem`);
  }
}
if (problems.length) { console.error("VALIDATION FAILED:", problems.join(" | ")); process.exit(1); }

const total = modules.reduce((s, m) => s + m.questionCount, 0);
const q = (s) => (s == null ? "NULL" : `'${String(s).replace(/'/g, "''")}'`);
const j = (o) => (o == null ? "NULL" : `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`);
const n = (v) => (v == null ? "NULL" : String(v));

let out = `-- =============================================================================
-- Migration: ${cfg.migrationName}.sql
-- Purpose:   Seed "${cfg.title}" (College Board linear Digital SAT practice test,
--            66 RW + 54 Math = 120 Q) into the full-test tables from 0048.
--   Source:  ${cfg.source}; official College Board answer key (pdf/Key/).
--   Idempotent upsert on (slug)/(test_id,position)/(module_id,position).
-- =============================================================================
DO $seed$
DECLARE v_test uuid; v_mod uuid;
BEGIN
  INSERT INTO public.tests (slug, ordinal, title, short_title, source, total_questions)
  VALUES (${q(cfg.slug)}, ${n(cfg.ordinal)}, ${q(cfg.title)}, ${q(cfg.shortTitle)}, ${q(cfg.source)}, ${n(total)})
  ON CONFLICT (slug) DO UPDATE SET ordinal=EXCLUDED.ordinal, title=EXCLUDED.title,
    short_title=EXCLUDED.short_title, source=EXCLUDED.source, total_questions=EXCLUDED.total_questions
  RETURNING id INTO v_test;
`;
for (const m of modules) {
  out += `
  INSERT INTO public.test_modules (test_id, position, section, label, time_limit_seconds, question_count)
  VALUES (v_test, ${n(m.position)}, ${q(m.section)}, ${q(m.label)}, ${n(m.timeLimitSeconds)}, ${n(m.questionCount)})
  ON CONFLICT (test_id, position) DO UPDATE SET section=EXCLUDED.section, label=EXCLUDED.label,
    time_limit_seconds=EXCLUDED.time_limit_seconds, question_count=EXCLUDED.question_count
  RETURNING id INTO v_mod;
`;
  m.questions.forEach((qq, i) => {
    out += `  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, ${n(i + 1)}, ${q(qq.ref)}, ${n(qq.number)}, ${q(qq.type)}, ${q(qq.passage)}, ${q(qq.passageAlt)}, ${q(qq.stem)}, ${j(qq.choices)}, ${q(qq.figure)}, ${q(qq.correctAnswer)}, ${j(qq.accepted)}, ${q(qq.domain)}, ${n(qq.sourcePage)})
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
`;
  });
}
out += `END $seed$;\n`;
fs.writeFileSync(`supabase/migrations/${cfg.migrationName}.sql`, out);
console.log(`OK ${cfg.slug}: ${total} questions, ${modules.length} modules → supabase/migrations/${cfg.migrationName}.sql`);
console.log("  figures wired:", Object.keys(figures).length, "| img-figure qs needing crops:",
  raw.filter((x) => x.hasFigure && x.figureType && x.figureType !== "table").map((x) => `${x.module}-${x.number}`).join(", ") || "none");
