import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = join(process.cwd(), 'data', 'json');

export async function loadQuestions({ section = 'math', difficulty = 'hard' } = {}) {
  const base = join(ROOT, section, difficulty);
  const domains = await readdir(base, { withFileTypes: true });
  const out = [];

  for (const d of domains) {
    if (!d.isDirectory()) continue;
    const domainDir = join(base, d.name);
    const files = await readdir(domainDir);
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const raw = await readFile(join(domainDir, f), 'utf8');
      const q = JSON.parse(raw);
      q._domainSlug = d.name;
      out.push(q);
    }
  }
  return out;
}

export function byField(items, field) {
  const map = new Map();
  for (const it of items) {
    const k = it[field];
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(it);
  }
  return map;
}
