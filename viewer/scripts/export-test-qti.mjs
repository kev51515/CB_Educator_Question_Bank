#!/usr/bin/env node
/**
 * export-test-qti.mjs — export a full test as a Canvas-importable QTI 1.2 zip.
 * ==========================================================================
 * Produces a content package that imports straight into **Canvas LMS
 * (Instructure)** via  Settings → Import Course Content → "QTI .zip file".
 * The same artifact also imports into Blackboard / Moodle / Brightspace /
 * Schoology, since QTI 1.2 is the cross-LMS interchange standard.
 *
 * Why this exists: `test_questions` holds the question text AND the answer
 * key, and is deliberately NOT student-selectable (see 0048). This exporter
 * runs with the service-role key (RLS-bypassing) so it can read both, then
 * emits a self-contained package another teacher can load into their own
 * Canvas — including the figure PNGs, bundled and referenced via the Canvas
 * `$IMS-CC-FILEBASE$` token so images survive the import (no manual re-upload).
 *
 * Package shape (default: one Canvas quiz per test module):
 *   <slug>-canvas-qti.zip
 *   ├── imsmanifest.xml                       — declares assessments + images
 *   ├── README.txt                            — import steps + grid-in caveat
 *   ├── g<id>/g<id>.xml                        — QTI 1.2 assessment (per module)
 *   ├── g<id>/assessment_meta.xml             — Canvas quiz metadata (title, time limit)
 *   └── web_resources/figures/*.png           — bundled figures
 *
 * Question-type mapping:
 *   mcq  → multiple_choice_question  (choices A–D; correct_answer flagged)
 *   grid → short_answer_question     (fill-in-blank; `accepted` array = OR of
 *                                     correct text answers, preserves "45/8"
 *                                     alongside "5.625")
 *
 * Run:
 *   cd viewer
 *   node --env-file-if-exists=../.env scripts/export-test-qti.mjs
 *   node --env-file-if-exists=../.env scripts/export-test-qti.mjs --slug=dsat-nov-2023
 *   node --env-file-if-exists=../.env scripts/export-test-qti.mjs --single   # one combined quiz
 *   node --env-file-if-exists=../.env scripts/export-test-qti.mjs --out=/tmp/x.zip
 */
import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync, mkdirSync, writeFileSync, copyFileSync, existsSync, rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..", ".."); // viewer/scripts -> repo root
const PUBLIC = resolve(REPO, "viewer", "public"); // where /data/... is served from

// ---- args ----------------------------------------------------------------
const args = process.argv.slice(2);
const getArg = (name, dflt) => {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return dflt;
  const eq = hit.indexOf("=");
  return eq === -1 ? true : hit.slice(eq + 1);
};
const SLUG = getArg("slug", args.find((a) => !a.startsWith("--")) || "dsat-nov-2023");
const SINGLE = !!getArg("single", false);
const OUT = getArg("out", null);

// ---- env -----------------------------------------------------------------
const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
if (!URL || !SERVICE) {
  console.error("export-test-qti: missing SUPABASE_URL / SUPABASE_SERVICE_KEY (root ../.env).");
  console.error("  run: cd viewer && node --env-file-if-exists=../.env scripts/export-test-qti.mjs");
  process.exit(2);
}
const sb = createClient(URL, SERVICE, { auth: { persistSession: false } });

// ---- helpers -------------------------------------------------------------
const gid = () => "g" + Math.random().toString(16).slice(2).padEnd(13, "0").slice(0, 13)
  + Math.random().toString(16).slice(2, 8);
// Stable-ish 32-hex-ish identifier with the Canvas-conventional 'g' prefix.
const newId = () => "g" + [...crypto.getRandomValues(new Uint8Array(16))]
  .map((b) => b.toString(16).padStart(2, "0")).join("");

const xmlEsc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");
// Escape raw user text for use *inside* HTML, then we xml-escape the whole
// HTML blob again when embedding in <mattext> (two layers: HTML-in-XML).
const htmlEsc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const htmlText = (s) => htmlEsc(s).replace(/\r\n|\r|\n/g, "<br/>");

