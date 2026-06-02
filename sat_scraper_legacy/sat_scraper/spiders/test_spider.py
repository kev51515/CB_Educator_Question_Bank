import scrapy

class TestSpider(scrapy.Spider):
    name = "test_spider"
    
    def start_requests(self):
        yield scrapy.Request(
            "https://satsuiteeducatorquestionbank.collegeboard.org/digital/search",
            meta={
                "playwright": True,
                "playwright_include_page": True,
            }
        )

    async def parse(self, response):
        page = response.meta["playwright_page"]
        
        # Cookie Handling
        try:
            banner = await page.wait_for_selector('button:has-text("Accept All")', timeout=5000)
            if banner:
                print("Cookie Banner Found, clicking...")
                await banner.click()
                await page.wait_for_timeout(3000) # Wait for animation
        except:
            print("No Cookie Banner found")

        content = await page.content()
        with open("page_source.html", "w") as f:
            f.write(content)
        await page.close()
