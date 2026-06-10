#!/usr/bin/env node
/**
 * seed-underline-spans.mjs
 *
 * Restores the UNDERLINE that the OCR/QTI import dropped from full-test
 * passages. 15 questions across the 6 DSAT tests ask about "the underlined
 * portion/sentence/claim", but the stored passages have no markup — so the
 * full-test runner (which now renders `<u>…</u>`, see passageRender.tsx) had
 * nothing to underline.
 *
 * This patch wraps the exact underlined span (verified against each question's
 * source page image) in `<u>…</u>` inside the right field. Idempotent: skips a
 * span already wrapped, and LOUDLY warns if a span isn't an exact substring
 * (so a stale span never silently corrupts a passage).
 *
 * SPAN SOURCING: the underline exists only visually (OCR + the Canvas QTI both
 * flattened it). Each span below was read from the question's source page image
 * (.work/<test>/pages or hires) — do NOT guess spans; verify every one.
 *
 * Branch note: this UPDATES live test content, so it is NOT run on the feature
 * branch — apply it after merge alongside migration 0141.
 * Usage: from viewer/  →  node --env-file-if-exists=../.env scripts/seed-underline-spans.mjs
 *        (add --dry-run to preview without writing)
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL, SERVICE = process.env.SUPABASE_SERVICE_KEY;
if (!URL || !SERVICE) { console.error("seed-underline-spans: missing SUPABASE_URL / SUPABASE_SERVICE_KEY"); process.exit(2); }
const DRY = process.argv.includes("--dry-run");
const svc = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

/**
 * Verified underlined spans. field = the column holding the visible text
 * ('passage' for prose; 'passage_alt' for graph/table alt-text — though those
 * are usually figure-baked and not text-fixable). Each span MUST be an exact
 * substring of the current field value.
 */
const SPANS = [
  {
    slug: "dsat-june-2026-asia",
    ref: "1-7",
    field: "passage",
    span:
      "Certainly, madam, to smile at the jest that leaves a wound in another's heart is to become a principal in the mischief.",
  },
  // --- REMAINING TEXT-FIXABLE QUESTIONS (span TBD — read each source page) ----
  // dsat-june-2026-asia: 1-5 (p7), 1-6 (p8), 2-7 (p36), 2-11 (p43), 2-12 (p44)
  // dsat-2025-aug-asia-a: 1-4, 2-6, 1-9      (source: pdf/2025-08-asia-a-rw.pdf)
  // dsat-2025-jun-us-c:   2-5, 2-8           (source: pdf/2025-06-us-c-rw.pdf)
  // dsat-2025-oct-asia-a: 1-6, 1-7           (source: pdf/2025-10-asia-a-rw.pdf)
  // dsat-2026-mar-asia-a: 1-13               (source: pdf/2026-03-asia-a-rw.pdf)
  // NOT TEXT-FIXABLE (underline is in the graph image / alt-text only):
  //   dsat-nov-2023 1-11 — needs the figure re-rendered, not a text wrap.
];

async function questionByRef(slug, ref) {
  const { data: t } = await svc.from("tests").select("id").eq("slug", slug).maybeSingle();
  if (!t) return null;
  const { data: mods } = await svc.from("test_modules").select("id").eq("test_id", t.id);
  const ids = (mods ?? []).map((m) => m.id);
  if (!ids.length) return null;
  const { data: q } = await svc
    .from("test_questions")
    .select("id, ref, passage, passage_alt")
    .in("module_id", ids)
    .eq("ref", ref)
    .maybeSingle();
  return q ?? null;
}

async function main() {
  let applied = 0, skipped = 0, missing = 0;
  for (const s of SPANS) {
    const q = await questionByRef(s.slug, s.ref);
    if (!q) { console.log(`  MISS  ${s.slug} ${s.ref}: question not found`); missing++; continue; }
    const cur = q[s.field];
    if (typeof cur !== "string") { console.log(`  MISS  ${s.slug} ${s.ref}: ${s.field} is empty`); missing++; continue; }
    const wrapped = `<u>${s.span}</u>`;
    if (cur.includes(wrapped)) { console.log(`  SKIP  ${s.slug} ${s.ref}: already underlined`); skipped++; continue; }
    if (!cur.includes(s.span)) { console.log(`  WARN  ${s.slug} ${s.ref}: span NOT an exact substring — skipping (re-verify the span)`); missing++; continue; }
    const next = cur.replace(s.span, wrapped); // first occurrence only
    if (DRY) { console.log(`  DRY   ${s.slug} ${s.ref}: would wrap ${s.span.length} chars in ${s.field}`); applied++; continue; }
    const { error } = await svc.from("test_questions").update({ [s.field]: next }).eq("id", q.id);
    if (error) { console.log(`  ERR   ${s.slug} ${s.ref}: ${error.message}`); missing++; continue; }
    console.log(`  OK    ${s.slug} ${s.ref}: underlined in ${s.field}`);
    applied++;
  }
  console.log(`\n${DRY ? "(dry-run) " : ""}applied=${applied} skipped=${skipped} missing/warn=${missing} of ${SPANS.length}`);
  process.exit(missing > 0 ? 1 : 0);
}
main().catch((e) => { console.error("seed-underline-spans crashed:", e?.message ?? e); process.exit(1); });
