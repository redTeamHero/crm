import { authHeader } from '../common.ts';

export const MAIL_RATES: Record<string, { label: string; rate: number }> = {
  regular:      { label: 'Regular',        rate: 1.00 },
  certified:    { label: 'Certified',       rate: 8.00 },
  certifiedPod: { label: 'Certified + POD', rate: 11.00 },
};

export const DISPUTE_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  awaiting:          { label: 'Awaiting',          color: '#d4a853' },
  awaiting_response: { label: 'Awaiting Response',  color: '#d4a853' },
  response_received: { label: 'Response Received',  color: '#8b5cf6' },
  removed:           { label: 'Removed',            color: '#4ade80' },
  deleted:           { label: 'Deleted',            color: '#4ade80' },
  corrected:         { label: 'Corrected',          color: '#4ade80' },
  resolved:          { label: 'Resolved',           color: '#4ade80' },
  verified:          { label: 'Verified',           color: '#60a5fa' },
  no_response:       { label: 'No Response',        color: '#6b7280' },
  stalled:           { label: 'Stalled',            color: '#f87171' },
  escalated:         { label: 'Escalated',          color: '#f87171' },
  partial:           { label: 'Partial',            color: '#fbbf24' },
};

export function buildIdempotencyKey(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function fmtPrice(n: number): string {
  return '$' + n.toFixed(2);
}

export function disputeStatusColor(status: string): string {
  return (DISPUTE_STATUS_LABELS[status] || { color: '#6b7280' }).color;
}

export function disputeStatusLabel(status: string): string {
  return (DISPUTE_STATUS_LABELS[status] || { label: status || 'Unknown' }).label;
}

export function getTokenParam(): string {
  const h = authHeader();
  return h?.Authorization
    ? `?token=${encodeURIComponent(h.Authorization.replace('Bearer ', ''))}`
    : '';
}
