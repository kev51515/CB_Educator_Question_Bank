#!/usr/bin/env node
// build-sets.mjs — entry point for exporting question sets.
//
// Usage:
//   node scripts/export-sets/build-sets.mjs --axis skill --section math --difficulty hard
//   node scripts/export-sets/build-sets.mjs --axis domain --section math
//   node scripts/export-sets/build-sets.mjs --axis mixed --section math --pdf
//   node scripts/export-sets/build-sets.mjs --all   (skill+domain+mixed, math+rw, hard)

import { join } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { loadQuestions } from './lib/load.mjs';
import { bySkill, byDomain, byMixed } from './lib/select.mjs';
import { renderSet } from './lib/render.mjs';
import { closeBrowser } from './lib/render-pdf.mjs';

const args = parseArgs(process.argv.slice(2));

if (args.all) {
  await runAll(args);
} else {
  await runOne(args);
}
await closeBrowser();
console.log('\nDone.');

// ---------------------------------------------------------------------------

async function runOne(args) {
  const axis = args.axis ?? 'skill';
  const section = args.section ?? 'math';
  const difficulty = capitalize(args.difficulty ?? 'hard');
  const wantPdf = args.pdf === true || args.pdf === 'true';

  const all = await loadAndLog(section, difficulty);
  const sets = pickAxis(axis, all, args);
  const filtered = args.skill
    ? sets.filter((s) => s.skill === args.skill)
    : sets;

  if (args.skill && !filtered.length) {
    console.error(`No sets matched skill: "${args.skill}"`);
    process.exit(1);
  }

  const outDir = outDirFor(axis, section, difficulty);
  await renderAll(filtered, { difficulty, outDir, pdf: wantPdf });
  await writeManifest(outDir, filtered, { section, difficulty, axis });
}

async function runAll(args) {
  const wantPdf = args.pdf === true || args.pdf === 'true';
  const onlyDiff = args.difficulty
    ? [capitalize(args.difficulty)]
    : ['Easy', 'Medium', 'Hard'];
  const sections = args.section
    ? [args.section]
    : ['math', 'reading-and-writing'];

  for (const section of sections) {
    for (const difficulty of onlyDiff) {
      const all = await loadAndLog(section, difficulty);

      for (const axis of ['skill', 'domain', 'mixed']) {
        const sets = pickAxis(axis, all, args);
        const outDir = outDirFor(axis, section, difficulty);
        console.log(`\n── ${section} / ${difficulty.toLowerCase()} / ${axis} ── ${sets.length} set(s)`);
        await renderAll(sets, { difficulty, outDir, pdf: wantPdf });
        await writeManifest(outDir, sets, {
          section,
          difficulty,
          axis,
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------

function pickAxis(axis, all, args) {
  const setSize = Number(args['set-size'] ?? args['chunk-size'] ?? 10);
  if (axis === 'skill')  return bySkill(all, { chunkSize: setSize });
  if (axis === 'domain') return byDomain(all, { setSize });
  if (axis === 'mixed')  return byMixed(all, {
    setSize,
    sets: Number(args['mixed-count'] ?? 4),
  });
  throw new Error(`Unknown axis: ${axis}`);
}

function outDirFor(axis, section, difficulty) {
  const parts = [process.cwd(), 'data', 'exports', `by-${axis}`];
  if (section) parts.push(section);
  if (difficulty) parts.push(difficulty.toLowerCase());
  return join(...parts);
}

async function loadAndLog(section, difficulty) {
  console.log(`→ Loading ${section} / ${difficulty.toLowerCase()} ...`);
  const all = await loadQuestions({ section, difficulty: difficulty.toLowerCase() });
  console.log(`  loaded ${all.length} questions`);
  return all;
}

async function renderAll(sets, opts) {
  for (const set of sets) {
    const result = await renderSet(set, opts);
    console.log(`  ✓ ${set.label.padEnd(60)} (${set.questions.length} Q)`);
  }
}

async function writeManifest(dir, sets, meta) {
  await mkdir(dir, { recursive: true });
  const manifest = {
    generatedAt: new Date().toISOString(),
    ...meta,
    setCount: sets.length,
    questionCount: sets.reduce((a, s) => a + s.questions.length, 0),
    sets: sets.map((s) => ({
      setId: s.setId,
      label: s.label,
      questionCount: s.questions.length,
      files: {
        questionsHtml: `${s.setName}_questions.html`,
        keyHtml: `${s.setName}_key.html`,
      },
    })),
  };
  await writeFile(
    join(dir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8'
  );
}

// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next != null && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function capitalize(s) {
  return s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s;
}
