# SAT Question Bank Scraper

Pure-httpx scrapers for the College Board educator question bank. The
upstream API is unauthenticated — no login, no browser, no cookies.

## Endpoints used

- `POST https://qbank-api.collegeboard.org/msreportingquestionbank-prod/questionbank/digital/get-questions`
  Body: `{"asmtEventId":99,"test":<1|2>,"domain":"<comma-codes>"}` (1=R&W, 2=Math)
  Returns: metadata list (questionId, external_id, ibn, difficulty, domain, skill…).
- `POST .../digital/get-question`
  Body: `{"external_id":"<uuid>"}`. Returns full content (stem, choices, keys, rationale, stimulus).
- `GET https://saic.collegeboard.org/disclosed/<ibn>.json`
  Legacy fallback for ~459 Math questions whose `external_id` is null.

## Run

```bash
source venv/bin/activate
python scraper/api_scraper.py           # main scrape (~3 min for 3000 questions)
python scraper/ibn_scraper.py           # second pass for IBN questions
python scripts/build_index.py           # regenerate data/index.json
```

Resume is automatic — files that already exist on disk are skipped.

## Output

```
data/json/<section>/<difficulty>/<domain>/<questionId>.json
data/index.json                          # flat manifest for the viewer
scraper/api_failed.json                  # null_external_id list (input to ibn_scraper)
scraper/api_progress.json                # live progress
scraper/ibn_progress.json                # live IBN progress
```

## Question JSON schema

```jsonc
{
  "questionId": "ac472881",
  "externalId": "...uuid...",
  "section": "Math",
  "difficulty": "Hard",
  "difficultyCode": "H",
  "domain": "Algebra",
  "skill": "Linear equations in one variable",
  "type": "mcq",          // or "spr"
  "stimulus": "<HTML>",   // optional — R&W has it, Math usually doesn't
  "stem": "<HTML+MathML>",
  "answerOptions": [{"id": "...", "content": "<HTML>"}, ...],
  "keys": ["<id of correct option or literal answer>"],
  "rationale": "<HTML>",
  "source": "ibn-legacy",  // present only on IBN questions
  "raw": { /* original API response */ }
}
```
