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

## Environment
- `PORT` (optional, defaults to 3000)

## Run
```bash
npm start
```

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
