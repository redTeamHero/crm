import 'server-only';
import type { PortalPayload } from './types';

const DEFAULT_BASE = process.env.PORTAL_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';

function resolveBaseUrl() {
  const base = (process.env.PORTAL_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_BASE).trim();
  return base.replace(/\/$/, '');
}

export async function getPortalData(consumerId: string): Promise<PortalPayload | null> {
  if (!consumerId) return null;
  const baseUrl = resolveBaseUrl();
  const endpoint = `${baseUrl}/api/portal/${encodeURIComponent(consumerId)}`;
  const res = await fetch(endpoint, { cache: 'no-store' });
  if (!res.ok) {
    return null;
  }
  const payload = await res.json().catch(() => null);
  if (!payload?.ok || !payload.portal) {
    return null;
  }
  return payload.portal as PortalPayload;
}
