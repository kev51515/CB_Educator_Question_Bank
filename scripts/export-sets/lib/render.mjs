import { readFile, writeFile, mkdir, unlink, link, stat } from 'node:fs/promises';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalize,
  renderQuestionCard,
  renderAnswerCell,
  canonicalStemFor,
  isMixedSkillSet,
  escapeHtml,
} from './format.mjs';
import { htmlFilesToPdfs, compressPdf } from './render-pdf.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TPL_DIR = join(HERE, '..', 'templates');

const DIFFICULTY_KEY = { Hard: 'hard', Medium: 'medium', Easy: 'easy' };

const SECONDS_PER_Q = 90; // est ~1.5 min/q for hard math

export async function renderSet(set, { difficulty, outDir, pdf = false, paper = 'Letter' }) {
  const styles = await readFile(join(TPL_DIR, 'styles.css'), 'utf8');
  const qTpl = await readFile(join(TPL_DIR, 'questions.html'), 'utf8');
  const kTpl = await readFile(join(TPL_DIR, 'key.html'), 'utf8');

  const normalized = set.questions.map(normalize);
  const difficultyKey = DIFFICULTY_KEY[difficulty] || 'hard';
  const [skillTitle, skillSubtitle] = splitTitle(set.skill);
  const estMinutes = Math.round((normalized.length * SECONDS_PER_Q) / 60);

  // Phase A: detect a canonical stem shared by every question in the set.
  // When present, the cover shows it once as a callout and per-card stems
  // are suppressed. Mixed-skill sets keep per-card chips, others drop them.
  const canonicalStem = canonicalStemFor(normalized);
  const isMixed = isMixedSkillSet(normalized);

  const cards = normalized
    .map((q, i) =>
      renderQuestionCard(q, i, {
        canonicalStem,
        isMixed,
        qid: `q${i + 1}`,
      })
    )
    .join('\n');
  const answers = normalized
    .map((q, i) => renderAnswerCell(q, i, difficultyKey))
    .join('\n');

  const domain = normalized[0]?.domain || '';
  const setNumPadded = String(set.setId).padStart(2, '0');
  // Stable per-set identifier used by the test-runner localStorage key. Keeps
  // every difficulty/axis distinct ("by-skill/reading-and-writing/easy/boundaries-set-1").
  const setUidParts = [
    `by-${guessAxis(outDir)}`,
    inferSection(outDir),
    String(difficulty).toLowerCase(),
    set.setName,
  ];
  const setUid = setUidParts.filter(Boolean).join('/');
  // Footer crumb shown on every page after the cover.
  // Format: "Boundaries — Set 1 · Standard English Conventions"
  const pageFooter = cssString(`${set.skill} — Set ${set.setId} · ${domain}`);
  // Key file gets a "· KEY" suffix to differentiate from the questions footer.
  const keyPageFooter = cssString(
    `${set.skill} — Set ${set.setId} · ${domain} · KEY`
  );

  // Collect Q-numbers whose answer could not be determined; surfaced in the
  // footnote so teachers know which entries fall back to the em-dash + rationale.
  const missingQNumbers = normalized
    .map((q, i) => (q.keyMissing ? i + 1 : null))
    .filter((n) => n != null);
  const missingNote = missingQNumbers.length
    ? `<p><strong>Answers recovered from rationale</strong> for Q${missingQNumbers.join(
        ', Q'
      )} — the source CB data omitted a structured key for these items, so the answer slot shows <span class="u-mono">—</span>. The worked solution in the rationale below each entry contains the correct value.</p>`
    : '';

  // Phase A cover callout: rendered only when a canonical stem exists.
  const canonicalStemCallout = canonicalStem
    ? `<aside class="cover-stem-callout">
        <span class="cover-stem-callout__prefix u-ui">Each question asks</span>
        <div class="cover-stem-callout__body">${canonicalStem}</div>
      </aside>`
    : '';

  // Strip variant: a clean "Skill · Set N" title plus a live Q-counter slot
  // for the test-runner. Crumb-style strip is retained only for mixed sets.
  const stripTitle = isMixed
    ? `Mixed · Set ${set.setId}`
    : `${set.skill} · Set ${set.setId}`;

  // Compute the relative href the test-runner script + assets need. The output
  // dir is `data/exports/by-<axis>/<section>/<difficulty>/` (4 levels deep).
  // The `_assets` dir lives at `data/exports/_assets/`, so the runner needs
  // "../../../_assets/test-runner.js" most of the time.
  const assetsRel = relativeAssetsHref(outDir);

  // When the exporter is run with VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
  // in the environment, emit <meta> tags so the persistence.js SupabaseAdapter
  // can pick them up at runtime. Absent env vars → omit the tags (the static
  // pages then fall back to LocalStorageAdapter, as designed).
  const supabaseMetaTags = renderSupabaseMetaTags();

  const sub = {
    title: `${set.skill} — Set ${set.setId}`,
    styles,
    difficultyKey,
    difficultyLabel: difficulty.toUpperCase(),
    domainLabel: domain.toUpperCase(),
    domainLabelTitle: domain,
    skillTitle,
    skillSubtitle,
    skillFull: set.skill,
    setId: set.setId,
    setNumPadded,
    questionCount: normalized.length,
    estMinutes,
    generatedDate: new Date().toISOString().slice(0, 10),
    pageFooter,
    keyPageFooter,
    cards,
    answers,
    missingNote,
    canonicalStemCallout,
    stripTitle,
    setUid,
    assetsRel,
    supabaseMetaTags,
    // Legacy crumb strip — emitted only for mixed sets so individual cards
    // still surface section/difficulty without forcing a per-card chip.
    stripCrumbs: isMixed
      ? `<div class="strip__crumbs">
          <span>${difficulty.toUpperCase()}</span>
          <span>${domain.toUpperCase()}</span>
          <span>Mixed</span>
        </div>`
      : '',
  };

  const questionsHtml = fill(qTpl, sub);
  const keyHtml = fill(kTpl, sub);

  await mkdir(outDir, { recursive: true });
  const qPath = join(outDir, `${set.setName}_questions.html`);
  const kPath = join(outDir, `${set.setName}_key.html`);
  await writeFile(qPath, questionsHtml, 'utf8');
  await writeFile(kPath, keyHtml, 'utf8');

  const result = { questionsPath: qPath, keyPath: kPath };

  if (pdf) {
    const qPdf       = qPath.replace(/\.html$/, '.pdf');
    const qPdfSpaced = qPath.replace(/\.html$/, '-spaced.pdf');
    const kPdf       = kPath.replace(/\.html$/, '.pdf');

    // Render all three PDFs concurrently via the pool. Each runs on its own
    // puppeteer page off the shared browser.
    const jobs = [
      { htmlPath: qPath, pdfPath: qPdf,       density: 'compact', paper },
      { htmlPath: qPath, pdfPath: qPdfSpaced, density: 'spaced',  paper },
      { htmlPath: kPath, pdfPath: kPdf,       density: 'compact', paper },
    ];
    const [compactRes, spacedRes /*, keyRes */] = await htmlFilesToPdfs(jobs);

    // Decide hardlinking BEFORE compression: compressPdf uses atomic rename,
    // which breaks hardlinks. So order is:
    //   1. Detect compact == spaced page count.
    //   2. Compress compact (and key, spaced-if-distinct) in parallel.
    //   3. Hardlink spaced -> compact at the end, after compact is finalized.
    const sameLayout =
      !!compactRes && !!spacedRes &&
      compactRes.pageCount > 0 &&
      compactRes.pageCount === spacedRes.pageCount;

    const toCompress = sameLayout ? [qPdf, kPdf] : [qPdf, qPdfSpaced, kPdf];
    await Promise.all(toCompress.map((p) => compressPdf(p)));

    let hardlinked = false;
    if (sameLayout) {
      try {
        await unlink(qPdfSpaced);
        await link(qPdf, qPdfSpaced);
        hardlinked = true;
      } catch (e) {
        // Non-fatal — re-render spaced as a standalone file if hardlink fails.
        process.stderr.write(`[render] hardlink fallback failed for ${qPdfSpaced}: ${e.message}\n`);
        try {
          await htmlFilesToPdfs([{ htmlPath: qPath, pdfPath: qPdfSpaced, density: 'spaced', paper }]);
          await compressPdf(qPdfSpaced);
        } catch (_) { /* leave whatever state we ended up in */ }
      }
    }

    result.questionsPdf       = qPdf;
    result.questionsPdfSpaced = qPdfSpaced;
    result.keyPdf             = kPdf;
    result.spacedHardlinked   = hardlinked;
  }

  return result;
}

