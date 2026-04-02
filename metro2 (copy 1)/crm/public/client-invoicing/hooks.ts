import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../common.ts';

export interface Invoice {
  id?: string;
  consumerId?: string;
  desc?: string;
  amount?: number;
  due?: string;
  paid?: boolean;
  company?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface BillingPlan {
  id?: string;
  name?: string;
  amount?: number;
  frequency?: string;
  active?: boolean;
  nextBillDate?: string;
  [key: string]: unknown;
}

export function useConsumers() {
  return useQuery({
    queryKey: ['consumers'],
    queryFn: () => api<{ consumers?: unknown[] }>('/api/consumers'),
    staleTime: 60_000,
  });
}

export function useInvoices(consumerId: string | null) {
  return useQuery({
    queryKey: ['invoices', consumerId],
    queryFn: () => api<{ invoices?: Invoice[] }>(`/api/invoices/${consumerId}`),
    enabled: !!consumerId,
    staleTime: 30_000,
  });
}

export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Invoice>) =>
      api('/api/invoices', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  });
}

export function useMarkInvoicePaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api(`/api/invoices/${id}`, { method: 'PUT', body: JSON.stringify({ paid: true }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  });
}

export function useBillingPlan(planId: string | null) {
  return useQuery({
    queryKey: ['billing-plan', planId],
    queryFn: () => api<BillingPlan>(`/api/billing/plans/${planId}`),
    enabled: !!planId,
    staleTime: 60_000,
  });
}

export function useSendPlanInvoice() {
  return useMutation({
    mutationFn: ({ planId, company }: { planId: string; company?: string }) =>
      api(`/api/billing/plans/${planId}/send`, { method: 'POST', body: JSON.stringify({ company }) }),
  });
}
