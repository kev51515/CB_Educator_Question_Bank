const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Configuration
const OUTPUT_DIR = path.join(__dirname, 'sat_export');
const SECTIONS = [
    { name: 'Reading and Writing', value: 'Reading and Writing' },
    { name: 'Math', value: 'Math' }
];

async function ensureDirectoryExistence(filePath) {
    const dirname = path.dirname(filePath);
    if (fs.existsSync(dirname)) {
        return true;
    }
    ensureDirectoryExistence(dirname);
    try {
        fs.mkdirSync(dirname);
    } catch (e) {
        if (e.code !== 'EEXIST') throw e;
    }
}

async function scrape() {
    console.log('Starting SAT Question Bank Scraper...');

    ensureDirectoryExistence(path.join(OUTPUT_DIR, 'init.txt'));

    const browser = await puppeteer.launch({
        headless: false,
        // 1. Maximize window/viewport as requested
        defaultViewport: { width: 1920, height: 1080 },
        args: ['--start-maximized', '--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // 2. Zoom out to ensure visibility (must be inside async function)
    await page.evaluate(() => {
        document.body.style.zoom = '80%';
    });

    // Robust Retry Helper
    async function retryAction(actionName, fn, retries = 3) {
        for (let i = 0; i < retries; i++) {
            try {
                return await fn();
            } catch (error) {
                console.warn(`${actionName} failed (attempt ${i + 1}/${retries}): ${error.message}`);
                if (i === retries - 1) throw error;
                await new Promise(r => setTimeout(r, 2000));
            }
        }
    }

    async function selectOptionJS(selector, text) {
        await retryAction(`Select ${text}`, async () => {
            await page.waitForSelector(selector, { visible: true, timeout: 10000 });

            const success = await page.evaluate((sel, txt) => {
                const select = document.querySelector(sel);
                if (!select) return false;

                // Scroll into view first to ensure interactability
                select.scrollIntoView({ behavior: 'instant', block: 'center' });

                const option = Array.from(select.options).find(o => o.text === txt);
                if (!option) return false;

                select.value = option.value;
                select.dispatchEvent(new Event('change', { bubbles: true }));
                select.dispatchEvent(new Event('input', { bubbles: true }));
                return true;
            }, selector, text);

            if (!success) throw new Error(`Could not find option '${text}' via JS`);
        });
    }

    try {
        console.log('Navigating to search page...');
        try {
            await page.goto('https://satsuiteeducatorquestionbank.collegeboard.org/digital/search', { waitUntil: 'networkidle0', timeout: 60000 });
        } catch (e) {
            console.log('Navigation error/timeout (continuing):', e.message);
        }

        // Handle Cookie Banner (Robust)
        try {
            console.log('Checking for cookie banner...');
            const cookieSelector = '#onetrust-accept-btn-handler';
            const cookieBtn = await page.waitForSelector(cookieSelector, { visible: true, timeout: 5000 });
            if (cookieBtn) {
                console.log('Dismissing cookie banner...');
                await cookieBtn.click();
                await new Promise(r => setTimeout(r, 2000));
            }
        } catch (e) { /* Ignore if not found */ }

        for (const section of SECTIONS) {
            console.log(`\nProcessing Section: ${section.name}`);

            console.log('Reloading page to clear state...');
            try {
                await page.reload({ waitUntil: 'networkidle0', timeout: 60000 });
                // Re-apply zoom after reload
                await page.evaluate(() => document.body.style.zoom = '80%');
            } catch (e) {
                await page.goto('https://satsuiteeducatorquestionbank.collegeboard.org/digital/search', { waitUntil: 'networkidle0' });
            }
            await new Promise(r => setTimeout(r, 3000));

            // Select Assessment
            console.log('Selecting Assessment: SAT...');
            await selectOptionJS('select[aria-label="Select Assessment"]', 'SAT');
            await new Promise(r => setTimeout(r, 2000));

            // Select Section
            console.log(`Selecting Section: ${section.name}...`);
            await selectOptionJS('select[aria-label="Select Section"]', section.value);
            await new Promise(r => setTimeout(r, 2000));

            // Select All Domains
            console.log('Selecting all domains...');
            await retryAction('Select Checkboxes', async () => {
                await page.waitForSelector('input[type="checkbox"]', { timeout: 20000 });
                await page.evaluate(() => {
                    document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                        // Scroll to it
                        cb.scrollIntoView({ behavior: 'instant', block: 'center' });
                        if (!cb.checked) cb.click();
                    });
                });
            });
            await new Promise(r => setTimeout(r, 1000));

            // Scroll to Bottom for Search Button validity
            console.log('Scrolling to bottom for Search button...');
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await new Promise(r => setTimeout(r, 1000));

            // Click Search
            console.log('Clicking Search...');
            const searchClicked = await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const searchBtn = buttons.find(b => b.textContent.includes('Search'));
                if (searchBtn && !searchBtn.disabled) {
                    searchBtn.scrollIntoView({ behavior: 'instant', block: 'center' });
                    searchBtn.click();
                    return true;
                }
                return false;
            });

            if (!searchClicked) {
                console.error('Could not find/click Search button!');
                throw new Error('Search button click failed');
            }

            console.log('Waiting for results...');
            await page.waitForSelector('.cb-question-id', { timeout: 60000 });
            console.log('Search results loaded.');

            // ONE PAGE TEST ONLY - LIMIT TO 5 QUESTIONS
            let pageNum = 1;
            console.log(`\n--- Page ${pageNum} ---`);

            const questionIds = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('.cb-question-id'))
                    .map(el => el.innerText.replace('ID: ', '').trim())
                    .slice(0, 5);
            });

            console.log(`Found ${questionIds.length} questions: ${questionIds.join(', ')}`);

            for (let i = 0; i < questionIds.length; i++) {
                const qid = questionIds[i];
                console.log(`Processing ${qid} (${i + 1}/${questionIds.length})...`);

                await retryAction(`Extract ${qid}`, async () => {
                    const clicked = await page.evaluate((id) => {
                        const cells = Array.from(document.querySelectorAll('td'));
                        const targetCell = cells.find(c => c.innerText.includes(id));
                        if (targetCell) {
                            targetCell.scrollIntoView({ behavior: 'instant', block: 'center' });
                            const row = targetCell.closest('tr');
                            if (row) {
                                const btn = row.querySelector('button');
                                if (btn) { btn.click(); return true; }
                                targetCell.click(); return true;
                            }
                        }
                        return false;
                    }, qid);

                    if (!clicked) throw new Error('Click failed');

                    // View Modal
                    await page.waitForSelector('.cb-modal-inner-container', { timeout: 10000 });

                    const data = await page.evaluate(() => {
                        const modal = document.querySelector('.cb-modal-inner-container');
                        if (!modal) return null;
                        const id = modal.querySelector('.cb-question-id')?.innerText.replace('ID: ', '') || 'unknown';
                        const body = modal.querySelector('.question-body')?.innerHTML || '';
                        const choices = Array.from(modal.querySelectorAll('.choice-container')).map(c => ({
                            letter: c.querySelector('.choice-letter')?.innerText,
                            text: c.querySelector('.choice-text')?.innerText
                        }));
                        const answer = modal.querySelector('.correct-answer-section')?.innerText || '';
                        const rationale = modal.querySelector('.rationale-section')?.innerText || '';
                        return { id, body, choices, answer, rationale };
                    });

                    if (data) {
                        saveQuestion(section.name, data);
                    }

                    await page.keyboard.press('Escape');
                    await new Promise(r => setTimeout(r, 500));
                });
            }
        }
    } catch (error) {
        console.error('Fatal Error:', error);
        ensureDirectoryExistence(path.join(OUTPUT_DIR, 'error.txt'));
        await page.screenshot({ path: path.join(OUTPUT_DIR, 'fatal_error.png') });
        const html = await page.content();
        fs.writeFileSync(path.join(OUTPUT_DIR, 'debug.html'), html);
        const url = page.url();
        console.log('Failure URL:', url);
    } finally {
        await browser.close();
    }
}

function saveQuestion(section, data) {
    if (!data || !data.id) return;

    // Normalize path
    const safeSection = section.replace(/\s+/g, '-').toLowerCase();
    const filePath = path.join(OUTPUT_DIR, safeSection, `${data.id}.md`);

    ensureDirectoryExistence(filePath);

    const content = `---
id: ${data.id}
section: ${section}
---

# Question
${data.body}

# Choices
${data.choices.map(c => `* **${c.letter}** ${c.text}`).join('\n')}

# Answer
${data.answer}

# Rationale
${data.rationale}
`;

    fs.writeFileSync(filePath, content);
    console.log(`Saved: ${filePath}`);
}

scrape();