function fill(tpl, sub) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) =>
    sub[k] == null ? '' : String(sub[k])
  );
}

// Escape a string for safe insertion inside CSS content: "..."
function cssString(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// outDir looks like ".../data/exports/by-skill/math/hard". This pulls the
// axis bit so the test-runner set-uid is filesystem-stable.
function guessAxis(outDir) {
  const m = String(outDir).match(/by-([a-z]+)/i);
  return m ? m[1] : 'skill';
}

function inferSection(outDir) {
  const parts = String(outDir).split(/[\\/]+/);
  // .../data/exports/by-<axis>/<section>/<difficulty>
  const i = parts.indexOf('exports');
  return i >= 0 ? parts[i + 2] || '' : '';
}

// Build the <meta> tags that hand the Supabase URL + anon key to the
// runtime SupabaseAdapter in persistence.js. Reads VITE_SUPABASE_URL +
// VITE_SUPABASE_ANON_KEY from the exporter's process env so the secrets
// never live in source. If either is missing we emit nothing, which causes
// SupabaseAdapter.isAvailable() to return false → LocalStorageAdapter wins.
function renderSupabaseMetaTags() {
  const url = process.env.VITE_SUPABASE_URL || '';
  const anon = process.env.VITE_SUPABASE_ANON_KEY || '';
  if (!url || !anon) return '';
  return (
    `<meta name="supabase-url"  content="${escapeAttr(url)}">\n  ` +
    `<meta name="supabase-anon" content="${escapeAttr(anon)}">`
  );
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Build a POSIX-style relative path from the output HTML dir to the shared
// `_assets/` folder. Same conventions as extract-styles.mjs uses for CSS.
function relativeAssetsHref(outDir) {
  // outDir = .../data/exports/by-axis/section/difficulty
  // assetsDir = .../data/exports/_assets
  const parts = String(outDir).split(sep);
  const exportsIdx = parts.indexOf('exports');
  if (exportsIdx < 0) return '_assets';
  const depthBelowExports = parts.length - exportsIdx - 1;
  const up = '../'.repeat(depthBelowExports);
  return (up + '_assets').replace(/\\/g, '/');
}

// Split a skill name into headline + sub headline for the cover.
// "Linear equations in two variables" -> ["Linear equations", "in two variables"]
function splitTitle(skill) {
  if (!skill) return ['', ''];
  // Try splitting at first " in " for a natural break.
  const m = skill.match(/^(.+?)\s+(in\s+.+)$/i);
  if (m) return [m[1], m[2]];
  // Otherwise, try splitting at " and ".
  const m2 = skill.match(/^(.+?)\s+(and\s+.+)$/i);
  if (m2) return [m2[1], m2[2]];
  return [skill, ''];
}
