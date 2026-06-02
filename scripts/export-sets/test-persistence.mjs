// Verify that filter selections persist across page reloads.
import puppeteer from 'puppeteer';
import { resolve } from 'node:path';

const abs = resolve('data/exports/index.html');
const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });
await page.goto(`file://${abs}`, { waitUntil: 'networkidle0' });

// Pick "Hard" + "By skill" + type "linear" in search
await page.evaluate(() => {
  const allOpts = [...document.querySelectorAll('.opt')];
  const hard = allOpts.find(o => o.textContent.includes('Hard'));
  const skill = allOpts.find(o => o.textContent.trim().startsWith('By skill'));
  hard?.click(); skill?.click();
  const search = document.getElementById('search');
  search.value = 'linear';
  search.dispatchEvent(new Event('input'));
});

const before = await page.evaluate(() => ({
  count: document.getElementById('count').textContent,
  storage: localStorage.getItem('sat-qb-filters-v1'),
  searchValue: document.getElementById('search').value,
}));

console.log('After interaction:', JSON.stringify(before, null, 2));

// Reload
await page.reload({ waitUntil: 'networkidle0' });

const after = await page.evaluate(() => ({
  count: document.getElementById('count').textContent,
  searchValue: document.getElementById('search').value,
  activeChips: [...document.querySelectorAll('.head__chip')].map(c => c.textContent.replace('×', '').trim()),
}));

console.log('After reload:', JSON.stringify(after, null, 2));

const ok = before.count === after.count && before.searchValue === after.searchValue;
console.log(ok ? '\n✓ persistence works' : '\n✗ persistence broken');

await browser.close();
