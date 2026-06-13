#!/usr/bin/env node
/**
 * check-test-content.mjs — formalized content QC for seeded full tests.
 * =====================================================================
 * Scans every `test_questions` row (across all `tests`) for the data-quality
 * defects the OCR→seed pipeline tends to introduce, and prints a grouped report.
 * This is the standing "checking process for PDFs and future files": run it after
 * seeding ANY new test (and it doubles as a regression guard on the existing six).
 *
 *   npm run check:content              # human report
 *   npm run check:content -- --json    # machine-readable (one JSON per line)
 *   npm run check:content -- --slug dsat-june-2026-asia   # one test only
 *
 * Checks (each flags a question for REVIEW — it never edits data):
 *   A placeholder_blank_word   — the literal word "blank" sits next to the `___`
 *                                gap (an OCR artifact; the gap already IS the blank)
 *   B choice_trailing_period   — the blank is MID-sentence (prose continues after
 *                                it) yet every choice ends in a terminal mark — a
 *                                spurious period on an in-sentence fragment
 *   C duplicated_word_at_blank — the word right before the gap is also the leading
 *                                word of (nearly) every choice → "seafloor seafloor"
 *   D bracket_artifact         — a single-lowercase-letter/digit bracket like "[a]"
 *                                (a footnote/marker leftover). NOTE: legitimate
 *                                editorial brackets ("[is]", "[P]eople") are NOT
 *                                flagged; nor is LaTeX inside `$…$` (e.g. an nth
 *                                root `\sqrt[5]{…}`) — math is stripped first.
 *   E unbalanced_quote         — odd number of " in the passage (truncation / lost
 *                                close-quote, e.g. a cut-off sentence). EXCLUDES the
 *                                convention item where the quotation deliberately
 *                                opens in the passage and closes inside an answer
 *                                choice (recognised when a choice carries a quote).
 *   F missing_blank            — a "conforms to the conventions" grammar item whose
 *                                passage has no `__` gap at all. (Rhetorical
 *                                "most logically completes" / "most logical
 *                                transition" items legitimately have NO gap — the
 *                                choice appends to the passage end — so they are
 *                                excluded.)
 *   G inconsistent_choice_punct— some choices end in a terminal mark and some don't
 *                                (a period before a closing quote, `."`, counts as
 *                                terminal — that is correct American style). Only a
 *                                defect for lowercase sentence-COMPLETION fragments;
 *                                uppercase phrase/full-sentence choices (e.g. a noun
 *                                phrase beside "No additional information is
 *                                necessary.") legitimately mix punctuation, and
 *                                "…from the notes" rhetorical items are excluded.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_KEY (root ../.env).
 * Exit code: 0 if clean, 1 if any issue found (so CI/scripts can gate on it).
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
if (!URL || !SERVICE) {
  console.error("check-test-content: missing SUPABASE_URL / SUPABASE_SERVICE_KEY (root ../.env).");
  process.exit(2);
}
const argv = process.argv.slice(2);
const asJson = argv.includes("--json");
const slugArg = (() => {
  const i = argv.indexOf("--slug");
  return i >= 0 ? argv[i + 1] : null;
})();

const sb = createClient(URL, SERVICE, { auth: { persistSession: false } });

// A gap is two-or-more underscores. Seeds vary: some tests use `______`, the
// earliest (nov-2023) glues a two-underscore `__` onto a word (`profile__`).
const BLANK = /_{2,}/;
// A choice is "terminated" if it ends in . ! or ? — optionally inside a closing
// quote (`…Sun."` is correctly period-terminated in American style).
const endsTerminal = (c) => /[.!?]["']?\s*$/.test((c || "").trim());
const isGrammar = (stem) => /conforms to the conventions/i.test(stem || "");
const isSynthesis = (stem) =>
  /most logically completes|most logical transition|completes the text with the most|uses (?:relevant )?information from the notes|effectively uses .*\bnotes\b/i.test(stem || "");
/** Strip `$…$` / `$$…$$` math so LaTeX (e.g. \sqrt[5]{…}) isn't mistaken for an artifact. */
const stripMath = (s) => (s || "").replace(/\$\$[^$]*\$\$|\$[^$]*\$/g, " ");
/** A choice that begins lowercase is a true sentence-completion FRAGMENT (vs an
 *  uppercase phrase/full-sentence choice, whose terminal punctuation varies legitimately). */
