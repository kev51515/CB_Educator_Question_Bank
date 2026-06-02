// Question normalization + HTML formatting.
//
// Transforms a raw CB JSON question into the shape the template expects.

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

export function normalize(q) {
  const isMcq = q.type === 'mcq';
  let choices = null;
  let correctLetter = null;
  let correctText = null;

  if (isMcq && Array.isArray(q.answerOptions)) {
    choices = q.answerOptions.map((opt, i) => ({
      letter: LETTERS[i],
      id: opt.id,
      content: opt.content,
    }));
    const keyId = (q.keys || [])[0];
    const idx = q.answerOptions.findIndex((o) => o.id === keyId);
    correctLetter = idx >= 0 ? LETTERS[idx] : '?';
  } else {
    // SPR (student-produced response): keys is array of accepted answer strings
    const keys = q.keys || q.raw?.correct_answer || [];
    correctText = keys[0] ?? '';
    correctText = stripWrappingTags(correctText);
    if (!correctText) correctText = extractFromRationale(q.rationale) ?? '';
  }

  // Fallback for mcq with missing key — try to recover from rationale.
  if (isMcq && (!correctLetter || correctLetter === '?')) {
    const fromRat = extractFromRationale(q.rationale);
    if (fromRat && /^[A-E]$/i.test(fromRat)) correctLetter = fromRat.toUpperCase();
  }

  // Pull out the correct-choice content text for MCQs so the key can show
  // "B — y = 2x + 3" rather than just the letter.
  let correctChoiceContent = null;
  if (isMcq && choices && correctLetter && correctLetter !== '?') {
    const idx = LETTERS.indexOf(correctLetter);
    if (idx >= 0 && choices[idx]) correctChoiceContent = choices[idx].content;
  }

  return {
    id: q.questionId,
    type: isMcq ? 'mcq' : 'spr',
    skill: q.skill,
    domain: q.domain,
    difficulty: q.difficulty,
    stimulusHtml: cleanStimulus(q.raw?.body || q.raw?.stimulus),
    stemHtml: q.stem || '',
    choices,
    correctLetter,
    correctText,
    correctChoiceContent,
    altAnswers: extractAltAnswers(q.keys, correctText),
    rationaleHtml: typeof q.rationale === 'string' ? q.rationale : '',
    // True when we could not determine a correct answer from either keys or
    // rationale extraction. Used by the key file to show an em-dash + note.
    keyMissing:
      isMcq
        ? (!correctLetter || correctLetter === '?')
        : (!correctText || correctText.length === 0),
  };
}

// Strip CB's stimulus wrapper divs and keep just the content (tables, figures,
// passages, etc.) for clean embedding above the question stem.
function cleanStimulus(body) {
  if (typeof body !== 'string' || body.trim().length < 10) return '';
  // Drop the outermost stimulus_reference and passage wrappers — they add
  // nothing visually and just nest more divs.
  return body
    .replace(/^<div class="stimulus_reference[^"]*"[^>]*>/, '')
    .replace(/<\/div>\s*$/, '')
    .replace(/^<div class="passage[^"]*"[^>]*>/, '')
    .replace(/<\/div>\s*$/, '')
    .replace(/^<div class="prose[^"]*"[^>]*>/, '')
    .replace(/<\/div>\s*$/, '')
    .trim();
}

function stripWrappingTags(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/^<[^>]+>|<\/[^>]+>$/g, '').trim();
}

