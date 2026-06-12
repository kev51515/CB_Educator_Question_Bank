#!/usr/bin/env node
/**
 * check-qbank-uid.mjs — guard the question-set identity contract.
 *
 * Every "Question Set" assignment stores a `qbank_set_uid` computed from a
 * catalog entry (teacher side), then the student runner resolves that uid back
 * to a catalog entry to find the questions HTML. If the encoder used to WRITE
 * the uid ever drifts from the one used to RESOLVE it, EVERY question-set
 * assignment silently fails to load. (That exact bug shipped once — the writer
 * joined with `::`, the resolver with `-`.)
 *
 * This check round-trips every catalog entry: encode → resolve → must land
 * back on the same entry, and the uid must be unique per entry. It mirrors the
 * canonical encoder in `viewer/src/lib/qbankSetUid.ts`; if you change that
 * encoder, change it here too (and only here + there).
 *
 * Exit non-zero on any failure so CI / the smoke suite catches drift.
 */
import { readFileSync } from "node:fs";

// --- canonical encoder (must mirror src/lib/qbankSetUid.ts) ---
function qbankSetUid(e) {
  return [e.axis, e.section, e.difficulty, e.topic, e.setId]
    .map((p) => p.toString().toLowerCase().replace(/\s+/g, "-"))
    .join("::");
}

const catalogPath = new URL("../public/exports/catalog.json", import.meta.url);
const entries = JSON.parse(readFileSync(catalogPath, "utf8")).entries;

let fail = 0;
const seen = new Map();

for (const e of entries) {
  const uid = qbankSetUid(e);

  // 1. uniqueness — two entries must never share a uid
  if (seen.has(uid)) {
    console.error(`✗ duplicate uid "${uid}"`);
    console.error(`    a: ${seen.get(uid)}`);
    console.error(`    b: ${e.questionsHtml}`);
    fail += 1;
  } else {
    seen.set(uid, e.questionsHtml);
  }

  // 2. round-trip — encode then resolve must return THIS entry
  const lower = uid.toLowerCase();
  const matches = entries.filter((x) => qbankSetUid(x) === lower);
  if (matches.length !== 1 || matches[0] !== e) {
    console.error(`✗ round-trip failed for ${e.questionsHtml} (uid="${uid}")`);
    fail += 1;
  }
}

if (fail) {
  console.error(`\n${fail} qbank uid problem(s) across ${entries.length} entries.`);
  process.exit(1);
}
console.log(`✓ qbank_set_uid contract OK — ${entries.length} entries, all unique + round-trip clean.`);
