# Dependency Setup Guide

## Goal & Why (Business Impact)
- Ensure every engineer or operator can bootstrap the CRM locally without missing runtimes or background services.
- Prevent revenue-impacting outages by documenting Redis/DB/Python prerequisites that power dispute automation, paywalls, and reporting.
- Shorten onboarding so growth experiments (pricing, funnels, Metro-2 rules) can ship faster.

## Architecture Snapshot
```
Browser (Next/React frontends) → Express API (`metro2 (copy 1)/crm/server.js`)
      ↓ BullMQ queues (Redis) → Workers (`scripts/marketingTwilioWorker.js`, letter jobs)
Python helpers (`python-tests/`, `metro2/`) ←→ Node via `pythonEnv.js`
SQLite (dev) / Postgres / MySQL via Knex drivers
Puppeteer → Chromium (PDF + scraping)
```

---

## 1. System Prerequisites Checklist
- [ ] **Node.js 20.x LTS** (ships ES modules + async contexts used by the workers). Install via [nvm](https://github.com/nvm-sh/nvm) or `brew install node@20` / `choco install nodejs`.
- [ ] **npm 10+** (bundled with Node 20). Verify with `npm --version`.
- [ ] **Python 3.10+** with `venv` + `pip`. On Debian/Ubuntu run `sudo apt-get install python3 python3-venv python3-pip`.
- [ ] **Git** to clone the repo.
- [ ] **SQLite3** client libs (for local dev). `sudo apt-get install sqlite3 libsqlite3-dev` or `brew install sqlite`.
- [ ] **Redis 6+** (BullMQ queues, rate limiting). Use Docker (`docker run -p 6379:6379 redis:7`) or native install (`brew install redis`).
- [ ] **Chromium runtime libraries** if you are on Debian/Ubuntu so Puppeteer can render PDFs: `sudo npm run setup:chrome` (installs `libnss3` + `libnspr4`).
- [ ] **Optional DB clients** if you target Postgres/MySQL in prod: install `libpq-dev` / `postgresql-client` or `libmysqlclient-dev`.

> ✅ Tip: If your CI/CD image already has Python, add `CRM_PYTHON_BIN=/usr/bin/python3` to avoid interpreter detection delays.

---

## 2. Node.js Dependencies (installed via `npm install`)
Run everything from the application root:
```bash
cd "metro2 (copy 1)/crm"
npm install
```
This pulls the versions locked in `package-lock.json` and triggers the `postinstall` script.

| Package | Purpose |
| --- | --- |
| `archiver` | Zips dispute packets for downloads.
| `bcryptjs` | Hashes credentials for the portal/admin users.
| `bullmq` | Queue + worker orchestration backed by Redis.
| `cheerio` | HTML parsing for Metro-2 audits and templates.
| `express` | HTTP API powering the CRM and portal endpoints.
| `ioredis` | Redis client shared by queues + caching.
| `jsdom` | Server-side DOM utilities for parsing/sanitizing uploads.
| `jsonwebtoken` | JWT auth tokens for API clients and portal sessions.
| `knex` | Query builder + migration runner across SQLite/Postgres/MySQL.
| `multer` | Handles credit report uploads (multi-part forms).
| `mysql2` | MySQL/MariaDB driver when running Knex against MySQL.
| `nanoid` | Generates tenant-safe unique IDs.
| `node-fetch` | Performs outbound REST calls (Stripe, marketing APIs).
| `nodemailer` | Gmail/SMTP automations for onboarding emails.
| `pdfkit` | Generates printable dispute PDFs.
| `pg` | PostgreSQL driver for Knex when using Postgres.
| `puppeteer` | Headless Chromium for PDF previews and scraping.
| `sqlite3` | Default local database adapter.
| `stripe` | Stripe Checkout + billing integration.
| `twilio` | SMS/voice nudges via Twilio.
| `zipcodes` | Zip-code metadata for dispute letters.

Dev-time packages (installed by the same command):
- `jest` for API/unit tests.
- `supertest` for HTTP integration tests.

Monorepo utilities:
- Parser-specific packages were removed while the parsing stack is rewritten, so no additional Metro-2 parser utilities are currently shipped.

---

## 3. Python Dependencies
The Node postinstall script bootstraps a virtualenv at `metro2 (copy 1)/crm/.venv` and installs:
- `beautifulsoup4`

Manual install (if you skip `npm install` or customize Python):
```bash
cd "metro2 (copy 1)/crm"
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```
Set `CRM_PYTHON_BIN` when running inside containers where the interpreter path differs (e.g., `/opt/python/bin/python3`).

---

## 4. Background Services & Assets
- **Redis** must be reachable at `REDIS_URL` (defaults to `redis://127.0.0.1:6379`). Start it before `npm start`.
- **Database** defaults to SQLite via `crm.sqlite` in the project root. For Postgres/MySQL switch `DATABASE_CLIENT` and ensure the matching driver (`pg` / `mysql2`) is installed (already part of `npm install`).
- **Chromium cache**: `npm install` downloads a pinned Chromium build for Puppeteer (~150 MB). Allow outbound HTTPS.
- **Fonts/Locales**: To support bilingual PDFs, ensure the OS font stack includes Latin + accent characters (e.g., `sudo apt-get install fonts-dejavu`).

---

## 5. End-to-End Installation Flow (Copy & Paste)
```bash
# 1. Clone
git clone https://github.com/<your-org>/crm.git
cd crm

# 2. Install system packages (Debian/Ubuntu example)
sudo apt-get update && sudo apt-get install -y nodejs npm python3 python3-venv python3-pip sqlite3 libsqlite3-dev redis-server

# 3. App dependencies
cd "metro2 (copy 1)/crm"
npm install              # pulls Node deps + runs postinstall for Python
npm run setup:chrome     # only if Chromium libs missing (Linux headless)

# 4. Optional: lock Python interpreter
CRM_PYTHON_BIN=/usr/bin/python3 npm install  # rerun if you changed Python

# 5. Verify installs
npm ls --depth=0
./.venv/bin/python -m pip list
redis-cli ping
```
For macOS (Homebrew): `brew install node@20 python@3.11 sqlite redis` then follow steps 3–5.
For Windows: install Node 20 + Python 3.11 via installers, enable the "Add to PATH" option, then run the commands in an elevated PowerShell (Redis via [Memurai](https://www.memurai.com/) or Docker).

---

## 6. Smoke Test After Installation
```bash
# Start Redis in a new terminal if not already running
redis-server

# Back in the app directory
echo "PORT=3000" > .env
npm run migrate
npm start

# Separate terminal: verify auth works
curl -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"ducky","password":"duck"}'
```
Successful response (`200 OK`) confirms Node deps, Python helpers, SQLite, and Redis are wired up.

---

## 7. Troubleshooting Cheatsheet
- **`sqlite3` build failures**: Install build tools (`sudo apt-get install build-essential`) and rerun `npm install`.
- **`venv` missing ensurepip**: Install `python3-venv` or rerun `npm install` with `CRM_PYTHON_BIN` pointing to a full Python build.
- **Puppeteer launch errors**: Run `npm run setup:chrome` or install `libnss3`/`libnspr4` manually.
- **Redis connection refused**: Confirm `redis-cli ping` returns `PONG`, or set `REDIS_URL` to your hosted instance.
- **Mixed Python versions in CI**: Cache `.venv` per `python --version` to avoid ABI conflicts.

With these dependencies in place, you can immediately run migrations, start the API, and iterate on Metro-2 automation without surprises.
