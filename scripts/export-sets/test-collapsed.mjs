// Test: open index, click the sidebar toggle, screenshot the collapsed state.
import puppeteer from 'puppeteer';
import { resolve } from 'node:path';

const abs = resolve('data/exports/index.html');
const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });
await page.goto(`file://${abs}`, { waitUntil: 'networkidle0' });

await page.click('#sidebar-toggle');
await new Promise((r) => setTimeout(r, 500)); // let the transition settle

const outPng = abs.replace(/\.html$/, '.collapsed.png');
await page.screenshot({ path: outPng, fullPage: false });
console.log(`✓ ${outPng}`);

await browser.close();
