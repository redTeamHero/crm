# Metro2 CRM

## Metro-2 Violation Cheat Sheet

Use `metro2Violations.json` as a quick reference for common Metro-2 and FCRA conflicts. The file drives both the audit engine that flags report issues and the letter generator that cites the correct statutes.

### Sample entry

```json
{
  "code": "STATUS_PAST_DUE",
  "title": "Past-due balance reported as current",
  "detail": "Account shows 'Pays as agreed' but Past Due > $0",
  "severity": "high",
  "fcra": "15 U.S.C. §1681s-2(a)(1)(A)"
}
```

### Extending the dataset

1. Append new objects to `metro2Violations.json` with `code`, `title`, `detail`, `severity`, and `fcra` fields.
2. Keep descriptions factual and align each rule with FCRA accuracy requirements—avoid implying guaranteed deletions or timeframes.
3. Run `npm test` to validate changes and maintain compliance.

## Chromium dependencies

Puppeteer needs system libraries (`libnss3`, `libnspr4`) to render PDFs. On Debian/Ubuntu run:

```bash
npm run setup:chrome
```

Without them, letter generation will fail with errors like `libnspr4.so: cannot open shared object file`.

## Quick Start

1. **Run audit** – parse `data/report.json` and create a shareable report.

   ```bash
   npm run audit
   ```

2. **View high-severity violations** – open the generated PDF under `public/reports/` and focus on entries tagged `"severity": "high"`.

3. **Generate letters referencing FCRA sections** – start the server and use the dashboard's **Generate Letters** action.

   ```bash
   npm start
   ```

## Tests

Install dependencies and run the test suite:

```bash
npm install
npm test
```

### Unauthorized access check

The test suite includes assertions that a non-admin token receives `403 Forbidden` when accessing admin-only routes like `/api/users` and `/api/team-members`.


