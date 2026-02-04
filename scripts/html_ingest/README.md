# HTML Ingestion Pipeline

Parse HTML files into structured records stored in MySQL, then export normalized JSON so downstream automations (report parsers, Metro-2 validators, PDF generators) never touch the raw HTML again.

## Goal & Why (business impact)
- Keep credit-report uploads inside a clean ingestion surface so we can upsell premium reviews and automate dispute letter prep.
- Structured headings/meta/link data feeds Metro-2 sanity checks without exposing the original documents.

## Architecture
```
[HTML files] -> [BeautifulSoup parser] -> [MySQL schema]
                                    -> [Normalized JSON exporter]
```
- BeautifulSoup extracts titles, meta tags, headings, and anchor links.
- Parameterized queries keep MySQL inserts safe and idempotent.
- Exporter assembles JSON per document so analytics, dispute engines, and sales flows consume one canonical format.

## Scaffold / Files
```
scripts/html_ingest/
├── __init__.py
├── cli.py              # `python -m scripts.html_ingest.cli` entry point
├── db.py               # MySQL connection + schema bootstrap
├── ingest.py           # Parsing + persistence helpers
├── README.md           # You are here
```

## Code (runnable)
Use the CLI:
```bash
python -m scripts.html_ingest.cli ingest path/to/report.html
python -m scripts.html_ingest.cli ingest path/to/folder-of-html
python -m scripts.html_ingest.cli export --ids 1 2
```

### Environment variables
Set once (dotenv or shell):
```
HTML_DB_HOST=127.0.0.1
HTML_DB_PORT=3306
HTML_DB_USER=html_user
HTML_DB_PASSWORD=super-secret
HTML_DB_NAME=html_ingest
```

### Dependencies
```
pip install "beautifulsoup4>=4.12" "mysql-connector-python>=8.0"
```

### MySQL bootstrap
```sql
CREATE DATABASE IF NOT EXISTS html_ingest CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON html_ingest.* TO 'html_user'@'%' IDENTIFIED BY 'super-secret';
FLUSH PRIVILEGES;
```
Schema tables are created automatically on first run via `scripts/html_ingest/db.py`.

### Smoke test
1. Start a local MySQL container: 
   ```bash
   docker run --name html-db -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=html_ingest -p 3306:3306 -d mysql:8
   ```
2. Set env vars and install deps.
3. Drop a sample HTML file (`examples/report.html`).
4. Run ingestion and export:
   ```bash
   python -m scripts.html_ingest.cli ingest examples/report.html
   python -m scripts.html_ingest.cli export
   ```
5. Expect JSON with `meta`, `headings`, and `links` arrays.

## How to Run
1. Install dependencies.
2. Export env vars.
3. `python -m scripts.html_ingest.cli ingest ./uploads`
4. `python -m scripts.html_ingest.cli export > normalized.json`

## Metrics / AB ideas
- Track `% of uploads that produce ≥1 actionable heading` to forecast dispute volume.
- A/B test an upsell modal after export: CTA copy ("Schedule Premium Audit" vs "Unlock Concierge Review").
- Trigger event `html_ingest.completed` with `document_count` for funnel analytics.

## Next Revenue Wins
- Add Stripe Checkout paywall before export for concierge analysis.
- Enrich exporter with Metro-2 gap flags (charge-off vs Date of Last Payment) for instant consult upsells.
- Surface bilingual (EN/ES) compliance tips alongside each parsed heading for higher trust.
