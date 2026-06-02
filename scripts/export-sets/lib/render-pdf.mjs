import puppeteer from 'puppeteer';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { stat, rename, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

let browserPromise = null;
let browserUseCount = 0;
const RECYCLE_AFTER = Number(process.env.PDF_RECYCLE_AFTER) || 150;

function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({ headless: 'new' });
    browserUseCount = 0;
  }
  return browserPromise;
}

export async function closeBrowser() {
  if (!browserPromise) return;
  const b = await browserPromise;
  await b.close().catch(() => {});
  browserPromise = null;
  browserUseCount = 0;
}

// Recycle the browser if it's been used a lot — prevents CDP connection
// exhaustion / memory bloat during long batch runs.
async function maybeRecycle() {
  if (browserUseCount >= RECYCLE_AFTER) {
    await closeBrowser();
  }
}

// ----- Ghostscript compression ---------------------------------------------

let _gsAvailable = null;        // null = not yet probed, true/false = result
let _gsWarned = false;

async function probeGhostscript() {
  if (_gsAvailable !== null) return _gsAvailable;
  _gsAvailable = await new Promise((resolve) => {
    const p = spawn('gs', ['--version'], { stdio: 'ignore' });
    p.on('error', () => resolve(false));
    p.on('exit', (code) => resolve(code === 0));
  });
  if (!_gsAvailable && !_gsWarned) {
    _gsWarned = true;
    process.stderr.write('[render-pdf] ghostscript (gs) not found on PATH; skipping PDF compression\n');
  }
  return _gsAvailable;
}

// Compress an existing PDF in-place using gs /ebook. No-op (returns false)
// if gs is missing or if the compressed output is not smaller.
// Returns { compressed: bool, before, after }.
export async function compressPdf(pdfPath) {
  const ok = await probeGhostscript();
  if (!ok) return { compressed: false, before: null, after: null };

  let before;
  try { before = (await stat(pdfPath)).size; } catch { return { compressed: false, before: null, after: null }; }

  const tmpOut = join(tmpdir(), `gs-${randomBytes(6).toString('hex')}.pdf`);

  const exitCode = await new Promise((resolve) => {
    const p = spawn('gs', [
      '-sDEVICE=pdfwrite',
      '-dCompatibilityLevel=1.5',
      '-dPDFSETTINGS=/ebook',
      '-dNOPAUSE',
      '-dQUIET',
      '-dBATCH',
      `-sOutputFile=${tmpOut}`,
      pdfPath,
    ], { stdio: 'ignore' });
    p.on('error', () => resolve(-1));
    p.on('exit', (code) => resolve(code ?? -1));
  });

  if (exitCode !== 0) {
    await unlink(tmpOut).catch(() => {});
    return { compressed: false, before, after: before };
  }

  let after;
  try { after = (await stat(tmpOut)).size; } catch {
    return { compressed: false, before, after: before };
  }

  if (after >= before) {
    // Compression didn't help — leave original intact.
    await unlink(tmpOut).catch(() => {});
    return { compressed: false, before, after: before };
  }

  // Atomic replace.
  await rename(tmpOut, pdfPath);
  return { compressed: true, before, after };
}

// ----- Single-file PDF rendering ------------------------------------------

// Render an existing HTML file to PDF.
// `density` flips body class so the same source produces compact or spaced.
// `paper` selects 'Letter' (default) or 'A4'. For A4 we inject an @page
// override since the print stylesheet hard-codes Letter sizing.
// Returns { pageCount }.
export async function htmlFileToPdf(htmlPath, pdfPath, opts = {}) {
  try {
    return await _renderOnce(htmlPath, pdfPath, opts);
  } catch (err) {
    const msg = String(err && err.message || err);
    if (/Connection closed|Target closed|Protocol error/i.test(msg)) {
      // Browser died mid-run; relaunch a fresh one and retry once.
      process.stderr.write(`[render-pdf] browser disconnected; recycling and retrying ${pdfPath}\n`);
      await closeBrowser();
      return await _renderOnce(htmlPath, pdfPath, opts);
    }
    throw err;
  }
}

async function _renderOnce(htmlPath, pdfPath, { density = 'compact', paper = 'Letter' } = {}) {
  await maybeRecycle();
  const browser = await getBrowser();
  browserUseCount++;
  const page = await browser.newPage();
  try {
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle0' });
    await page.evaluate((d) => {
      document.body.classList.remove('density-compact', 'density-spaced');
      document.body.classList.add('density-' + d);
    }, density);
    // Ensure print media rules apply (page numbers, break rules).
    await page.emulateMediaType('print');

    if (paper === 'A4') {
      // Override the @page size baked into styles.css.
      await page.addStyleTag({ content: '@page { size: A4; }' });
    }

    // Note: we deliberately do NOT pass `path` to page.pdf — when path is set,
    // puppeteer streams directly to disk and returns an empty buffer, which
    // breaks our page-count detection. Capture the buffer and write it ourselves.
    const buf = await page.pdf({
      format: paper === 'A4' ? 'A4' : 'Letter',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
      displayHeaderFooter: false, // we render footer via CSS @page
    });

    await writeFile(pdfPath, buf);
    const pageCount = countPdfPages(buf);
    return { pageCount };
  } finally {
    await page.close().catch(() => {});
  }
}

// Count pages in a PDF by scanning for /Type /Page (not /Pages) markers.
// Accepts a Buffer or Uint8Array — newer puppeteer (v22+) returns Uint8Array
// from page.pdf(), which does not support `.toString('latin1')` directly.
function countPdfPages(buf) {
  if (!buf || !buf.length) return 0;
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  const s = b.toString('latin1');
  // Match `/Type /Page` but not `/Type /Pages`.
  const re = /\/Type\s*\/Page(?!s)/g;
  let n = 0;
  while (re.exec(s) !== null) n++;
  return n;
}

// ----- Concurrency pool ---------------------------------------------------

// Run `jobs` through a pool of `concurrency` workers. Each job is an async
// function returning a value. Results are returned in input order.
export async function runWithConcurrency(jobs, concurrency) {
  const results = new Array(jobs.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= jobs.length) return;
      results[i] = await jobs[i]();
    }
  });
  await Promise.all(workers);
  return results;
}

// Render a batch of PDFs concurrently. Each job:
//   { htmlPath, pdfPath, density?, paper? }
// Returns parallel array of { pageCount } results in the same order.
// Concurrency defaults to PDF_CONCURRENCY env var or 3.
export async function htmlFilesToPdfs(jobsSpec, { concurrency } = {}) {
  const n = concurrency ?? (Number(process.env.PDF_CONCURRENCY) || 3);
  const tasks = jobsSpec.map((j) => () =>
    htmlFileToPdf(j.htmlPath, j.pdfPath, { density: j.density, paper: j.paper })
  );
  return runWithConcurrency(tasks, n);
}
