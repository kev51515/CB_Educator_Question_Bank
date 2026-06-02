// Tests for lib/format.mjs — normalization + HTML utilities.
//
// Run with:
//   node --test scripts/export-sets/__tests__/format.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalize,
  escapeHtml,
  canonicalStemFor,
  isMixedSkillSet,
  renderQuestionCard,
} from '../lib/format.mjs';

// ----------------------------------------------------------------------------
// normalize — MCQ
// ----------------------------------------------------------------------------
test('normalize — MCQ with 4 options resolves correctLetter from key id', () => {
  const q = {
    questionId: 'q-mcq-1',
    skill: 'Linear equations',
    domain: 'Algebra',
    difficulty: 'Hard',
    type: 'mcq',
    stem: '<p>Solve.</p>',
    answerOptions: [
      { id: 'opt-a', content: '<p>1</p>' },
      { id: 'opt-b', content: '<p>2</p>' },
      { id: 'opt-c', content: '<p>3</p>' },
      { id: 'opt-d', content: '<p>4</p>' },
    ],
    keys: ['opt-c'],
    rationale: '<p>The correct answer is C.</p>',
  };
  const n = normalize(q);
  assert.equal(n.type, 'mcq');
  assert.equal(n.correctLetter, 'C');
  assert.equal(n.correctChoiceContent, '<p>3</p>');
  assert.equal(n.keyMissing, false);
  assert.equal(n.choices.length, 4);
  assert.deepEqual(n.choices.map((c) => c.letter), ['A', 'B', 'C', 'D']);
});

test('normalize — MCQ A through D all resolve correctly', () => {
  const make = (keyId) => ({
    questionId: 'q',
    type: 'mcq',
    answerOptions: [
      { id: 'a', content: 'A txt' },
      { id: 'b', content: 'B txt' },
      { id: 'c', content: 'C txt' },
      { id: 'd', content: 'D txt' },
    ],
    keys: [keyId],
    rationale: '',
  });
  assert.equal(normalize(make('a')).correctLetter, 'A');
  assert.equal(normalize(make('b')).correctLetter, 'B');
  assert.equal(normalize(make('c')).correctLetter, 'C');
  assert.equal(normalize(make('d')).correctLetter, 'D');
});

test('normalize — MCQ with no matching key falls back via rationale extraction', () => {
  // No keys → extractFromRationale should pull "B" from the rationale text.
  const q = {
    questionId: 'q-fallback',
    type: 'mcq',
    answerOptions: [
      { id: 'a', content: '1' },
      { id: 'b', content: '2' },
      { id: 'c', content: '3' },
      { id: 'd', content: '4' },
    ],
    keys: [],
    rationale: '<p>The correct answer is B.</p>',
  };
  const n = normalize(q);
  assert.equal(n.correctLetter, 'B');
  // Successfully resolved → keyMissing false.
  assert.equal(n.keyMissing, false);
});

test('normalize — MCQ with no keys & no rationale → keyMissing true', () => {
  const q = {
    questionId: 'q-broken',
    type: 'mcq',
    answerOptions: [
      { id: 'a', content: '1' },
      { id: 'b', content: '2' },
    ],
    keys: [],
    rationale: '',
  };
  const n = normalize(q);
  assert.equal(n.keyMissing, true);
});

// ----------------------------------------------------------------------------
// normalize — SPR (Student-Produced Response)
// ----------------------------------------------------------------------------
test('normalize — SPR primary + alternate keys surface in altAnswers', () => {
  const q = {
    questionId: 'q-spr',
    type: 'spr',
    stem: '<p>What is one quarter as a decimal or fraction?</p>',
    answerOptions: null,
    keys: ['0.25', '1/4'],
    rationale: '<p>The correct answer is 0.25.</p>',
  };
  const n = normalize(q);
  assert.equal(n.type, 'spr');
  assert.equal(n.correctText, '0.25');
  assert.deepEqual(n.altAnswers, ['1/4']);
  assert.equal(n.keyMissing, false);
});

