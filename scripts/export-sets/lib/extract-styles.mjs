#!/usr/bin/env node
// extract-styles.mjs — post-build optimization.
//
// Every generated *_questions.html and *_key.html under data/exports/ inlines
// the same ~40 KB stylesheet. Across 1.5k+ files that's ~60 MB of redundant
// CSS. This script:
//
//   1. Walks data/exports/ for *.html files.
//   2. For each file, finds the FIRST <style>…</style> block (the export
//      stylesheet is always the first style tag in the template).
//   3. If the block matches the canonical export stylesheet (or hasn't yet
//      been extracted), replaces it with a <link rel="stylesheet"> pointing
//      to data/exports/_assets/styles.css.
//   4. Computes the relative href per file based on the file's depth.
//   5. Writes _assets/styles.css once if missing.
//
// Idempotent: a second run is a no-op for already-linked files. Safe to run
// repeatedly during incremental rebuilds.
//
// Run with:
//   node scripts/export-sets/lib/extract-styles.mjs
//
// Notes:
//   • Does NOT touch templates/ or styles.css. Template substitution is
//     orthogonal to this post-processing step.
//   • Detects the export stylesheet by a signature comment ("SAT Question
//     Bank — Export Stylesheet") so we never accidentally rewrite an
//     unrelated <style> block.

import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { join, relative, dirname, sep } from 'node:path';

const EXPORTS_DIR = join(process.cwd(), 'data', 'exports');
const ASSETS_DIR = join(EXPORTS_DIR, '_assets');
const ASSET_PATH = join(ASSETS_DIR, 'styles.css');

// The canonical signature embedded in templates/styles.css — used to detect
// which <style> blocks we own.
const SIGNATURE = 'SAT Question Bank — Export Stylesheet';

// Already-extracted files contain this href fragment; cheap pre-check to skip.
const ALREADY_EXTRACTED_MARKER = '_assets/styles.css';

// ---------------------------------------------------------------------------
// Walk all HTML files under data/exports/, ignoring _assets/.
// ---------------------------------------------------------------------------
async function* walkHtml(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith('_assets')) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      yield* walkHtml(full);
    } else if (e.name.endsWith('.html')) {
      yield full;
    }
  }
}

// ---------------------------------------------------------------------------
// Build a POSIX-style relative href from an HTML file to the asset.
// path.relative may produce backslashes on Windows — normalize to forward
// slashes for safe use inside HTML.
// ---------------------------------------------------------------------------
function relHref(htmlFile) {
  const rel = relative(dirname(htmlFile), ASSET_PATH);
  return rel.split(sep).join('/');
}

// ---------------------------------------------------------------------------
// Try to replace the first <style>…</style> block. Returns:
//   { changed: bool, extracted: string|null, html: string }
// extracted = the inlined CSS we pulled out (for caching to _assets).
// ---------------------------------------------------------------------------
function rewriteHtml(html, href) {
  // Match the first <style>…</style> non-greedily.
  // (We only care about the first; templates only insert one.)
  const openIdx = html.indexOf('<style>');
  if (openIdx === -1) return { changed: false, extracted: null, html };
  const closeIdx = html.indexOf('</style>', openIdx);
  if (closeIdx === -1) return { changed: false, extracted: null, html };

  const css = html.slice(openIdx + '<style>'.length, closeIdx);

  // Only rewrite if this looks like our stylesheet. This prevents accidental
  // damage to any future inline styles that aren't ours.
  if (!css.includes(SIGNATURE)) {
    return { changed: false, extracted: null, html };
  }

  const before = html.slice(0, openIdx);
  const after = html.slice(closeIdx + '</style>'.length);
  const linkTag = `<link rel="stylesheet" href="${href}">`;
  return {
    changed: true,
    extracted: css,
    html: before + linkTag + after,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const t0 = Date.now();
  let scanned = 0;
  let rewritten = 0;
  let alreadyLinked = 0;
  let skipped = 0;
  let assetCss = null;
  let bytesSaved = 0;

  for await (const file of walkHtml(EXPORTS_DIR)) {
    scanned++;
    const html = await readFile(file, 'utf8');

    // Cheap pre-check: file already references _assets/styles.css.
    if (html.includes(ALREADY_EXTRACTED_MARKER) && !html.includes('<style>')) {
      alreadyLinked++;
      continue;
    }

    const href = relHref(file);
    const { changed, extracted, html: out } = rewriteHtml(html, href);
    if (!changed) {
      skipped++;
      continue;
    }

    if (!assetCss && extracted) assetCss = extracted;

    await writeFile(file, out, 'utf8');
    rewritten++;
    bytesSaved += html.length - out.length;
  }

  // Write the shared asset (once) if we extracted CSS this run.
  if (assetCss) {
    await mkdir(ASSETS_DIR, { recursive: true });
    let needWrite = true;
    try {
      const existing = await readFile(ASSET_PATH, 'utf8');
      if (existing === assetCss) needWrite = false;
    } catch { /* file missing — write it */ }
    if (needWrite) await writeFile(ASSET_PATH, assetCss, 'utf8');
  }

  const ms = Date.now() - t0;
  process.stdout.write(
    `[extract-styles] scanned=${scanned} rewritten=${rewritten} ` +
      `alreadyLinked=${alreadyLinked} skipped=${skipped} ` +
      `bytesSaved=${formatBytes(bytesSaved)} · ${ms}ms\n`
  );
  if (assetCss) {
    process.stdout.write(`[extract-styles] asset: ${ASSET_PATH} (${formatBytes(assetCss.length)})\n`);
  }
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

main().catch((err) => {
  process.stderr.write(`[extract-styles] failed: ${err.stack || err}\n`);
  process.exit(1);
});
