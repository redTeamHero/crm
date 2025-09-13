# CRM Metro-2

Minimal CRM for generating Metro-2 dispute letters.

## Prerequisites
- Node.js 18+
- Python 3 (for postinstall)

## Setup
```bash
cd "metro2 (copy 1)/crm"
npm install
```

Data is stored in a local SQLite file `crm.sqlite` in the CRM directory, replacing the old JSON-based storage.

## Environment
- `PORT` (optional, defaults to 3000)

## Run
```bash
npm start
```

## Schedule

The `/schedule` page hooks into Google Calendar. Click any date to add a booking, meeting, phone call, or availability note. The page checks Google Calendar's free/busy API to prevent double‑booking.

Generate a shareable audit (converts a credit report HTML to JSON and renders it):
```bash
cd "metro2 (copy 1)/crm"
# From an HTML report
node creditAuditTool.js path/to/report.html
# Or from an existing JSON report
node creditAuditTool.js data/report.json
```

## Test

### Node tests
```bash
cd "metro2 (copy 1)/crm"
npm test
```

### Python tests
```bash
./python-tests/run.sh
```

## Deploy
Container-friendly; run `npm start` in production environment.