test('normalize — SPR with multiple alternates', () => {
  const q = {
    questionId: 'q-spr-multi',
    type: 'spr',
    keys: ['42', '42.0', 'forty-two'],
    rationale: '',
  };
  const n = normalize(q);
  assert.equal(n.correctText, '42');
  assert.deepEqual(n.altAnswers, ['42.0', 'forty-two']);
});

test('normalize — SPR missing keys → extractFromRationale fallback', () => {
  const q = {
    questionId: 'q-spr-fallback',
    type: 'spr',
    keys: [],
    rationale: '<p>The correct answer is 42.</p>',
  };
  const n = normalize(q);
  assert.equal(n.correctText, '42');
  assert.equal(n.keyMissing, false);
});

test('normalize — SPR with totally missing answer → keyMissing true', () => {
  const q = {
    questionId: 'q-spr-broken',
    type: 'spr',
    keys: [],
    rationale: '',
  };
  const n = normalize(q);
  assert.equal(n.keyMissing, true);
  assert.equal(n.correctText, '');
});

test('normalize — SPR strips wrapping HTML tags from primary key', () => {
  // CB sometimes ships keys as "<p>42</p>"
  const q = {
    questionId: 'q-spr-wrapped',
    type: 'spr',
    keys: ['<p>42</p>'],
    rationale: '',
  };
  const n = normalize(q);
  assert.equal(n.correctText, '42');
});

// ----------------------------------------------------------------------------
// cleanStimulus (tested indirectly via normalize.stimulusHtml)
// ----------------------------------------------------------------------------
test('cleanStimulus — unwraps stimulus_reference div', () => {
  const wrapped =
    '<div class="stimulus_reference">' +
    '<table><tr><td>Year</td><td>Count</td></tr></table>' +
    '</div>';
  const q = {
    questionId: 'q',
    type: 'mcq',
    answerOptions: [],
    keys: [],
    rationale: '',
    raw: { body: wrapped },
  };
  const n = normalize(q);
  // Inner table is preserved; wrapper div is stripped.
  assert.ok(n.stimulusHtml.startsWith('<table>'));
  assert.ok(n.stimulusHtml.endsWith('</table>'));
  assert.ok(!n.stimulusHtml.includes('stimulus_reference'));
});

test('cleanStimulus — drops very short / empty body', () => {
  const q = {
    questionId: 'q',
    type: 'mcq',
    answerOptions: [],
    keys: [],
    rationale: '',
    raw: { body: '<br>' }, // <10 chars after trim
  };
  const n = normalize(q);
  assert.equal(n.stimulusHtml, '');
});

test('cleanStimulus — passes through unwrapped content', () => {
  const body = '<p>This is a stimulus passage with content.</p>';
  const q = {
    questionId: 'q',
    type: 'mcq',
    answerOptions: [],
    keys: [],
    rationale: '',
    raw: { body },
  };
  const n = normalize(q);
  assert.equal(n.stimulusHtml, body);
});

// ----------------------------------------------------------------------------
// escapeHtml
// ----------------------------------------------------------------------------
test('escapeHtml — escapes & < > and "', () => {
  assert.equal(escapeHtml('<div class="x">A & B</div>'),
    '&lt;div class=&quot;x&quot;&gt;A &amp; B&lt;/div&gt;');
});

test('escapeHtml — handles null/undefined → empty string', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
});

test('escapeHtml — coerces numbers', () => {
  assert.equal(escapeHtml(42), '42');
  assert.equal(escapeHtml(0), '0');
});

test('escapeHtml — leaves safe characters untouched', () => {
  assert.equal(escapeHtml('Hello, World!'), 'Hello, World!');
});

test('escapeHtml — ampersand-only', () => {
  assert.equal(escapeHtml('A & B & C'), 'A &amp; B &amp; C');
});

// ----------------------------------------------------------------------------
// canonicalStemFor — Phase A shared-stem detection
// ----------------------------------------------------------------------------
test('canonicalStemFor — all identical → returns shared stem', () => {
  const items = [
    { stemHtml: '<p>Same?</p>' },
    { stemHtml: '<p>Same?</p>' },
    { stemHtml: '<p>Same?</p>' },
  ];
  assert.equal(canonicalStemFor(items), '<p>Same?</p>');
});

