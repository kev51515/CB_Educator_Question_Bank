// Tests for lib/select.mjs — selection strategies.
//
// Run with:
//   node --test scripts/export-sets/__tests__/select.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bySkill, byDomain, byMixed, slug } from '../lib/select.mjs';

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
function makeQ(id, skill, domain = 'Algebra') {
  return {
    questionId: id,
    skill,
    domain,
    type: 'mcq',
    keys: [],
    answerOptions: [],
  };
}

// Generate N questions distributed across the given (skill, domain) pairs.
function makeBank(spec) {
  // spec: [[skill, domain, count], ...]
  const out = [];
  let i = 0;
  for (const [skill, domain, n] of spec) {
    for (let k = 0; k < n; k++) {
      // zero-pad ids so .sort by localeCompare is stable
      out.push(makeQ(`q${String(i++).padStart(4, '0')}`, skill, domain));
    }
  }
  return out;
}

// ----------------------------------------------------------------------------
// slug()
// ----------------------------------------------------------------------------
test('slug — basic lowercasing and hyphenation', () => {
  assert.equal(slug('Linear Equations'), 'linear-equations');
  assert.equal(slug('Reading & Writing'), 'reading-and-writing');
  assert.equal(slug('  Geometry/Trig  '), 'geometry-trig');
  assert.equal(slug('One Two Three'), 'one-two-three');
});

// ----------------------------------------------------------------------------
// bySkill()
// ----------------------------------------------------------------------------
test('bySkill — single skill, fewer than chunkSize → one set', () => {
  const qs = makeBank([['Algebra basics', 'Algebra', 7]]);
  const sets = bySkill(qs);
  assert.equal(sets.length, 1);
  assert.equal(sets[0].setName, 'algebra-basics-set-1');
  assert.equal(sets[0].label, 'Algebra basics — Set 1');
  assert.equal(sets[0].setId, '1');
  assert.equal(sets[0].skill, 'Algebra basics');
  assert.equal(sets[0].questions.length, 7);
});

test('bySkill — exactly chunkSize → one full set', () => {
  const qs = makeBank([['Skill A', 'D', 10]]);
  const sets = bySkill(qs);
  assert.equal(sets.length, 1);
  assert.equal(sets[0].questions.length, 10);
  assert.equal(sets[0].setName, 'skill-a-set-1');
});

test('bySkill — chunkSize+1 → two sets, second has 1', () => {
  const qs = makeBank([['Skill A', 'D', 11]]);
  const sets = bySkill(qs);
  assert.equal(sets.length, 2);
  assert.equal(sets[0].questions.length, 10);
  assert.equal(sets[1].questions.length, 1);
  assert.equal(sets[0].setName, 'skill-a-set-1');
  assert.equal(sets[1].setName, 'skill-a-set-2');
  assert.equal(sets[1].setId, '2');
});

test('bySkill — multi-skill input groups & numbers per-skill', () => {
  const qs = makeBank([
    ['Skill A', 'D', 12],
    ['Skill B', 'D', 3],
  ]);
  const sets = bySkill(qs);
  assert.equal(sets.length, 3);
  const names = sets.map((s) => s.setName).sort();
  assert.deepEqual(names, [
    'skill-a-set-1',
    'skill-a-set-2',
    'skill-b-set-1',
  ]);
  // per-skill counts
  const a = sets.filter((s) => s.skill === 'Skill A');
  assert.equal(a.length, 2);
  assert.equal(a[0].questions.length, 10);
  assert.equal(a[1].questions.length, 2);
});

test('bySkill — respects custom chunkSize', () => {
  const qs = makeBank([['S', 'D', 7]]);
  const sets = bySkill(qs, { chunkSize: 3 });
  assert.equal(sets.length, 3);
  assert.deepEqual(
    sets.map((s) => s.questions.length),
    [3, 3, 1]
  );
});

test('bySkill — questions are sorted by questionId within a set', () => {
  // Input order: q0003, q0001, q0002 — output should be sorted.
  const qs = [
    makeQ('q0003', 'S'),
    makeQ('q0001', 'S'),
    makeQ('q0002', 'S'),
  ];
  const sets = bySkill(qs);
  assert.deepEqual(
    sets[0].questions.map((q) => q.questionId),
    ['q0001', 'q0002', 'q0003']
  );
});

test('bySkill — missing skill becomes "Uncategorized"', () => {
  const qs = [
    { questionId: 'q1', domain: 'D', type: 'mcq' },
    { questionId: 'q2', domain: 'D', type: 'mcq' },
  ];
  const sets = bySkill(qs);
  assert.equal(sets.length, 1);
  assert.equal(sets[0].skill, 'Uncategorized');
  assert.equal(sets[0].setName, 'uncategorized-set-1');
});

