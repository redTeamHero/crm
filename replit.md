# Metro2 CRM

## Overview
This is a multi-tenant CRM system for credit-report auditing and dispute-letter generation. It includes:
- **Client Portal**: A Next.js frontend for clients to upload reports, review findings, and manage disputes
- **CRM Backend**: An Express.js backend (in `metro2 (copy 1)/crm/`) for API routes and processing
- **Metro 2 Core Libraries**: Shared packages for parsing and validating Metro 2 credit report data

## Project Structure
- `apps/client-portal/` - Next.js client portal (main frontend, runs on port 5000)
- `metro2 (copy 1)/crm/` - Express CRM backend with API routes
- `packages/metro2-core/` - Core Metro 2 parsing and validation logic
- `packages/metro2-cheerio/` - Cheerio adapter for Node.js parsing
- `packages/metro2-browser/` - Browser-compatible parser
- `shared/` - Shared knowledge graph and violations data
- `ai_agent/` - Python AI agent for automated workflows
- `python-tests/` - Python test suite

## Running the Project
The client portal runs automatically via the configured workflow:
```bash
cd apps/client-portal && npm run dev
```

The backend can be started separately if needed:
```bash
cd "metro2 (copy 1)/crm"
npm install
npm run dev
```

## Configuration
### Client Portal (Next.js)
- Runs on port 5000 (0.0.0.0)
- Configured to allow all dev origins for Replit proxy compatibility
- Uses Tailwind CSS for styling

### Backend Environment Variables (see README.md for full list)
- `PORT` - Backend HTTP port (default: 3000)
- `DATABASE_URL` - Database connection string
- `JWT_SECRET` - Session token signing secret
- Various API keys for integrations (Stripe, OpenAI, etc.)

## Recent Changes
- 2026-01-30: Initial Replit environment setup
  - Configured Next.js to run on port 5000 with 0.0.0.0 host
  - Added allowedDevOrigins for Replit proxy compatibility
  - Set up deployment configuration for autoscale

## Dependencies
- Node.js 20
- Python 3.12 (for AI agent and Metro 2 parsers)
- Next.js 14.x
- React 18.x
- Tailwind CSS 3.x
