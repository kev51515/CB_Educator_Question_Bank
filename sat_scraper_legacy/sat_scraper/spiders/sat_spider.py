import scrapy
import asyncio
from sat_scraper.items import QuestionItem
from scrapy_playwright.page import PageMethod
import os
from bs4 import BeautifulSoup
import re
import datetime
import json

class SatSpider(scrapy.Spider):
    name = "sat_spider"
    allowed_domains = ["collegeboard.org"]
    start_url = "https://satsuiteeducatorquestionbank.collegeboard.org/digital/search"

    def start_requests(self):
        # Sequential execution: Single Request, One Window
        yield scrapy.Request(
            self.start_url,
            meta={
                "playwright": True,
                "playwright_include_page": True,
            },
            dont_filter=True,
            callback=self.parse,
            errback=self.close_context
        )

    async def close_context(self, failure):
        self.logger.error(f"Request failed: {failure}")
        page = failure.request.meta.get("playwright_page")
        if page:
            await page.close()

    async def parse(self, response):
        print("PARSE CALLED - STARTING EXTRACTION")
        page = response.meta["playwright_page"]
        
        # Reset search (best effort)
        # Logic to handle project root consistent with pipeline
        # If we are in sat_scraper directory, project root is one up
        cwd = os.getcwd()
        if os.path.basename(cwd) == 'sat_scraper':
            project_root = os.path.dirname(cwd)
        else:
            project_root = cwd
        
        try:
            # 1. Viewport (Apply once)
            await page.set_viewport_size({"width": 1920, "height": 1080})
            # Removed zoom as it causes visual artifacts with dropdowns

            # Ensure cookies are handled before starting
            await self.handle_cookies(page)

            # Sequential Sections
            sections = ["Math", "Reading and Writing"]
            
            for i, section in enumerate(sections):
                self.logger.info(f"--- Starting Section: {section} ---")
                
                # Reload for fresh state if not first run
                if i > 0:
                    self.logger.info("Reloading page for next section...")
                    await page.goto(self.start_url, wait_until="domcontentloaded")
                    await asyncio.sleep(2)

                # 2. Cookie Banner (Check every time just in case)
                try:
                    banner = await page.wait_for_selector('#onetrust-accept-btn-handler', timeout=3000)
                    if banner:
                        if await banner.is_visible():
                            await banner.click()
                            await asyncio.sleep(1)
                except:
                    pass

                # 2.5. Check for "New Search" button (Robust reset)
                try:
                    new_search_btn = page.locator('//button[contains(text(), "New Search")]').first
                    await new_search_btn.wait_for(state="visible", timeout=5000)
                    self.logger.info("Found 'New Search' button, clicking to reset...")
                    await new_search_btn.click()
                    # Wait for the search form to reappear
                    await page.wait_for_load_state("networkidle")
                    await asyncio.sleep(2)
                except Exception:
                    self.logger.info("'New Search' button not found (assuming fresh search page).")

                # 3. Assessment: SAT
                await self.select_dropdown(page, "Assessment", "SAT")
                await asyncio.sleep(1)

                # 4. Select Section
                # Wait for Section dropdown to appear (it depends on Assessment)
                # We can just call select_dropdown, it waits for the element.
                await self.select_dropdown(page, "Section", section)
                await asyncio.sleep(2)
                # await page.screenshot(path=f"debug_{section.replace(' ','_')}_selection.png") # Removed screenshot

                # await page.screenshot(path=f"debug_{section.replace(' ','_')}_selection.png")
                
                # 5. Select All Domains (Required to enable Search)
                self.logger.info("Selecting All Domains...")
                try:
                    # Click all labels inside the fieldset
                    # We target labels because inputs are often hidden
                    domain_labels = page.locator('div.content-domain fieldset label')
                    count = await domain_labels.count()
                    if count == 0:
                        self.logger.warning("No domain checkboxes found!")
                    
                    for i in range(count):
                        await domain_labels.nth(i).click(force=True)
                        await asyncio.sleep(0.1)
                except Exception as e:
                    self.logger.warning(f"Failed to select domains: {e}")


                
                # Click Search
                self.logger.info("Clicking Search...")
                await asyncio.sleep(1) # Wait for UI to stabilize
                # Use text-based selector which is more robust
                # Wait for button
                search_btn = page.locator('button:has-text("Search")')
                if await search_btn.count() > 1:
                    search_btn = search_btn.first
                
                # JS Force Enable Hack
                # If the button is disabled (due to client-side validation lagging), we force enable it.
                # This assumes backend validation will pass if parameters are set (which they are via JS/Select).
                try:
                    if not await search_btn.is_enabled():
                        self.logger.info("Search button disabled. Force enabling via JS...")
                        await page.evaluate("""
                            const btns = Array.from(document.querySelectorAll('button'));
                            const searchBtn = btns.find(b => b.innerText.includes('Search'));
                            if (searchBtn) {
                                searchBtn.disabled = false;
                                searchBtn.removeAttribute('disabled');
                                searchBtn.classList.remove('disabled');
                            }
                        """)
                        await asyncio.sleep(0.5)
                except Exception as e:
                    self.logger.warning(f"JS Force enable failed: {e}")

                # Force click to bypass overlay/stability issues
                self.logger.info("Force clicking Search...")
                await search_btn.click(force=True) 

                # Wait for Results
                try:
                    await page.wait_for_selector('div.question-content', state="visible", timeout=10000)
                except:
                    self.logger.info("No initial results found or timeout.")
                
                # Attempt to get total results count
                total_results_text = "Unknown"
                try:
                    # Selector guess: .cb-results-count or similar, usually "1,234 items found"
                    # We will look for a common pattern if specific class is unknown
                    # Based on typical CB UI, it might be in a span near the top
                    results_el = page.locator('span:has-text("Found")')
                    if await results_el.count() > 0:
                        total_results_text = await results_el.first.inner_text()
                        self.logger.info(f"Progress Indicator: {total_results_text}")
                except Exception as e:
                    self.logger.warning(f"Could not scrape total results count: {e}")

                self.total_scraped = 0
                self.progress_file = os.path.join(project_root, 'progress.json')

                # Helper to update progress file
                def update_progress(scraped_count, current_section, status="running"):
                    try:
                        with open(self.progress_file, 'w') as f:
                            json.dump({
                                "total_scraped": scraped_count,
                                "current_section": current_section,
                                "total_results_text": total_results_text,
                                "status": status,
                                "last_updated": str(datetime.datetime.now())
                            }, f)
                    except Exception as e:
                        self.logger.warning(f"Failed to update progress.json: {e}")
                
                update_progress(0, section)

                # Pagination Loop
                while True:
                    rows = await page.locator('tr').all()
                    self.logger.info(f"Found {len(rows)} rows in table.")
                    
                    # Skip header row if necessary (usually first row is header, but locator('tr') gets all)
                    # We can check content.
                    
                    for row in rows:
                        # Extract basic metadata to determine ID and Path
                        try:
                            qid_el = row.locator('td:nth-child(2)')
                            
                            if await qid_el.count() == 0: 
                                # self.logger.info("Skipping row with no QID (header?)")
                                continue 
                            
                            qid = await qid_el.inner_text()
                            self.logger.info(f"Processing Row QID: {qid}")
                            
                            # We need domain/difficulty/skill to construct path and check existence
                            # Iterate columns to find them
                            # 2: Skill/Knowledge Testing Points? 
                            # 3: Domain
                            # 4: Difficulty
                            cols = await row.locator('td').all()
                            if len(cols) < 5: 
                                self.logger.warning(f"Skipping row {qid}: Not enough columns ({len(cols)})")
                                continue
                            
                            domain_text = await cols[2].inner_text()
                            difficulty_text = await cols[3].inner_text()
                            
                            # Construct Path to check existence
                            section_slug = self.slugify(section)
                            domain_slug = self.slugify(domain_text)
                            difficulty_slug = self.slugify(difficulty_text)
                            
                            target_md = os.path.join(project_root, 'data', section_slug, domain_slug, difficulty_slug, f"{qid}.md")
                            
                            if os.path.exists(target_md):
                                self.logger.info(f"Skipping {qid} (Already exists at {target_md})")
                                continue
                                
                            # If not exists, click and scrape
                            # Click the button inside the row (id column)
                            try:
                                await row.locator('button.view-question-button').click()
                            except:
                                self.logger.error(f"Failed to click button for {qid}")
                                continue
                            
                            # Wait for modal content
                            try:
                                await page.wait_for_selector('.question-content', state="visible", timeout=10000)
                            except:
                                self.logger.error(f"Modal failed to open for {qid} (Timeout waiting for .question-content)")
                                continue
                            
                            # Scrape Modal
                            data = await self.scrape_modal(page, qid)
                            
                            if data:
                                # Merge table metadata with modal data (table metadata is preferred/backup)
                                data['id'] = qid
                                data['section'] = section
                                data['domain'] = domain_text # Use table value
                                data['difficulty'] = difficulty_text
                                
                                # Handle Assets (Screenshots)
                                assets = data.get('assets', [])
                                if assets:
                                    images_dir = os.path.join(project_root, 'data', section_slug, domain_slug, difficulty_slug)
                                    os.makedirs(images_dir, exist_ok=True)
                                    
                                    # Helper to process soup replacement
                                    def replace_asset_in_soup(soup, asset_id, img_path, img_fname):
                                        asset_in_soup = soup.find(id=asset_id)
                                        if asset_in_soup:
                                            new_img = soup.new_tag("img")
                                            # Image is now in the same directory as the MD file
                                            new_img['src'] = img_fname
                                            new_img['alt'] = f"Asset {asset_id}"
                                            new_img['width'] = "100%"
                                            asset_in_soup.replace_with(new_img)
                                            return True
                                        return False

                                    q_soup = BeautifulSoup(data['question_html'], 'html.parser')
                                    r_soup = BeautifulSoup(data['rationale'], 'html.parser')
                                    
                                    choice_soups = []
                                    if data.get('choices'):
                                        for c in data['choices']:
                                            if c.get('html'):
                                                choice_soups.append(BeautifulSoup(c['html'], 'html.parser'))
                                            else:
                                                choice_soups.append(None)

                                    for i, asset_id in enumerate(assets):
                                        image_filename = f"{qid}_{i}.png"
                                        image_path = os.path.join(images_dir, image_filename)
                                        
                                        try:
                                            # Screenshot
                                            await page.locator(f"#{asset_id}").scroll_into_view_if_needed(timeout=2000)
                                            await page.locator(f"#{asset_id}").screenshot(path=image_path)
                                            self.logger.info(f"Saved asset {asset_id} to {image_path}")
                                            
                                            # Replace in all soups
                                            found = False
                                            if replace_asset_in_soup(q_soup, asset_id, image_path, image_filename): found = True
                                            if replace_asset_in_soup(r_soup, asset_id, image_path, image_filename): found = True
                                            
                                            for cs in choice_soups:
                                                if cs and replace_asset_in_soup(cs, asset_id, image_path, image_filename): found = True
                                            
                                            if not found:
                                                self.logger.warning(f"Asset {asset_id} captured but not found in any HTML content")

                                        except Exception as e:
                                            self.logger.error(f"Failed to screenshot asset {asset_id}: {e}")
                                    
                                    data['question_html'] = str(q_soup)
                                    data['rationale'] = str(r_soup)
                                    
                                    # Update choices text with the HTML version (full fidelity)
                                    if data.get('choices'):
                                        for idx, c in enumerate(data['choices']):
                                            if choice_soups[idx]:
                                                c['text'] = str(choice_soups[idx]) # Use HTML as the text content
                                    
                                    data.pop('assets')

                                if data.get('debug_log'):
                                    self.logger.info(f"DEBUG JS [{qid}]: {data.get('debug_log')}")
                                    data.pop('debug_log')

                                self.total_scraped += 1
                                update_progress(self.total_scraped, section)
                                yield QuestionItem(**data) 

                                await page.keyboard.press('Escape')
                                await asyncio.sleep(0.5)

                                # break # Removed debug break to allow full scraping
                                
                            else:
                                self.logger.error(f"Skipping {qid} due to modal failure")
                                await page.keyboard.press('Escape')

                        except Exception as e:
                            self.logger.error(f"Error processing row: {e}")
                            continue

                    # Next Page
                    next_btn = page.locator('button[aria-label="Next page"]')
                    if await next_btn.is_visible() and await next_btn.is_enabled():
                        await next_btn.click()
                        await page.wait_for_timeout(5000) # Wait for reload
                    else:
                        break # End of pages for this section
        except Exception as e:
            self.logger.error(f"Fatal Error: {str(e)}")
            import traceback
            traceback.print_exc()
            await page.screenshot(path=f"fatal_error.png")
        finally:
            await page.close()

    async def handle_cookies(self, page):
        """
        Robustly handles the cookie consent banner.
        """
        try:
            # Look for "Accept All" button
            # Note: The text might vary, so we can try multiple selectors or partial text
            banner = await page.locator('button:has-text("Accept All")').first
            if await banner.is_visible(timeout=5000):
                self.logger.info("Cookie Banner Found, clicking 'Accept All'...")
                await banner.click()
                await asyncio.sleep(2) # Wait for banner to disappear/animation
            else:
                self.logger.info("No Cookie Banner visible.")
        except Exception as e:
            self.logger.warning(f"Cookie handling encountered an issue (ignoring): {e}")

    async def select_dropdown(self, page, label_text, option_text):
        """
        Robustly select an option via Keyboard Interaction.
        Focuses the element and types the option text.
        """
        self.logger.info(f"Selecting '{option_text}' in dropdown '{label_text}' (Keyboard Strategy)...")
        
        try:
            # Locate the Native Select
            select_xpath = f"(//label[contains(text(), '{label_text}')]/following-sibling::div//select | //select[contains(@aria-label, '{label_text}')])"
            select_el = page.locator(select_xpath).first
            
            self.logger.info(f"Focusing select for '{label_text}'...")
            await select_el.click(force=True) # Ensure focus
            await asyncio.sleep(0.5)

            self.logger.info(f"Typing '{option_text}'...")
            # Type the text (jumps to option)
            await page.keyboard.type(option_text)
            await asyncio.sleep(0.5)
            await page.keyboard.press("Enter")
            await asyncio.sleep(1.0)
            
            # Verify Selection by checking the SPAN text
            # The span should now show the option text
            span_xpath = f"//label[contains(text(), '{label_text}')]/following-sibling::div//span[contains(@class, 'cb-select')]"
            span = page.locator(span_xpath).first
            span_text = await span.inner_text()
            
            if option_text in span_text:
                self.logger.info(f"Successfully selected '{option_text}' (verified via UI text: '{span_text}').")
            else:
                self.logger.warning(f"UI text '{span_text}' does not match '{option_text}'. Trying Arrow Keys...")
                # Fallback: Arrow Down loop?
                await select_el.click(force=True)
                await page.keyboard.press("ArrowDown")
                await page.keyboard.press("Enter")
        
        except Exception as e:
            self.logger.warning(f"Keyboard strategy failed: {e}. Trying Native Fallback...")
            
            # Fallback: Native Select
            select_xpath = f"(//label[contains(text(), '{label_text}')]/following-sibling::div//select | //select[contains(@aria-label, '{label_text}')])"
            select_el = page.locator(select_xpath).first
            await select_el.wait_for(state="attached", timeout=5000)
            await select_el.select_option(label=option_text, force=True)
            # Dispatch events
            await select_el.evaluate("el => { el.dispatchEvent(new Event('change', {bubbles: true})); el.dispatchEvent(new Event('blur', {bubbles: true})); }")
            self.logger.info("Used Native Fallback.")
            return

        except Exception as e:
            self.logger.warning(f"Native select_option failed: {e}. Trying JS Fallback...")

        # Fallback: JS Eval
        try:
            js_code = """
            (el, text) => {
                const options = Array.from(el.options);
                const option = options.find(o => o.text.trim() === text);
                if (option) {
                    el.value = option.value;
                    el.dispatchEvent(new Event('focus', {bubbles: true}));
                    el.dispatchEvent(new Event('change', {bubbles: true}));
                    el.dispatchEvent(new Event('input', {bubbles: true}));
                    el.dispatchEvent(new Event('blur', {bubbles: true}));
                    return option.value;
                }
                return null;
            }
            """
            result = await select_el.evaluate(js_code, option_text)
            
            if result:
                self.logger.info(f"Successfully selected '{option_text}' in '{label_text}' (value={result}) via JS Fallback")
            else:
                self.logger.error(f"Option '{option_text}' not found in dropdown '{label_text}'")
                await page.screenshot(path=f"debug_failed_select_{label_text}.png")
                raise ValueError(f"Option '{option_text}' not found")
                
        except Exception as e:
            self.logger.error(f"Failed JS select for '{option_text}' in '{label_text}': {e}")
            await page.screenshot(path=f"debug_failed_select_{label_text}.png")
            raise

            
        except Exception as e:
            self.logger.error(f"Failed native select for '{option_text}' in '{label_text}': {e}")
            await page.screenshot(path=f"debug_failed_select_{label_text}.png")
            raise

    async def open_modal(self, page, qid):
        # Fallback to finding text if ID selector fails
        # This is more robust against DOM changes
        found = await page.evaluate(f"""(qid) => {{
            const buttons = Array.from(document.querySelectorAll('button'));
            const target = buttons.find(b => b.innerText.includes(qid));
            if (target) {{
                target.scrollIntoView({{block: 'center', inline: 'center'}});
                target.click();
                return true;
            }}
            return false;
        }}""", qid)
        
        if not found:
            self.logger.warning(f"Could not click modal button for {qid}")
            return False

        try:
            # Wait for question content to be visible (updated from .question-body)
            await page.wait_for_selector('.question-content', state='visible', timeout=5000)
            return True
        except Exception as e:
            self.logger.error(f"Modal did not open for {qid}: {e}")
            await page.screenshot(path=f"debug_modal_fail_{qid}.png")
            with open(f"debug_modal_fail_{qid}.html", "w") as f:
                f.write(await page.content())
            return False

    async def scrape_modal(self, page, qid):
        return await page.evaluate(f"""() => {{
            // Find the visible question content
            const contents = Array.from(document.querySelectorAll('.question-content'));
            const content = contents.find(c => {{
                const style = window.getComputedStyle(c);
                return style.display !== 'none' && style.visibility !== 'hidden' && c.offsetParent !== null;
            }});

            if (!content) return {{}};
            const modal = content.closest('div[role="dialog"]') || content.parentElement; // Fallback
            
            const extractText = (sel) => modal.querySelector(sel)?.innerText || '';
            const extractHTML = (sel) => modal.querySelector(sel)?.innerHTML || '';




            
            // Common Ancestor Strategy:
            let parent = content.parentElement;
            let root = null;
            let steps = 0;
            let debugLog = [];
            
            debugLog.push("Start search from: " + (content.className || content.tagName));

            while (parent && parent !== document.body && steps < 15) {{
                if (parent.querySelector('.answer-choices') || parent.querySelector('.rationale')) {{
                    root = parent;
                    debugLog.push("Found root at step " + steps + ": " + parent.className);
                    break;
                }}
                parent = parent.parentElement;
                steps++;
            }}
            
            const context = root || modal || content;
            if (!root) debugLog.push("Root not found, using context: " + (context.className || context.tagName));

            // Extract Difficulty and Map to 1-3
            let difficultyText = '';
            // Try to find H5 with "Difficulty:" in the context
            const headers = Array.from(context.querySelectorAll('h5'));
            const diffHeader = headers.find(h => h.innerText.includes('Difficulty:'));
            if (diffHeader) {{
                difficultyText = diffHeader.innerText.replace('Difficulty:', '').trim();
            }}

            let difficultyLevel = 0;
            if (difficultyText === 'Easy') difficultyLevel = 1;
            if (difficultyText === 'Medium') difficultyLevel = 2;
            if (difficultyText === 'Hard') difficultyLevel = 3;

            // SCROLLING: Ensure answer content is visible
            const answerSection = context.querySelector('.answer-content') || context.querySelector('.answer-choices');
            if (answerSection) {{
                answerSection.scrollIntoView({{block: "center", inline: "center"}});
                // Tiny wait not possible here in sync evaluate, but usually scrollIntoView is immediate enough for innerText checks
            }} else {{
                debugLog.push("No answer section to scroll");
            }}

            // ASSET TAGGING
            const assets = [];
            let assetIdx = 0;
            const assetElements = Array.from(context.querySelectorAll('mjx-container, img'));
            
            assetElements.forEach(el => {{
                // Skip icons or tiny images if needed (heuristic)
                const rect = el.getBoundingClientRect();
                if (rect.width < 10 || rect.height < 10) return;

                if (!el.id) {{
                    el.id = "sat-asset-" + assetIdx++;
                }}
                assets.push(el.id);
            }});
            debugLog.push("Found " + assets.length + " assets from " + assetElements.length + " candidates");

            const extractTextContext = (sel) => {{
                const el = context.querySelector(sel);
                if (!el) return '';
                // Prefer innerText, fallback to textContent
                return (el.innerText || el.textContent || '').trim();
            }};
            
            const extractHTMLContext = (sel) => context.querySelector(sel)?.innerHTML || '';

            // Choices
            let choiceElements = [];
            const answerChoicesContainer = context.querySelector('.answer-choices');
            
            if (answerChoicesContainer) {{
                debugLog.push("Found answerChoicesContainer");
                choiceElements = Array.from(answerChoicesContainer.querySelectorAll('ul li'));
                debugLog.push("Found " + choiceElements.length + " LIs");
            }} else {{
                debugLog.push("answerChoicesContainer NOT FOUND in context");
                // Last ditch effort: global search
                const allAC = Array.from(document.querySelectorAll('.answer-choices'));
                const visibleAC = allAC.find(c => c.offsetParent !== null);
                if (visibleAC) {{
                     debugLog.push("Found global visible answer-choices");
                     choiceElements = Array.from(visibleAC.querySelectorAll('ul li'));
                }}
            }}
            
            const choicesMap = ['A', 'B', 'C', 'D'];
            const choices = choiceElements.map((c, i) => {{
                return {{
                    letter: choicesMap[i] || '?',
                    text: (c.innerText || c.textContent || '').trim(),
                    html: c.innerHTML 
                }};
            }});

            return {{
                // id: '{qid}', // ID is handled in Python
                // domain/skill handled in Python from table
                question_html: extractHTMLContext('.question'), 
                choices: choices,
                answer: extractTextContext('.answer-content .p-2'), 
                rationale: extractHTMLContext('.rationale'),
                assets: assets,
                debug_log: debugLog.join(" | ")
            }};
        }}""")

    async def click_next_page(self, page):
        # The pagination next button is an anchor with a right arrow icon
        # Selector: nav[aria-label="pagination"] li a span.cb-icon.cb-right
        return await page.evaluate("""() => {
            const nextLink = document.querySelector('nav[aria-label="pagination"] li:last-child a');
            
            if (nextLink && !nextLink.classList.contains('disabled') && !nextLink.getAttribute('aria-disabled')) {
                nextLink.scrollIntoView();
                nextLink.click();
                return true;
            }
            return false;
        }""")

    def slugify(self, text):
        if not text:
            return "unknown"
        text = text.lower().strip()
        text = re.sub(r'[^\w\s-]', '', text)
        text = re.sub(r'[-\s]+', '-', text)
        return text