const startsLower = (c) => /^["'(]?[a-z]/.test((c || "").trim());

/** Strip the placeholder "blank" word so "after the gap" analysis isn't fooled. */
const dropBlankWord = (s) => (s || "").replace(/\bblank\b/gi, " ").replace(/\s+/g, " ").trim();

function checkQuestion(row) {
  const out = [];
  const passage = row.passage || "";
  const stem = row.stem || "";
  const field = passage || stem; // RW grammar items carry the gap in `passage`
  const choices = row.choices && typeof row.choices === "object" ? row.choices : {};
  const choiceVals = Object.values(choices).filter((v) => typeof v === "string");

  // A — literal placeholder word "blank" beside the gap
  if (BLANK.test(field) && /\bblank\b/i.test(field))
    out.push(["placeholder_blank_word", "…" + field.slice(Math.max(0, field.search(BLANK) - 25), field.search(BLANK) + 40) + "…"]);

  // D — single-lowercase-letter/digit bracket artifact like "[a]" (NOT "[is]"/"[P]").
  //     Math is stripped first so a LaTeX nth-root `\sqrt[5]{…}` isn't flagged.
  const br = stripMath(field).match(/\[[a-z0-9]\]/);
  if (br) out.push(["bracket_artifact", br[0] + "  …" + stripMath(field).slice(-50)]);

  // E — unbalanced straight double-quotes (truncation / dropped close-quote).
  //     EXCEPT a Standard-English convention item where the quotation deliberately
  //     OPENS in the passage and CLOSES inside the answer choice (so the passage
  //     alone is odd by design) — recognised when a choice carries a closing quote.
  const choicesHaveQuote = choiceVals.some((c) => /["“”]/.test(c));
  if (((field.match(/"/g) || []).length % 2) === 1 && !(isGrammar(stem) && choicesHaveQuote))
    out.push(["unbalanced_quote", "…" + field.slice(-60)]);

  if (BLANK.test(field)) {
    const idx = field.search(BLANK);
    const before = field.slice(0, idx);
    const after = dropBlankWord(field.slice(idx).replace(BLANK, ""));

    // B — mid-sentence gap but every choice ends in a terminal mark
    const midSentence = /^[("']?[a-z]/.test(after); // prose continues in lowercase
    if (midSentence && choiceVals.length > 0 && choiceVals.every(endsTerminal))
      out.push(["choice_trailing_period", `after-gap:"${after.slice(0, 30)}…"  every choice ends in . / ! / ?`]);

    // C — word before the gap duplicated as the leading word of the choices
    const lastWord = (before.trim().match(/([A-Za-z']+)\s*$/) || [])[1];
    if (lastWord) {
      const leads = choiceVals.map((c) => (c.trim().match(/^([A-Za-z']+)/) || [])[1] || "");
      const dup = leads.filter((w) => w.toLowerCase() === lastWord.toLowerCase()).length;
      if (choiceVals.length >= 2 && dup >= choiceVals.length - 1)
        out.push(["duplicated_word_at_blank", `"${lastWord}" before gap + leads ${dup}/${choiceVals.length} choices`]);
    }
  } else if (isGrammar(stem) && !isSynthesis(stem)) {
    // F — a Standard-English grammar item with no gap slot at all
    out.push(["missing_blank", `stem:"${stem.slice(0, 50)}…"`]);
  }

  // Quotation-completion items: the choices are literary quotes, so their
  // internal/terminal punctuation legitimately varies — exclude from punct check.
  const choicesAreQuotations =
    choiceVals.length > 0 && choiceVals.filter((c) => /^["']/.test(c.trim())).length >= Math.ceil(choiceVals.length / 2);

  // G — inconsistent choice end-punctuation (some terminated, some not). Only a
  //     real defect when the choices are lowercase sentence-COMPLETION fragments
  //     (a spurious period on a fragment). Uppercase phrase/full-sentence choices
  //     legitimately mix punctuation — e.g. noun-phrase options beside a full
  //     sentence like "No additional information is necessary." — so require a
  //     fragment majority before flagging.
  const fragmentMajority = choiceVals.filter(startsLower).length >= Math.ceil(choiceVals.length / 2);
  if (choiceVals.length >= 2 && !isSynthesis(stem) && !choicesAreQuotations && fragmentMajority) {
    const term = choiceVals.filter(endsTerminal).length;
    if (term > 0 && term < choiceVals.length)
      out.push(["inconsistent_choice_punct", `${term}/${choiceVals.length} choices end in a terminal mark`]);
  }

  // H — a quotation choice with an UNBALANCED " (dropped open/close quote) while
  //     its siblings are balanced quotations → that one choice is malformed.
  if (choicesAreQuotations) {
    for (const [k, v] of Object.entries(choices)) {
      if (typeof v === "string" && ((v.match(/"/g) || []).length % 2) === 1)
        out.push(["choice_unbalanced_quote", `choice ${k}: odd number of " (dropped open/close quote)`]);
    }
  }

  return out;
}

const { data, error } = await sb
  .from("test_questions")
  .select("id, number, passage, stem, choices, module:test_modules!inner(position, test:tests!inner(slug, ordinal))");
if (error) {
  console.error("query failed:", error.message);
  process.exit(2);
}

const rows = (data || [])
  .map((r) => ({ ...r, slug: r.module?.test?.slug, ordinal: r.module?.test?.ordinal, position: r.module?.position }))
  .filter((r) => !slugArg || r.slug === slugArg)
  .sort((a, b) => (a.ordinal - b.ordinal) || (a.position - b.position) || (a.number - b.number));

const flagged = [];
for (const r of rows) {
  for (const [code, detail] of checkQuestion(r))
    flagged.push({ slug: r.slug, module: r.position, number: r.number, id: r.id, code, detail });
}

if (asJson) {
  for (const f of flagged) console.log(JSON.stringify(f));
} else {
  const byCode = {};
  for (const f of flagged) (byCode[f.code] ||= []).push(f);
  console.log(`\nContent QC — scanned ${rows.length} questions${slugArg ? ` in ${slugArg}` : " across all tests"}\n${"=".repeat(64)}`);
  for (const code of Object.keys(byCode).sort()) {
    console.log(`\n## ${code}  (${byCode[code].length})`);
    for (const f of byCode[code]) console.log(`  ${f.slug} M${f.module} Q${f.number}  —  ${f.detail}`);
  }
  console.log(`\n${"=".repeat(64)}\nTOTAL: ${flagged.length} flag(s) across ${new Set(flagged.map((f) => `${f.slug}:${f.number}`)).size} question(s)\n`);
}

process.exit(flagged.length > 0 ? 1 : 0);
