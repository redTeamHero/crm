# Client Portal Activation Guide

This guide covers how to enable client portals using the legacy static portal templates served by the Express backend.

## Prerequisites
- The Express CRM backend must be running from `metro2 (copy 1)/crm/server.js`.
- The portal payload is served by the backend at `/api/portal/:consumerId`.
- The legacy static portal template is served by the backend at `/portal/:id` and `/client-portal`.

## Step 1: Configure portal settings in the CRM
1. Open the CRM UI.
2. Go to **Settings → Client Portal** (`/settings/client-portal`).
3. Set the portal theme and module toggles for the tenant.
4. Save the settings so they persist to the tenant’s `clientPortal` settings record.

> The backend injects `portalSettings` into the portal payload so the legacy portal can apply the same theme and module configuration.

## Step 2: Activate a portal link for a consumer
1. Create or locate a consumer in the CRM database.
2. Use the consumer ID to construct a portal URL:
   - Legacy static portal: `http://localhost:3000/portal/{consumerId}`

## Step 3: Run the legacy static portal (backend only)
The Express server serves the legacy portal template and injects portal data into the HTML response.

```bash
cd "metro2 (copy 1)/crm"
npm install
npm start
```

Then open:
- `http://localhost:3000/portal/{consumerId}`

## Troubleshooting
- If `/portal/{consumerId}` returns “Portal not found”, confirm the consumer exists in the CRM DB.
- If the portal loads without data, confirm the backend is reachable and that `/api/portal/{consumerId}` returns JSON.
