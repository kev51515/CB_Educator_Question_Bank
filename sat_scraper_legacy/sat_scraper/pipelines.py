import os
from itemadapter import ItemAdapter

class MarkdownExportPipeline:
    def open_spider(self, spider):
        # Determine project root (2 levels up from pipelines.py location inside sat_scraper/sat_scraper)
        project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        self.base_dir = os.path.join(project_root, 'data')
        os.makedirs(self.base_dir, exist_ok=True)
        
    def process_item(self, item, spider):
        adapter = ItemAdapter(item)
        
        # Determine path: /data/{section}/{domain}/{difficulty}/{id}.md
        # Slugify function to keep paths clean
        def slugify(value):
            if not value: return 'unknown'
            return value.lower().replace(' ', '-').replace('/', '-').replace(':', '')

        section_slug = slugify(adapter.get('section', 'unknown'))
        domain_slug = slugify(adapter.get('domain', 'unknown'))
        difficulty_slug = slugify(adapter.get('difficulty', 'unknown'))
        file_id = adapter.get('id', 'unknown')
        
        # Nested directory structure
        target_dir = os.path.join(self.base_dir, section_slug, domain_slug, difficulty_slug)
        os.makedirs(target_dir, exist_ok=True)
        
        file_path = os.path.join(target_dir, f"{file_id}.md")
        
        # Format Content
        content = self.format_markdown(adapter)
        
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
            
        return item

    def format_markdown(self, adapter):
        choices = adapter.get('choices', [])
        formatted_choices = "\n".join([f"* **{c.get('letter')}** {c.get('text')}" for c in choices])
        
        return f"""---
id: {adapter.get('id')}
section: {adapter.get('section')}
domain: {adapter.get('domain')}
skill: {adapter.get('skill')}
difficulty: {adapter.get('difficulty')}
difficulty_level: {adapter.get('difficulty_level')}
---

# Question
{adapter.get('question_html')}

# Choices
{formatted_choices}

# Answer
{adapter.get('answer')}

# Rationale
{adapter.get('rationale')}
"""
