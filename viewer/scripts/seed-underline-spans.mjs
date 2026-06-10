#!/usr/bin/env node
/**
 * seed-underline-spans.mjs
 *
 * Restores the UNDERLINE the OCR/QTI import dropped from full-test passages. 14
 * prose questions across the DSAT tests ask about "the underlined portion/
 * sentence/claim/phrase", but the stored passages have no markup — so the runner
 * (which now renders <u>…</u>, see passageRender.tsx) had nothing to underline.
 *
 * ANCHOR-BASED + exact by construction: each entry gives a clean `start` and
 * `end` phrase read from the question's SOURCE PAGE image (pdf/*.pdf). The
 * script locates those anchors in the CURRENT stored passage and wraps the slice
 * between them in <u>…</u>. Because the span is sliced from the live text, it is
 * always an exact substring — and OCR quirks in the MIDDLE of a span (e.g.
 * "Truslow" for "Truelove") don't matter, only the clean end anchors do.
 *
 * Safety: skips if already wrapped; LOUDLY warns (and changes nothing) if an
 * anchor isn't found or end precedes start. --dry-run prints the resolved span
 * for every entry without writing.
 *
 * Branch note: this UPDATES live test content, so it is NOT run on the feature
 * branch — apply it after merge alongside migration 0141.
 * Usage: from viewer/  →  node --env-file-if-exists=../.env scripts/seed-underline-spans.mjs [--dry-run]
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL, SERVICE = process.env.SUPABASE_SERVICE_KEY;
if (!URL || !SERVICE) { console.error("seed-underline-spans: missing SUPABASE_URL / SUPABASE_SERVICE_KEY"); process.exit(2); }
const DRY = process.argv.includes("--dry-run");
const svc = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

/**
 * Each entry: { slug, ref, field, start, end } — anchors verified against the
 * source page image. The underlined span is passage[startIdx .. endIdx+end.len].
 * field is 'passage' for all (prose). nov-2023 1-11 is omitted: its underline is
 * baked into the graph image, not text — not fixable with a <u> wrap.
 */
const SPANS = [
  // dsat-june-2026-asia
  { slug: "dsat-june-2026-asia", ref: "1-5",  field: "passage", start: "creative thinking", end: "and persistence" },
  { slug: "dsat-june-2026-asia", ref: "1-6",  field: "passage", start: "However, studies have found", end: "which is closer to the truth." },
  { slug: "dsat-june-2026-asia", ref: "1-7",  field: "passage", start: "Certainly, madam, to smile", end: "principal in the mischief." },
  { slug: "dsat-june-2026-asia", ref: "2-7",  field: "passage", start: "though media scholar Jane Feuer", end: "distinctive features." },
  { slug: "dsat-june-2026-asia", ref: "2-11", field: "passage", start: "Furthermore, when the assumed cell", end: "from 18.8% to 31.3%." },
  { slug: "dsat-june-2026-asia", ref: "2-12", field: "passage", start: "The Dixie dingo", end: "unique to Northeast Asian dogs." },
  // dsat-2025-aug-asia-a
  { slug: "dsat-2025-aug-asia-a", ref: "1-4", field: "passage", start: "For example, the tree roots", end: "habitats for animal life." },
  { slug: "dsat-2025-aug-asia-a", ref: "1-9", field: "passage", start: "Thanks to", end: "speak the language has increased." },
  { slug: "dsat-2025-aug-asia-a", ref: "2-6", field: "passage", start: "Most other contemporaneous", end: "favored by elites" },
  // dsat-2025-jun-us-c
  { slug: "dsat-2025-jun-us-c", ref: "2-5", field: "passage", start: "pine from your", end: "own yard" },
  { slug: "dsat-2025-jun-us-c", ref: "2-8", field: "passage", start: "Some critics have found fault", end: "arbitrarily stop." },
  // dsat-2025-oct-asia-a
  { slug: "dsat-2025-oct-asia-a", ref: "1-6", field: "passage", start: "thus capitalizing", end: "biological past." },
  { slug: "dsat-2025-oct-asia-a", ref: "1-7", field: "passage", start: "The smoothness with which participants", end: "around them" },
  // dsat-2026-mar-asia-a
  { slug: "dsat-2026-mar-asia-a", ref: "1-13", field: "passage", start: "Though participants achieved some success", end: "in the video recordings." },
];

async function questionByRef(slug, ref) {
  const { data: t } = await svc.from("tests").select("id").eq("slug", slug).maybeSingle();
  if (!t) return null;
  const { data: mods } = await svc.from("test_modules").select("id").eq("test_id", t.id);
  const ids = (mods ?? []).map((m) => m.id);
  if (!ids.length) return null;
  const { data: q } = await svc.from("test_questions")
    .select("id, passage, passage_alt").in("module_id", ids).eq("ref", ref).maybeSingle();
  return q ?? null;
}

/** Resolve the underlined slice from a stored field using the anchors. */
function resolveSpan(text, start, end) {
  const sIdx = text.indexOf(start);
  if (sIdx === -1) return { ok: false, why: `start not found: "${start}"` };
  const eIdx = text.indexOf(end, sIdx + start.length - 1);
  if (eIdx === -1) return { ok: false, why: `end not found after start: "${end}"` };
  const span = text.slice(sIdx, eIdx + end.length);
  return { ok: true, span };
}

async function main() {
  let applied = 0, skipped = 0, problems = 0;
  for (const s of SPANS) {
    const tag = `${s.slug} ${s.ref}`;
    const q = await questionByRef(s.slug, s.ref);
    if (!q) { console.log(`  MISS  ${tag}: question not found`); problems++; continue; }
    const cur = q[s.field];
    if (typeof cur !== "string") { console.log(`  MISS  ${tag}: ${s.field} empty`); problems++; continue; }
    if (cur.includes(`<u>`) && cur.includes(`</u>`)) { console.log(`  SKIP  ${tag}: already has <u>`); skipped++; continue; }
    const r = resolveSpan(cur, s.start, s.end);
    if (!r.ok) { console.log(`  WARN  ${tag}: ${r.why}`); problems++; continue; }
    const next = cur.replace(r.span, `<u>${r.span}</u>`);
    if (DRY) { console.log(`  DRY   ${tag}: <u>${r.span.slice(0, 90)}${r.span.length > 90 ? "…" : ""}</u>`); applied++; continue; }
    const { error } = await svc.from("test_questions").update({ [s.field]: next }).eq("id", q.id);
    if (error) { console.log(`  ERR   ${tag}: ${error.message}`); problems++; continue; }
    console.log(`  OK    ${tag}: underlined ${r.span.length} chars`);
    applied++;
  }
  console.log(`\n${DRY ? "(dry-run) " : ""}resolved=${applied} skipped=${skipped} problems=${problems} of ${SPANS.length}`);
  process.exit(problems > 0 ? 1 : 0);
}
main().catch((e) => { console.error("seed-underline-spans crashed:", e?.message ?? e); process.exit(1); });
