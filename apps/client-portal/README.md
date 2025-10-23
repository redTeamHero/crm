# Client Portal (Next.js)

Premium bilingual portal UI that consumes the Express API (`/api/portal/:id`) and renders a conversion-focused dashboard for each consumer.

## Prerequisites
- Node.js 18+
- npm 9+
- Backend API from `metro2 (copy 1)/crm/server.js` running locally (defaults to `http://localhost:3000`).

## Environment Variables
Create `.env.local` if you need to point the portal at a different base URL:

```bash
PORTAL_API_BASE_URL="http://localhost:3000"
```

## Install & Run
```bash
cd apps/client-portal
npm install
npm run dev
```
The portal will start on [http://localhost:3001](http://localhost:3001) if you set `PORT=3001`, otherwise Next.js picks an available port. Visit `/portal/{consumerId}` using an ID from your CRM.

## Type Check & Lint
```bash
npm run typecheck
npm run lint
```

## Smoke Test
Ensure the backend is running, then hit the Express API directly:
```bash
curl http://localhost:3000/api/portal/{consumerId}
```
The JSON payload powers the dashboard in this app.

## Deploy Notes
- Build with `npm run build`, then `npm run start` on your platform (Render, Vercel, etc.).
- Expose `PORTAL_API_BASE_URL` as an environment variable per environment (staging, production).
- Add analytics (e.g., PostHog) by instrumenting CTA clicks in `components/PortalDashboard.tsx`.