// CB rationales reliably start with "The correct answer is X." — recover X
// from text when the structured key fields are empty (37 questions in hard math
// have empty keys). Strips HTML tags and pulls the first numeric/letter/expression.
function extractFromRationale(rationale) {
  if (typeof rationale !== 'string') return null;
  const text = rationale.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const m = text.match(/correct answer is\s+([^.]+?)(?:\.|,| and|\s+The|$)/i);
  if (!m) return null;
  let ans = m[1].trim();
  // Strip surrounding punctuation/whitespace.
  ans = ans.replace(/^[\s"'`]+|[\s"'`.]+$/g, '');
  return ans || null;
}

function extractAltAnswers(keys, primary) {
  if (!Array.isArray(keys) || keys.length < 2) return [];
  return keys
    .map((k) => (typeof k === 'string' ? k.trim() : ''))
    .filter((k) => k && k !== primary);
}

// ---- HTML builders ---------------------------------------------------------

// Compute the canonical (shared) stem across a list of normalized questions.
// Returns the trimmed shared stem when every entry has the SAME non-empty stem
// HTML; returns null otherwise. Used by the renderer to promote the stem to a
// cover-level callout and suppress the per-card stem.
export function canonicalStemFor(normalizedQuestions) {
  if (!Array.isArray(normalizedQuestions) || normalizedQuestions.length < 2) return null;
  const first = (normalizedQuestions[0]?.stemHtml || '').trim();
  if (!first) return null;
  for (const q of normalizedQuestions) {
    if ((q?.stemHtml || '').trim() !== first) return null;
  }
  return first;
}

// True when the set spans more than one distinct skill (mixed-skill set).
// Per-card skill/domain tags should stay on mixed sets; they become redundant
// on single-skill sets (the skill is already on the cover + strip).
export function isMixedSkillSet(normalizedQuestions) {
  if (!Array.isArray(normalizedQuestions) || normalizedQuestions.length < 2) return false;
  const first = normalizedQuestions[0]?.skill;
  for (const q of normalizedQuestions) {
    if (q?.skill !== first) return true;
  }
  return false;
}

export function renderQuestionCard(q, index, opts = {}) {
  const { canonicalStem = null, isMixed = false, qid = '' } = opts;
  const n = String(index + 1);
  const isSpr = q.type === 'spr';
  const typeTag = isSpr
    ? '<span class="tag tag--gridin u-ui">GRID-IN</span>'
    : '';
  // Drop the per-card skill/domain tag for single-skill sets — the skill is
  // already on the cover + strip and on every card it is just noise. KEEP it
  // for mixed-skill sets where each card needs the disambiguating chip.
  const domainTag = isMixed
    ? `<span class="tag u-ui">${escapeHtml(q.skill || q.domain)}</span>`
    : '';

  const choicesHtml = q.choices
    ? renderChoices(q.choices)
    : renderSpr();

  const stimulus = q.stimulusHtml
    ? `<div class="stimulus">${q.stimulusHtml}</div>`
    : '';

  // Suppress per-card stem when the cover already shows the canonical stem
  // and this card's stem matches it. Always include the stem otherwise.
  const cardStem = (q.stemHtml || '').trim();
  const suppressStem = canonicalStem && cardStem === canonicalStem;
  const stemHtml = suppressStem
    ? ''
    : `<div class="stem">${q.stemHtml}</div>`;

  // Bake answer correctness onto the card for the test-mode runner. SPR cards
  // get the canonical text; MCQ cards get the letter; unknown ⇒ omit attr.
  const correctAttr = isSpr
    ? (q.correctText ? ` data-correct="${escapeHtml(q.correctText)}"` : '')
    : (q.correctLetter && q.correctLetter !== '?' ? ` data-correct="${q.correctLetter}"` : '');
  const typeAttr = isSpr ? ' data-type="spr"' : ' data-type="mcq"';
  const qidAttr = qid ? ` data-qid="${escapeHtml(qid)}"` : ` data-qid="q${n}"`;

  return `
  <article class="card"${qidAttr}${typeAttr}${correctAttr}>
    <header class="card__head">
      <span class="card__num">Q${n}</span>
      <div class="card__tags">${typeTag}${domainTag}</div>
    </header>

    ${stimulus}
    ${stemHtml}

    ${choicesHtml}
  </article>`;
}

function renderChoices(choices) {
  // Dual-circle structure: left circle = answer pick (Ⓐ), right circle =
  // cross-out indicator (ⓐ). The right circle is hidden in study mode via
  // CSS; in test mode it acts as a per-choice strikethrough toggle.
  const items = choices
    .map(
      (c) => `
      <li class="choice" data-letter="${c.letter}" role="radio" aria-checked="false" tabindex="0">
        <span class="choice__circle choice__circle--pick u-ui" aria-hidden="true">${c.letter}</span>
        <span class="choice__letter u-ui">${c.letter}.</span>
        <div class="choice__content">${c.content}</div>
        <button type="button" class="choice__circle choice__circle--cross u-ui"
                data-action="cross" aria-label="Cross out ${c.letter}" tabindex="-1">${c.letter}</button>
      </li>`
    )
    .join('');
  return `<ol class="choices" role="radiogroup">${items}</ol>`;
}

function renderSpr() {
  // Authentic SAT-style 4-column grid-in:
  //   row 1 — write-in boxes
  //   row 2 — fraction bar (/) and decimal point (.) bubbles
  //   row 3+ — 0–9 bubble stack per column
  const COLS = 4;
  const cells = [];
  for (let c = 0; c < COLS; c++) {
    // Fraction-bar only available in cols 2 and 3 on the real SAT.
    const hasFraction = c > 0 && c < COLS - 1;
    const sym = `
      <div class="gridin__sym-row">
        ${hasFraction ? '<span class="gridin__sym">/</span>' : '<span class="gridin__sym" style="visibility:hidden"></span>'}
        <span class="gridin__sym">.</span>
      </div>`;
    const digits = Array.from({ length: 10 }, (_, d) =>
      `<span class="gridin__digit">${d}</span>`
    ).join('');
    cells.push(`
      <div class="gridin__cell">
        <div class="gridin__box"></div>
        ${sym}
        <div class="gridin__digits">${digits}</div>
      </div>`);
  }

  return `
  <div class="gridin">
    <div class="gridin__label">Student-produced response</div>
    <div class="gridin__grid">${cells.join('')}</div>
    <div class="gridin__note">Write the answer above. Fill the matching bubble for each digit, plus the fraction bar or decimal point if needed.</div>
    <div class="gridin__entry" hidden>
      <label class="gridin__entry-label u-ui" for="">Your answer</label>
      <input type="text" class="gridin__entry-input" autocomplete="off" spellcheck="false" inputmode="text" placeholder="Type your answer">
    </div>
  </div>`;
}

// ---- Answer key ------------------------------------------------------------

// Rationale-rich per-question entry. Replaces the old pill-grid cell.
// Layout:
//   ┌ Q1 ───────────────────────────────────────────────────────┐
//   │ [B]  Answer choice content (or SPR value)                  │
//   │      Accept also: 0.25, 1/4                                │
//   │      ─────────────────────────────────                     │
//   │      [Full CB rationale HTML — MathML + figures preserved] │
//   └────────────────────────────────────────────────────────────┘
export function renderAnswerCell(q, index, difficultyKey) {
  const n = String(index + 1);
  const missing = q.keyMissing;
  // Primary token shown in the pill: letter for MCQs, value for SPR, em-dash
  // when neither keys nor rationale yielded an answer.
  let primaryToken;
  if (missing) {
    primaryToken = '—';
  } else if (q.type === 'mcq') {
    primaryToken = q.correctLetter || '?';
  } else {
    primaryToken = q.correctText || '—';
  }

  // For MCQs, render the choice content (which may contain MathML) raw — no
  // escaping — alongside the letter. For SPR the value already lives in the
  // pill, so no need to repeat.
  const answerLine =
    q.type === 'mcq' && q.correctChoiceContent
      ? `<div class="key-entry__choice"><span class="key-entry__choice-letter u-ui">${escapeHtml(
          primaryToken
        )}.</span><div class="key-entry__choice-content">${q.correctChoiceContent}</div></div>`
      : '';

  // Alternate accepted forms (e.g. 0.25 ≡ 1/4).
  const alts = q.altAnswers || [];
  const altHtml = alts.length
    ? `<div class="key-entry__alts u-ui">Accept also: ${alts
        .map((a) => `<span class="u-mono">${escapeHtml(a)}</span>`)
        .join(', ')}</div>`
    : '';

  const missingHtml = missing
    ? `<div class="key-entry__missing u-ui">Answer not provided in source data — see rationale below.</div>`
    : '';

  const rationaleHtml = q.rationaleHtml
    ? `<div class="key-entry__rationale">${q.rationaleHtml}</div>`
    : `<div class="key-entry__rationale key-entry__rationale--empty u-ui">No rationale available for this item.</div>`;

  const pillClass = missing
    ? 'answer-pill answer-pill--missing'
    : `answer-pill answer-pill--${difficultyKey}`;

  // Phase-2: the static test-runner fetches this file in Review-missed mode
  // and locates entries by data-qid (mirrors the .card[data-qid] scheme in
  // _questions.html: q1, q2, …).
  return `
  <article class="key-entry" data-qid="q${n}" data-missing="${missing ? '1' : '0'}">
    <header class="key-entry__head">
      <span class="key-entry__num u-display">Q${n}</span>
      <span class="${pillClass}">${escapeHtml(primaryToken)}</span>
    </header>
    ${answerLine}
    ${altHtml}
    ${missingHtml}
    <hr class="key-entry__rule" />
    ${rationaleHtml}
  </article>`;
}

// ---- utils -----------------------------------------------------------------

export function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
