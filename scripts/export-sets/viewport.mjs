// Single-viewport screenshot (not full-page) for evaluating fold-area UX.
// Usage: node scripts/export-sets/viewport.mjs <html-file> [width] [height]

import puppeteer from 'puppeteer';
import { resolve } from 'node:path';

const [, , input, w = '1280', h = '900'] = process.argv;
if (!input) {
  console.error('Usage: node scripts/export-sets/viewport.mjs <html> [width] [height]');
  process.exit(1);
}

const abs = resolve(input);
const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: Number(w), height: Number(h), deviceScaleFactor: 2 });
await page.goto(`file://${abs}`, { waitUntil: 'networkidle0' });

const outPng = abs.replace(/\.html$/, '.viewport.png');
await page.screenshot({ path: outPng, fullPage: false });
console.log(`✓ ${outPng}`);

await browser.close();