// ----------------------------------------------------------------------------
// byDomain()
// ----------------------------------------------------------------------------
test('byDomain — preserves skill proportions for a divisible bucket', () => {
  // 10 of Skill A, 10 of Skill B, in Algebra → one set of 10 should have
  // ~5 of each thanks to round-robin shuffling.
  const qs = makeBank([
    ['Skill A', 'Algebra', 10],
    ['Skill B', 'Algebra', 10],
  ]);
  const sets = byDomain(qs, { setSize: 10, seed: 42 });
  assert.equal(sets.length, 2);
  const first = sets[0].questions;
  const countA = first.filter((q) => q.skill === 'Skill A').length;
  const countB = first.filter((q) => q.skill === 'Skill B').length;
  assert.equal(countA, 5);
  assert.equal(countB, 5);
});

test('byDomain — degrades gracefully on non-divisible buckets', () => {
  // 10 A + 5 B → 15 questions, setSize 10 → 2 sets total; first set should
  // still contain both skills (round-robin keeps proportions roughly).
  const qs = makeBank([
    ['Skill A', 'Algebra', 10],
    ['Skill B', 'Algebra', 5],
  ]);
  const sets = byDomain(qs, { setSize: 10, seed: 1 });
  assert.equal(sets.length, 2);
  assert.equal(sets[0].questions.length, 10);
  assert.equal(sets[1].questions.length, 5);
  // first set has at least one of each skill
  const firstSkills = new Set(sets[0].questions.map((q) => q.skill));
  assert.ok(firstSkills.has('Skill A'));
  assert.ok(firstSkills.has('Skill B'));
});

test('byDomain — sets are labeled by domain, not skill', () => {
  const qs = makeBank([['Skill X', 'Geometry', 10]]);
  const sets = byDomain(qs, { setSize: 10, seed: 5 });
  assert.equal(sets[0].setName, 'geometry-set-1');
  assert.equal(sets[0].label, 'Geometry — Set 1');
  assert.equal(sets[0].skill, 'Geometry'); // cover headline override
});

// ----------------------------------------------------------------------------
// byMixed()
// ----------------------------------------------------------------------------
test('byMixed — same seed → identical output (reproducibility)', () => {
  const qs = makeBank([
    ['Skill A', 'Algebra', 20],
    ['Skill B', 'Geometry', 20],
    ['Skill C', 'Stats', 20],
  ]);
  const a = byMixed(qs, { setSize: 10, sets: 3, seed: 99 });
  const b = byMixed(qs, { setSize: 10, sets: 3, seed: 99 });
  // Same seed, same input → identical question id sequence across sets.
  const flat = (xs) => xs.flatMap((s) => s.questions.map((q) => q.questionId));
  assert.deepEqual(flat(a), flat(b));
});

test('byMixed — different seeds → different output', () => {
  const qs = makeBank([
    ['Skill A', 'Algebra', 20],
    ['Skill B', 'Geometry', 20],
  ]);
  const a = byMixed(qs, { setSize: 10, sets: 2, seed: 1 });
  const b = byMixed(qs, { setSize: 10, sets: 2, seed: 9999 });
  const flat = (xs) => xs.flatMap((s) => s.questions.map((q) => q.questionId));
  // Output should differ for at least one slot (probability ≈ 1).
  assert.notDeepEqual(flat(a), flat(b));
});

test('byMixed — proportional sampling across domains', () => {
  // 60 questions: 30 algebra, 20 geom, 10 stats. setSize 10 → expect
  // approximately 5/3/2 per set.
  const qs = makeBank([
    ['SA', 'Algebra', 30],
    ['SB', 'Geometry', 20],
    ['SC', 'Stats', 10],
  ]);
  const sets = byMixed(qs, { setSize: 10, sets: 1, seed: 7 });
  assert.equal(sets.length, 1);
  const counts = { Algebra: 0, Geometry: 0, Stats: 0 };
  for (const q of sets[0].questions) counts[q.domain]++;
  assert.equal(counts.Algebra, 5);
  assert.equal(counts.Geometry, 3);
  assert.equal(counts.Stats, 2);
  assert.equal(sets[0].setName, 'mixed-set-1');
});

test('byMixed — emits no empty sets when pool exhausted', () => {
  // Only 15 questions, asking for 4 sets of 10.
  const qs = makeBank([['S', 'D', 15]]);
  const sets = byMixed(qs, { setSize: 10, sets: 4, seed: 1 });
  // First set 10, second 5, then exhausted → stops.
  assert.ok(sets.length <= 4);
  assert.ok(sets.every((s) => s.questions.length > 0));
  const total = sets.reduce((a, s) => a + s.questions.length, 0);
  assert.equal(total, 15);
});

// ----------------------------------------------------------------------------
// mulberry32 — indirect test via byMixed determinism.
// The RNG is not exported; reproducibility of byMixed with a fixed seed proves
// the sequence is deterministic (since byMixed uses the RNG for shuffling).
// ----------------------------------------------------------------------------
test('mulberry32 (indirect) — same seed yields the same shuffled sequence', () => {
  const qs = makeBank([['S', 'D', 50]]);
  const runs = Array.from({ length: 3 }, () =>
    byMixed(qs, { setSize: 10, sets: 3, seed: 12345 })
      .flatMap((s) => s.questions.map((q) => q.questionId))
  );
  assert.deepEqual(runs[0], runs[1]);
  assert.deepEqual(runs[1], runs[2]);
});
