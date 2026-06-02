// Screenshot specific regions of an HTML file by CSS selector.
// Usage: node scripts/export-sets/preview-section.mjs <html-file> <selector> [output-suffix]

import puppeteer from 'puppeteer';
import { resolve } from 'node:path';

const [, , input, selector, suffix = 'section'] = process.argv;
if (!input || !selector) {
  console.error('Usage: node scripts/export-sets/preview-section.mjs <html> <selector> [suffix]');
  process.exit(1);
}

const abs = resolve(input);
const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 1200, deviceScaleFactor: 2 });
await page.goto(`file://${abs}`, { waitUntil: 'networkidle0' });

const el = await page.$(selector);
if (!el) {
  console.error(`No element matched: ${selector}`);
  process.exit(1);
}

const outPng = abs.replace(/\.html$/, `.${suffix}.png`);
await el.screenshot({ path: outPng });
console.log(`✓ ${outPng}`);

await browser.close();
