#!/usr/bin/env node
// audit.mjs — health check across the entire data/json/ question bank.
//
// Walks every section × difficulty × domain folder, normalizes each question,
// and reports:
//   • Total Qs per section/difficulty (and grand total)
//   • Broken questions (empty keys AND empty answerOptions)
//   • Suspicious context refs ("above" in stem but no raw.body/stimulus)
//   • Rare skills (<10 questions — likely typos or stragglers)
//   • Median stem length per skill (chars, HTML stripped)
//
// Output:
//   • data/audit.md   — human-readable Markdown report
//   • data/audit.json — machine-readable companion
//
// Run with:
//   node scripts/export-sets/audit.mjs
//
// Target runtime: <5s on the full ~3.4k question dataset.

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = join(process.cwd(), 'data', 'json');
const OUT_MD = join(process.cwd(), 'data', 'audit.md');
const OUT_JSON = join(process.cwd(), 'data', 'audit.json');

const SECTIONS = ['math', 'reading-and-writing'];
const DIFFICULTIES = ['easy', 'medium', 'hard'];

// ---------------------------------------------------------------------------
// IO — load every question. Returns flat array tagged with section/difficulty.
// ---------------------------------------------------------------------------
async function loadAll() {
  const out = [];
  for (const section of SECTIONS) {
    for (const difficulty of DIFFICULTIES) {
      const base = join(ROOT, section, difficulty);
      let domains;
      try {
        domains = await readdir(base, { withFileTypes: true });
      } catch {
        continue; // missing dir is fine
      }
      for (const d of domains) {
        if (!d.isDirectory()) continue;
        const dir = join(base, d.name);
        const files = await readdir(dir);
        // Read files in parallel within a domain — cap with chunking to be nice.
        const reads = files
          .filter((f) => f.endsWith('.json'))
          .map(async (f) => {
            try {
              const raw = await readFile(join(dir, f), 'utf8');
              const q = JSON.parse(raw);
              q._section = section;
              q._difficulty = difficulty;
              q._domainSlug = d.name;
              q._file = join(dir, f);
              return q;
            } catch (err) {
              return { _parseError: err.message, _file: join(dir, f) };
            }
          });
        const loaded = await Promise.all(reads);
        for (const q of loaded) out.push(q);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Detection helpers
// ---------------------------------------------------------------------------
function stripHtml(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function isBroken(q) {
  // No keys and no answerOptions to fall back on.
  const noKeys = !Array.isArray(q.keys) || q.keys.length === 0;
  const noOptions = !Array.isArray(q.answerOptions) || q.answerOptions.length === 0;
  return noKeys && noOptions;
}

function referencesContext(q) {
  // Stem talks about "the table/figure/graph above" but no stimulus/body present.
  const stem = stripHtml(q.stem || '').toLowerCase();
  if (!stem) return false;
  // Look for clearly contextual phrasing.
  if (!/\babove\b|\bfollowing\b|\bshown\b/.test(stem)) return false;
  const body = q.raw?.body || q.raw?.stimulus || '';
  return stripHtml(body).length < 10;
}

function median(nums) {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------
function summarize(questions) {
  // Bucket counts: section → difficulty → count
  const counts = {};
  for (const s of SECTIONS) counts[s] = Object.fromEntries(DIFFICULTIES.map((d) => [d, 0]));

  const broken = [];
  const contextRefs = [];
  const skillCounts = new Map();
  const skillStemLens = new Map();
  const parseErrors = [];

  for (const q of questions) {
    if (q._parseError) {
      parseErrors.push({ file: q._file, error: q._parseError });
      continue;
    }
    const sec = q._section;
    const diff = q._difficulty;
    if (counts[sec] && diff in counts[sec]) counts[sec][diff]++;

    const skill = q.skill || '(unknown)';
    skillCounts.set(skill, (skillCounts.get(skill) || 0) + 1);

    const stemLen = stripHtml(q.stem || '').length;
    if (!skillStemLens.has(skill)) skillStemLens.set(skill, []);
    skillStemLens.get(skill).push(stemLen);

    if (isBroken(q)) {
      broken.push({
        questionId: q.questionId,
        section: sec,
        difficulty: diff,
        skill,
        domain: q.domain || '',
        file: q._file,
      });
    }
    if (referencesContext(q)) {
      contextRefs.push({
        questionId: q.questionId,
        section: sec,
        difficulty: diff,
        skill,
        stemExcerpt: stripHtml(q.stem || '').slice(0, 140),
        file: q._file,
      });
    }
  }

  // Rare skills (<10 questions): possible typos.
  const rareSkills = [...skillCounts.entries()]
    .filter(([, n]) => n < 10)
    .map(([skill, count]) => ({ skill, count }))
    .sort((a, b) => a.count - b.count || a.skill.localeCompare(b.skill));

  // Median stem length per skill.
  const stemMedians = [...skillStemLens.entries()]
    .map(([skill, lens]) => ({
      skill,
      questionCount: lens.length,
      medianStemChars: median(lens),
    }))
    .sort((a, b) => b.questionCount - a.questionCount);

  const total = questions.filter((q) => !q._parseError).length;

  return {
    generatedAt: new Date().toISOString(),
    totals: { all: total, parseErrors: parseErrors.length },
    countsBySectionDifficulty: counts,
    brokenCount: broken.length,
    broken,
    contextRefCount: contextRefs.length,
    contextRefs,
    rareSkillCount: rareSkills.length,
    rareSkills,
    stemMedians,
    parseErrors,
  };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------
function toMarkdown(report) {
  const lines = [];
  lines.push('# Question Bank Audit');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push(`**Total questions:** ${report.totals.all}`);
  if (report.totals.parseErrors) {
    lines.push(`**Parse errors:** ${report.totals.parseErrors}`);
  }
  lines.push('');

  // Section/difficulty matrix
  lines.push('## Counts by section × difficulty');
  lines.push('');
  lines.push('| Section | Easy | Medium | Hard | Total |');
  lines.push('|---|---:|---:|---:|---:|');
  for (const s of SECTIONS) {
    const row = report.countsBySectionDifficulty[s];
    const total = (row.easy || 0) + (row.medium || 0) + (row.hard || 0);
    lines.push(`| ${s} | ${row.easy || 0} | ${row.medium || 0} | ${row.hard || 0} | ${total} |`);
  }
  lines.push('');

  // Broken
  lines.push(`## Broken questions (no keys & no options): ${report.brokenCount}`);
  lines.push('');
  if (report.broken.length) {
    lines.push('| questionId | section | difficulty | skill |');
    lines.push('|---|---|---|---|');
    for (const b of report.broken.slice(0, 50)) {
      lines.push(`| ${b.questionId} | ${b.section} | ${b.difficulty} | ${b.skill} |`);
    }
    if (report.broken.length > 50) {
      lines.push(`| _…and ${report.broken.length - 50} more_ | | | |`);
    }
  } else {
    lines.push('_None._');
  }
  lines.push('');

  // Context refs
  lines.push(`## Suspicious context references: ${report.contextRefCount}`);
  lines.push('');
  lines.push('_Stems referencing "above"/"following"/"shown" but with no stimulus body._');
  lines.push('');
  if (report.contextRefs.length) {
    lines.push('| questionId | section | difficulty | excerpt |');
    lines.push('|---|---|---|---|');
    for (const c of report.contextRefs.slice(0, 30)) {
      const ex = c.stemExcerpt.replace(/\|/g, '\\|');
      lines.push(`| ${c.questionId} | ${c.section} | ${c.difficulty} | ${ex} |`);
    }
    if (report.contextRefs.length > 30) {
      lines.push(`| _…and ${report.contextRefs.length - 30} more_ | | | |`);
    }
  } else {
    lines.push('_None._');
  }
  lines.push('');

  // Rare skills
  lines.push(`## Rare skills (<10 questions): ${report.rareSkillCount}`);
  lines.push('');
  if (report.rareSkills.length) {
    lines.push('| skill | count |');
    lines.push('|---|---:|');
    for (const r of report.rareSkills) {
      lines.push(`| ${r.skill} | ${r.count} |`);
    }
  } else {
    lines.push('_None._');
  }
  lines.push('');

  // Stem medians
  lines.push('## Median stem length per skill (HTML stripped)');
  lines.push('');
  lines.push('| skill | questions | median stem chars |');
  lines.push('|---|---:|---:|');
  for (const s of report.stemMedians) {
    lines.push(`| ${s.skill} | ${s.questionCount} | ${s.medianStemChars} |`);
  }
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const t0 = Date.now();
  const questions = await loadAll();
  const report = summarize(questions);
  await mkdir(join(process.cwd(), 'data'), { recursive: true });
  await writeFile(OUT_JSON, JSON.stringify(report, null, 2), 'utf8');
  await writeFile(OUT_MD, toMarkdown(report), 'utf8');
  const ms = Date.now() - t0;
  process.stdout.write(
    `[audit] ${report.totals.all} questions · ` +
      `broken=${report.brokenCount} · ` +
      `contextRefs=${report.contextRefCount} · ` +
      `rareSkills=${report.rareSkillCount} · ` +
      `${ms}ms\n`
  );
  process.stdout.write(`[audit] wrote ${OUT_MD}\n`);
  process.stdout.write(`[audit] wrote ${OUT_JSON}\n`);
}

main().catch((err) => {
  process.stderr.write(`[audit] failed: ${err.stack || err}\n`);
  process.exit(1);
});
