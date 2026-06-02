// Selection strategies for building sets.
//
// Each strategy returns an array of { setName, label, questions }.

const CHUNK_DEFAULT = 10;

export function bySkill(questions, { chunkSize = CHUNK_DEFAULT } = {}) {
  const bySkillMap = new Map();
  for (const q of questions) {
    const k = q.skill || 'Uncategorized';
    if (!bySkillMap.has(k)) bySkillMap.set(k, []);
    bySkillMap.get(k).push(q);
  }

  const sets = [];
  for (const [skill, items] of bySkillMap) {
    const sorted = [...items].sort((a, b) => a.questionId.localeCompare(b.questionId));
    const chunks = chunk(sorted, chunkSize);
    chunks.forEach((qs, i) => {
      const n = String(i + 1);
      sets.push({
        setName: `${slug(skill)}-set-${n}`,
        label: `${skill} — Set ${n}`,
        skill,
        setId: n,
        questions: qs,
      });
    });
  }
  return sets;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function slug(s) {
  return s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export { slug };

// -----------------------------------------------------------------
// byDomain — group by domain, stratified sampling across skills.
// Each set has SET_SIZE questions, with skill proportions matching
// the domain's underlying distribution.
// -----------------------------------------------------------------
export function byDomain(questions, { setSize = 10, seed = 1 } = {}) {
  const rng = mulberry32(seed);
  const byDomainMap = new Map();
  for (const q of questions) {
    const k = q.domain || 'Uncategorized';
    if (!byDomainMap.has(k)) byDomainMap.set(k, []);
    byDomainMap.get(k).push(q);
  }

  const sets = [];
  for (const [domain, items] of byDomainMap) {
    // Group within domain by skill so we can sample stratified.
    const skills = new Map();
    for (const q of items) {
      const k = q.skill || 'Uncategorized';
      if (!skills.has(k)) skills.set(k, []);
      skills.get(k).push(q);
    }
    // Shuffle each skill bucket deterministically.
    for (const arr of skills.values()) shuffle(arr, rng);

    // Round-robin draw to fill sets.
    const flatPool = [];
    let added = true;
    while (added) {
      added = false;
      for (const arr of skills.values()) {
        if (arr.length) {
          flatPool.push(arr.shift());
          added = true;
        }
      }
    }

    const chunks = chunk(flatPool, setSize);
    chunks.forEach((qs, i) => {
      const n = String(i + 1);
      sets.push({
        setName: `${slug(domain)}-set-${n}`,
        label: `${domain} — Set ${n}`,
        skill: domain, // headline shown on cover
        setId: n,
        questions: qs,
      });
    });
  }
  return sets;
}

// -----------------------------------------------------------------
// byMixed — weighted random sampling across the whole section,
// proportional to domain volume in the bank. Multiple sets via
// seeded RNG so output is reproducible.
// -----------------------------------------------------------------
export function byMixed(questions, { setSize = 10, sets: nSets = 4, seed = 7 } = {}) {
  const rng = mulberry32(seed);
  const buckets = new Map();
  for (const q of questions) {
    const k = q.domain || 'Uncategorized';
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(q);
  }
  for (const arr of buckets.values()) shuffle(arr, rng);

  // Per-set weights: integer counts that sum to setSize, proportional
  // to bucket size with largest-remainder rounding.
  const total = questions.length;
  const order = [...buckets.entries()];
  const sets = [];

  for (let s = 0; s < nSets; s++) {
    const remainingTotal = order.reduce((a, [, arr]) => a + arr.length, 0);
    if (!remainingTotal) break;
    const targetSize = Math.min(setSize, remainingTotal);

    const raw = order.map(([d, arr]) => ({
      domain: d,
      arr,
      ideal: (arr.length / remainingTotal) * targetSize,
    }));
    const floors = raw.map((r) => ({
      ...r,
      count: Math.min(Math.floor(r.ideal), r.arr.length),
      rem: r.ideal - Math.floor(r.ideal),
    }));
    let leftover = targetSize - floors.reduce((a, b) => a + b.count, 0);
    floors.sort((a, b) => b.rem - a.rem);
    // Distribute leftover slots, skipping exhausted buckets.
    for (let i = 0; leftover > 0 && i < floors.length * 4; i++) {
      const f = floors[i % floors.length];
      if (f.count < f.arr.length) {
        f.count++;
        leftover--;
      }
    }

    const picked = [];
    for (const f of floors) {
      // Take up to f.count from the front of the (shuffled) bucket.
      // If a bucket is exhausted, skip silently — the next iteration
      // will pick up the slack.
      for (let i = 0; i < f.count && f.arr.length; i++) {
        picked.push(f.arr.shift());
      }
    }
    if (!picked.length) break;

    const n = String(s + 1);
    sets.push({
      setName: `mixed-set-${n}`,
      label: `Mixed — Set ${n}`,
      skill: 'Mixed',
      setId: n,
      questions: picked,
    });
  }
  return sets;
}

// -----------------------------------------------------------------
// helpers
// -----------------------------------------------------------------
function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Small, fast, seedable PRNG.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
