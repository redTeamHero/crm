import 'server-only';
import type { PortalPayload } from './types';

const DEFAULT_BASE = process.env.PORTAL_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';

function resolveBaseUrl() {
  if (typeof window !== 'undefined') {
    return `https://${window.location.hostname.replace('-5000', '-3000')}`;
  }
  const base = (process.env.PORTAL_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000').trim();
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

  const portalSource = payload.portal as Record<string, unknown>;

  const normalizeArray = <T>(primary?: unknown, fallback?: unknown) => {
    if (Array.isArray(primary)) return primary as T[];
    if (Array.isArray(fallback)) return fallback as T[];
    return [] as T[];
  };

  const normalizeObject = <T>(primary?: unknown, fallback?: unknown) => {
    if (primary && typeof primary === 'object') return primary as T;
    if (fallback && typeof fallback === 'object') return fallback as T;
    return {} as T;
  };

  const consumer = normalizeObject<{ id?: string; name?: string }>(
    portalSource.consumer,
    portalSource.consumer_details
  );

  const tracker = normalizeObject<{ steps?: string[]; completed?: Record<string, boolean> }>(
    portalSource.tracker,
    portalSource.progress
  );

  const portalSettings = normalizeObject<{ theme?: object; modules?: object }>(
    portalSource.portalSettings,
    (portalSource as { portal_settings?: unknown }).portal_settings
  );

  const normalized: PortalPayload = {
    consumer: { id: consumer.id ?? '', name: consumer.name ?? 'Client', ...consumer },
    creditScore: (portalSource as { creditScore?: unknown; credit_score?: unknown }).creditScore ??
      (portalSource as { credit_score?: unknown }).credit_score ??
      null,
    negativeItems: normalizeArray(portalSource.negativeItems, (portalSource as { negative_items?: unknown }).negative_items),
    snapshot: normalizeObject(portalSource.snapshot, portalSource.report),
    portalSettings: {
      theme: normalizeObject((portalSettings as { theme?: unknown }).theme),
      modules: normalizeObject((portalSettings as { modules?: unknown }).modules),
      ...portalSettings,
    },
    timeline: normalizeArray(portalSource.timeline, portalSource.events),
    documents: normalizeArray(portalSource.documents, portalSource.files),
    reminders: normalizeArray(portalSource.reminders),
    tracker: {
      steps: normalizeArray(tracker.steps),
      completed: normalizeObject(tracker.completed),
      ...tracker,
    },
    invoices: normalizeArray(portalSource.invoices, portalSource.billing),
    messages: normalizeArray(portalSource.messages, portalSource.eventsMessages),
  };

  return normalized;
}
