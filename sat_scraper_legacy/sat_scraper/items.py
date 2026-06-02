import scrapy

class QuestionItem(scrapy.Item):
    id = scrapy.Field()
    section = scrapy.Field()
    domain = scrapy.Field()
    skill = scrapy.Field()
    difficulty = scrapy.Field()
    difficulty_level = scrapy.Field()
    question_html = scrapy.Field()
    choices = scrapy.Field()  # List of dicts {letter, text}
    answer = scrapy.Field()
    rationale = scrapy.Field()
