// Quick screenshot helper to preview an exported HTML file visually.
// Usage: node scripts/export-sets/screenshot.mjs <html-file>

import puppeteer from 'puppeteer';
import { resolve, basename } from 'node:path';

const input = process.argv[2];
if (!input) {
  console.error('Usage: node scripts/export-sets/screenshot.mjs <html-file>');
  process.exit(1);
}

const abs = resolve(input);
const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
const width = Number(process.argv[3] ?? 900);
await page.setViewport({ width, height: 1200, deviceScaleFactor: 2 });
await page.goto(`file://${abs}`, { waitUntil: 'networkidle0' });

const outPng = abs.replace(/\.html$/, '.preview.png');
await page.screenshot({ path: outPng, fullPage: true });
console.log(`✓ ${outPng}`);

await browser.close();
