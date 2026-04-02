import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, authHeader } from '../common.ts';

export interface BillingPlan {
  id?: string;
  name?: string;
  amount?: number;
  frequency?: string;
  intervalDays?: number;
  startDate?: string;
  nextBillDate?: string;
  reminderLeadDays?: number;
  notes?: string;
  active?: boolean;
  lastSentAt?: string;
  cyclesCompleted?: number;
  [key: string]: unknown;
}

export function useStripeSubscriptionStatus() {
  return useQuery({
    queryKey: ['stripe-subscription-status'],
    queryFn: async () => {
      const headers = authHeader();
      const res = await fetch('/api/stripe/subscription-status?mode=crm', { cache: 'no-store', headers });
      return res.json();
    },
    staleTime: 5 * 60_000,
  });
}

export function useStripeProducts() {
  return useQuery({
    queryKey: ['stripe-products'],
    queryFn: () => fetch('/api/stripe/products', { cache: 'no-store' }).then(r => r.json()),
    staleTime: 10 * 60_000,
  });
}

export function useBillingPlans() {
  return useQuery({
    queryKey: ['billing-plans'],
    queryFn: () => api<{ plans?: BillingPlan[] }>('/api/billing/plans'),
    staleTime: 30_000,
  });
}

export function useCreateBillingPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<BillingPlan>) =>
      api('/api/billing/plans', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['billing-plans'] }),
  });
}

export function useUpdateBillingPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<BillingPlan> }) =>
      api(`/api/billing/plans/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['billing-plans'] }),
  });
}

export function useSendPlanInvoice() {
  return useMutation({
    mutationFn: ({ planId, company }: { planId: string; company?: string }) =>
      api(`/api/billing/plans/${planId}/send`, { method: 'POST', body: JSON.stringify({ company }) }),
  });
}

export function useStripeCheckout() {
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify(data),
      }).then(r => r.json()),
  });
}

export function useStripePortal() {
  return useMutation({
    mutationFn: () =>
      fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
      }).then(r => r.json()),
  });
}