test('canonicalStemFor — any difference → null', () => {
  const items = [
    { stemHtml: '<p>A</p>' },
    { stemHtml: '<p>B</p>' },
  ];
  assert.equal(canonicalStemFor(items), null);
});

test('canonicalStemFor — empty stems → null', () => {
  const items = [{ stemHtml: '' }, { stemHtml: '' }];
  assert.equal(canonicalStemFor(items), null);
});

test('canonicalStemFor — single item → null (no "shared" stem)', () => {
  assert.equal(canonicalStemFor([{ stemHtml: '<p>x</p>' }]), null);
});

// ----------------------------------------------------------------------------
// isMixedSkillSet — detection for keeping per-card tags
// ----------------------------------------------------------------------------
test('isMixedSkillSet — single skill → false', () => {
  const items = [{ skill: 'Boundaries' }, { skill: 'Boundaries' }];
  assert.equal(isMixedSkillSet(items), false);
});

test('isMixedSkillSet — multiple distinct skills → true', () => {
  const items = [{ skill: 'Boundaries' }, { skill: 'Form' }];
  assert.equal(isMixedSkillSet(items), true);
});

// ----------------------------------------------------------------------------
// renderQuestionCard — Phase A: bakes data-correct, drops tag on single-skill,
//                       suppresses stem when canonical
// ----------------------------------------------------------------------------
test('renderQuestionCard — bakes data-correct + data-type for MCQ', () => {
  const q = normalize({
    questionId: 'q1',
    type: 'mcq',
    skill: 'Boundaries',
    domain: 'Standard English Conventions',
    stem: '<p>S</p>',
    answerOptions: [
      { id: 'a', content: '<p>A</p>' },
      { id: 'b', content: '<p>B</p>' },
    ],
    keys: ['b'],
    rationale: '',
  });
  const html = renderQuestionCard(q, 0, { qid: 'q1' });
  assert.match(html, /data-qid="q1"/);
  assert.match(html, /data-type="mcq"/);
  assert.match(html, /data-correct="B"/);
});

test('renderQuestionCard — suppresses per-card stem when canonical', () => {
  const q = normalize({
    questionId: 'q1',
    type: 'mcq',
    skill: 'Boundaries',
    domain: 'Conv',
    stem: '<p>Shared</p>',
    answerOptions: [{ id: 'a', content: 'A' }],
    keys: ['a'],
    rationale: '',
  });
  const html = renderQuestionCard(q, 0, {
    qid: 'q1',
    canonicalStem: '<p>Shared</p>',
  });
  assert.ok(!html.includes('<div class="stem">'), 'stem should be suppressed');
});

test('renderQuestionCard — drops domain tag on single-skill (isMixed=false)', () => {
  const q = normalize({
    questionId: 'q1', type: 'mcq', skill: 'Boundaries', domain: 'Conv',
    stem: '<p>?</p>',
    answerOptions: [{ id: 'a', content: 'A' }], keys: ['a'], rationale: '',
  });
  const html = renderQuestionCard(q, 0, { qid: 'q1', isMixed: false });
  assert.ok(!html.includes('<span class="tag u-ui">'), 'no per-card tag on single-skill');
});

test('renderQuestionCard — KEEPS domain tag on mixed-skill sets', () => {
  const q = normalize({
    questionId: 'q1', type: 'mcq', skill: 'Form, Structure, and Sense', domain: 'Conv',
    stem: '<p>?</p>',
    answerOptions: [{ id: 'a', content: 'A' }], keys: ['a'], rationale: '',
  });
  const html = renderQuestionCard(q, 0, { qid: 'q1', isMixed: true });
  assert.match(html, /<span class="tag u-ui">/);
});

test('renderQuestionCard — SPR uses data-correct=text + data-type=spr', () => {
  const q = normalize({
    questionId: 'qspr', type: 'spr',
    skill: 'X', domain: 'Y',
    stem: '<p>?</p>',
    keys: ['0.25'],
    rationale: '',
  });
  const html = renderQuestionCard(q, 0, { qid: 'q1' });
  assert.match(html, /data-type="spr"/);
  assert.match(html, /data-correct="0\.25"/);
  // gridin entry input is rendered (hidden until test mode)
  assert.match(html, /gridin__entry-input/);
});