// ---- figure collection ---------------------------------------------------
const figures = new Map(); // basename -> absolute source path
const warnings = [];
function figureRef(figure) {
  // figure is like "/data/tests/dsat-nov-2023/figures/m3-q1.png"
  if (!figure) return null;
  const rel = figure.replace(/^\//, "");
  const candidates = [
    join(PUBLIC, rel),
    join(REPO, rel),
    join(REPO, "viewer", "dist", rel),
  ];
  const src = candidates.find((p) => existsSync(p));
  const name = basename(figure);
  if (!src) {
    warnings.push(`figure not found on disk, skipping <img>: ${figure}`);
    return null;
  }
  figures.set(name, src);
  // Canvas resolves $IMS-CC-FILEBASE$ to the course Files root on import.
  return `%24IMS-CC-FILEBASE%24/figures/${encodeURIComponent(name)}`;
}

// Build the HTML body (passage + stem + optional figure) for a question.
function questionBodyHtml(q) {
  const parts = [];
  if (q.passage && q.passage.trim()) {
    parts.push(`<div class="passage"><p>${htmlText(q.passage)}</p></div>`);
  }
  const ref = figureRef(q.figure);
  if (ref) {
    const alt = htmlEsc(q.passage_alt || `Figure for question ${q.number}`);
    parts.push(`<p><img src="${ref}" alt="${alt}"/></p>`);
  } else if (q.figure && q.passage_alt) {
    // figure missing but we have an a11y/textual description — use it
    parts.push(`<div class="figure-alt"><p>${htmlText(q.passage_alt)}</p></div>`);
  }
  parts.push(`<div class="stem"><p>${htmlText(q.stem)}</p></div>`);
  return `<div>${parts.join("")}</div>`;
}

// ---- QTI item builders ---------------------------------------------------
function mcqItem(q) {
  const itemId = newId();
  const bank = newId();
  const choices = q.choices || {};
  const letters = Object.keys(choices); // ["A","B","C","D"]
  const labels = letters.map((L) => ({ L, id: `${itemId}_${L}`, html: choices[L] }));
  const correct = labels.find((c) => c.L === q.correct_answer);
  const originalIds = labels.map((c) => c.id).join(",");

  const renderChoices = labels.map((c) => `
        <response_label ident="${c.id}">
          <material>
            <mattext texttype="text/html">${xmlEsc(`<div>${htmlText(c.html)}</div>`)}</mattext>
          </material>
        </response_label>`).join("");

  const correctCond = correct ? `
      <respcondition continue="No">
        <conditionvar>
          <varequal respident="response1">${xmlEsc(correct.id)}</varequal>
        </conditionvar>
        <setvar action="Set" varname="SCORE">100</setvar>
      </respcondition>` : "";

  return `
    <item ident="${itemId}" title="${xmlEsc(`Question ${q.number}`)}">
      <itemmetadata>
        <qtimetadata>
          <qtimetadatafield><fieldlabel>question_type</fieldlabel><fieldentry>multiple_choice_question</fieldentry></qtimetadatafield>
          <qtimetadatafield><fieldlabel>points_possible</fieldlabel><fieldentry>1.0</fieldentry></qtimetadatafield>
          <qtimetadatafield><fieldlabel>original_answer_ids</fieldlabel><fieldentry>${originalIds}</fieldentry></qtimetadatafield>
          <qtimetadatafield><fieldlabel>assessment_question_identifierref</fieldlabel><fieldentry>${bank}</fieldentry></qtimetadatafield>
        </qtimetadata>
      </itemmetadata>
      <presentation>
        <material>
          <mattext texttype="text/html">${xmlEsc(questionBodyHtml(q))}</mattext>
        </material>
        <response_lid ident="response1" rcardinality="Single">
          <render_choice>${renderChoices}
          </render_choice>
        </response_lid>
      </presentation>
      <resprocessing>
        <outcomes>
          <decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/>
        </outcomes>${correctCond}
      </resprocessing>
    </item>`;
}

function gridItem(q) {
  const itemId = newId();
  const bank = newId();
  // accepted answers: union of `accepted` array + canonical correct_answer
  const accepted = Array.isArray(q.accepted) ? q.accepted.slice() : [];
  if (q.correct_answer && !accepted.includes(q.correct_answer)) accepted.unshift(q.correct_answer);
  const uniq = [...new Set(accepted.map((a) => String(a)))];
  // Canvas short_answer treats repeated <varequal> siblings as OR.
  const varequals = uniq.map((a) => `
          <varequal respident="response1">${xmlEsc(a)}</varequal>`).join("");

  return `
    <item ident="${itemId}" title="${xmlEsc(`Question ${q.number}`)}">
      <itemmetadata>
        <qtimetadata>
          <qtimetadatafield><fieldlabel>question_type</fieldlabel><fieldentry>short_answer_question</fieldentry></qtimetadatafield>
          <qtimetadatafield><fieldlabel>points_possible</fieldlabel><fieldentry>1.0</fieldentry></qtimetadatafield>
          <qtimetadatafield><fieldlabel>assessment_question_identifierref</fieldlabel><fieldentry>${bank}</fieldentry></qtimetadatafield>
        </qtimetadata>
      </itemmetadata>
      <presentation>
        <material>
          <mattext texttype="text/html">${xmlEsc(questionBodyHtml(q))}</mattext>
        </material>
        <response_str ident="response1" rcardinality="Single">
          <render_fib>
            <response_label ident="answer1" rshuffle="No"/>
          </render_fib>
        </response_str>
      </presentation>
      <resprocessing>
        <outcomes>
          <decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/>
        </outcomes>
        <respcondition continue="No">
          <conditionvar>${varequals}
          </conditionvar>
          <setvar action="Set" varname="SCORE">100</setvar>
        </respcondition>
      </resprocessing>
    </item>`;
}

const itemXml = (q) => (q.type === "grid" ? gridItem(q) : mcqItem(q));

// Build a full QTI assessment doc + its Canvas meta doc for a set of questions.
function buildAssessment({ assessId, title, description, questions, timeLimitMin }) {
  const items = questions.map(itemXml).join("\n");
  const assessment = `<?xml version="1.0" encoding="UTF-8"?>
<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsglobal.org/xsd/ims_qtiasiv1p2 http://www.imsglobal.org/xsd/ims_qtiasiv1p2p1.xsd">
  <assessment ident="${assessId}" title="${xmlEsc(title)}">
    <qtimetadata>
      <qtimetadatafield>
        <fieldlabel>cc_maxattempts</fieldlabel>
        <fieldentry>1</fieldentry>
      </qtimetadatafield>
    </qtimetadata>
    <section ident="root_section">${items}
    </section>
  </assessment>
</questestinterop>
`;

  const meta = `<?xml version="1.0" encoding="UTF-8"?>
<quiz identifier="${assessId}" xmlns="http://canvas.instructure.com/xsd/cccv1p0"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://canvas.instructure.com/xsd/cccv1p0 https://canvas.instructure.com/xsd/cccv1p0.xsd">
  <title>${xmlEsc(title)}</title>
  <description>${xmlEsc(`<p>${htmlText(description || "")}</p>`)}</description>
  <quiz_type>assignment</quiz_type>
  <points_possible>${questions.length}.0</points_possible>
  <shuffle_answers>false</shuffle_answers>
  <scoring_policy>keep_highest</scoring_policy>
  <hide_results></hide_results>
  <quiz_identifierref>${assessId}</quiz_identifierref>
  <allowed_attempts>1</allowed_attempts>
  <one_question_at_a_time>false</one_question_at_a_time>
  <cant_go_back>false</cant_go_back>${timeLimitMin ? `\n  <time_limit>${timeLimitMin}</time_limit>` : ""}
  <available>false</available>
  <published>false</published>
</quiz>
`;
  return { assessment, meta };
}

// ---- main ----------------------------------------------------------------
async function main() {
  console.log(`export-test-qti: slug=${SLUG} mode=${SINGLE ? "single-quiz" : "per-module"}`);

  const { data: test, error: e1 } = await sb
    .from("tests").select("*").eq("slug", SLUG).single();
  if (e1 || !test) {
    console.error(`  test not found for slug "${SLUG}": ${e1?.message || "no row"}`);
    process.exit(1);
  }
  const { data: modules, error: e2 } = await sb
    .from("test_modules").select("*").eq("test_id", test.id).order("position");
  if (e2) { console.error("  modules query failed:", e2.message); process.exit(1); }

  // load all questions per module
  const byModule = [];
  for (const m of modules) {
    const { data: qs, error: e3 } = await sb
      .from("test_questions").select("*").eq("module_id", m.id).order("position");
    if (e3) { console.error("  questions query failed:", e3.message); process.exit(1); }
    byModule.push({ module: m, questions: qs || [] });
  }
  const totalQ = byModule.reduce((n, b) => n + b.questions.length, 0);
  console.log(`  loaded ${modules.length} modules, ${totalQ} questions`);

  // ---- build assessments ----
  // assessment id -> { folder, title, assessment, meta }
  const assessments = [];
  if (SINGLE) {
    const id = newId();
    const all = byModule.flatMap((b) => b.questions);
    const { assessment, meta } = buildAssessment({
      assessId: id,
      title: test.title,
      description: `${test.source || ""}`.trim() || test.title,
      questions: all,
      timeLimitMin: null,
    });
    assessments.push({ id, title: test.title, assessment, meta });
  } else {
    for (const { module: m, questions } of byModule) {
      if (!questions.length) continue;
      const id = newId();
      const title = `${test.short_title || test.title} — ${m.label}`;
      const { assessment, meta } = buildAssessment({
        assessId: id,
        title,
        description: `${test.title} · ${m.label} (${m.section})`,
        questions,
        timeLimitMin: m.time_limit_seconds ? Math.round(m.time_limit_seconds / 60) : null,
      });
      assessments.push({ id, title, assessment, meta });
    }
  }

  // ---- stage files in a temp dir ----
  const stage = mkdtempSync(join(tmpdir(), "qti-"));
  for (const a of assessments) {
    const dir = join(stage, a.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${a.id}.xml`), a.assessment);
    writeFileSync(join(dir, "assessment_meta.xml"), a.meta);
  }
  // figures
  const figDir = join(stage, "web_resources", "figures");
  if (figures.size) mkdirSync(figDir, { recursive: true });
  const figResources = [];
  for (const [name, src] of figures) {
    copyFileSync(src, join(figDir, name));
    figResources.push({ id: newId(), href: `web_resources/figures/${name}` });
  }

  // ---- manifest ----
  const manifestId = newId();
  const assessmentResources = assessments.map((a) => `
    <resource identifier="${a.id}" type="imsqti_xmlv1p2/imscc_xmlv1p1/assessment" href="${a.id}/${a.id}.xml">
      <file href="${a.id}/${a.id}.xml"/>
      <dependency identifierref="${a.id}_meta"/>
    </resource>
    <resource identifier="${a.id}_meta" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="${a.id}/assessment_meta.xml">
      <file href="${a.id}/assessment_meta.xml"/>
    </resource>`).join("");
  const imageResources = figResources.map((f) => `
    <resource identifier="${f.id}" type="webcontent" href="${f.href}">
      <file href="${f.href}"/>
    </resource>`).join("");

  const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${manifestId}"
  xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"
  xmlns:lom="http://ltsc.ieee.org/xsd/imscc/LOM"
  xmlns:imsmd="http://www.imsglobal.org/xsd/imsmd_v1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsglobal.org/xsd/imscp_v1p1 http://www.imsglobal.org/xsd/imscp_v1p1.xsd http://ltsc.ieee.org/xsd/imscc/LOM http://www.imsglobal.org/profile/cc/ccv1p1/LOM/ccv1p1_lomresource_v1p0.xsd http://www.imsglobal.org/xsd/imsmd_v1p2 http://www.imsglobal.org/xsd/imsmd_v1p2p2.xsd">
  <metadata>
    <schema>IMS Content</schema>
    <schemaversion>1.1.3</schemaversion>
  </metadata>
  <organizations/>
  <resources>${assessmentResources}${imageResources}
  </resources>
</manifest>
`;
  writeFileSync(join(stage, "imsmanifest.xml"), manifest);

  // ---- README ----
  const readme = `Canvas (Instructure) QTI import — ${test.title}
${"=".repeat(48)}

WHAT THIS IS
  A QTI 1.2 content package. ${assessments.length} quiz/quizzes, ${totalQ} questions,
  ${figures.size} bundled figure image(s).

HOW TO IMPORT INTO CANVAS
  1. Open the destination course in Canvas.
  2. Settings (left nav) → "Import Course Content" (right side).
  3. Content Type: "QTI .zip file".
  4. Choose this .zip file → "Import".
  5. After it runs, find the quiz/quizzes under Quizzes (Classic Quizzes).
     Each module imported as its own quiz; figures land in course Files
     and are referenced automatically.
  (To use New Quizzes: import as above, then use Canvas's "Migrate to
   New Quizzes" on each quiz.)

QUESTION TYPES
  - Multiple choice  → Canvas "Multiple Choice"
  - SAT grid-in      → Canvas "Fill in the Blank" (short answer). All
                       accepted forms (e.g. "45/8" AND "5.625") are loaded
                       as correct answers. NOTE: Canvas matches these as
                       EXACT TEXT (case-insensitive). If a student types a
                       form not in the list (e.g. extra trailing zeros), it
                       won't auto-grade — review grid-in answer keys after
                       import and add forms as needed.

TIME LIMITS
  Per-module time limits are set in each quiz's settings (from the test's
  module timing). Adjust to taste.

Generated by viewer/scripts/export-test-qti.mjs
`;
  writeFileSync(join(stage, "README.txt"), readme);

  // ---- zip ----
  const outPath = OUT
    ? resolve(OUT)
    : resolve(REPO, `${SLUG}-canvas-qti.zip`);
  if (existsSync(outPath)) rmSync(outPath);
  const r = spawnSync("zip", ["-r", "-X", "-q", outPath, "."], { cwd: stage });
  if (r.status !== 0) {
    console.error("  zip failed:", r.stderr?.toString() || r.error?.message);
    process.exit(1);
  }
  rmSync(stage, { recursive: true, force: true });

  if (warnings.length) {
    console.log(`  ⚠️  ${warnings.length} warning(s):`);
    for (const w of warnings) console.log(`     - ${w}`);
  }
  console.log(`  ✅ wrote ${outPath}`);
  console.log(`     ${assessments.length} quiz(es), ${totalQ} questions, ${figures.size} figure(s)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
