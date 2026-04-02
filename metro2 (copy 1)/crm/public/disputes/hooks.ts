import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../common.ts';
import type {
  ConsumersApiResponse, ReportsApiResponse, DisputeData,
  LetterHistoryApiResponse, CollectorAddressLibrary, CollectorAddressesApiResponse,
} from './types.ts';

export function useConsumers() {
  return useQuery({
    queryKey: ['consumers'],
    queryFn: () => api<ConsumersApiResponse>('/api/consumers'),
    staleTime: 5 * 60_000,
  });
}

export function useReports(consumerId: string | null) {
  return useQuery({
    queryKey: ['reports', consumerId],
    queryFn: () => api<ReportsApiResponse>(`/api/consumers/${consumerId}/reports`),
    enabled: !!consumerId,
    staleTime: 60_000,
  });
}

export function useDisputeData(consumerId: string | null) {
  return useQuery({
    queryKey: ['disputes', consumerId],
    queryFn: () => api<DisputeData>(`/api/consumers/${consumerId}/disputes`),
    enabled: !!consumerId,
    refetchInterval: 30_000,
  });
}

export function useLetterHistory(consumerId: string | null) {
  return useQuery({
    queryKey: ['letter-history', consumerId],
    queryFn: () => api<LetterHistoryApiResponse>(`/api/consumers/${consumerId}/letter-history`),
    enabled: !!consumerId,
    staleTime: 30_000,
  });
}

export function useLetterTemplates() {
  return useQuery({
    queryKey: ['letter-templates'],
    queryFn: () => fetch('/api/sample-letters').then(r => r.json()),
    staleTime: 5 * 60_000,
  });
}

export function useCollectorAddressLibrary() {
  return useQuery({
    queryKey: ['collector-address-library'],
    queryFn: async () => {
      const res = await api<CollectorAddressLibrary>('/api/settings/collector-addresses');
      const builtIn = (res.builtIn || []).map(e => ({ ...e, _src: 'built-in' }));
      const custom = (res.custom || []).map(e => ({ ...e, _src: 'custom' }));
      return [...custom, ...builtIn];
    },
    staleTime: 5 * 60_000,
  });
}

export function useConsumerCollectorAddresses(consumerId: string | null) {
  return useQuery({
    queryKey: ['consumer-collector-addresses', consumerId],
    queryFn: () => api<CollectorAddressesApiResponse>(`/api/consumers/${consumerId}/collector-addresses`),
    enabled: !!consumerId,
  });
}

export function useSaveCollectorAddress(consumerId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; addr1: string; addr2?: string; city?: string; state?: string; zip?: string }) =>
      api(`/api/consumers/${consumerId}/collector-addresses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consumer-collector-addresses', consumerId] }),
  });
}

export function useDeleteCollectorAddress(consumerId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api(`/api/consumers/${consumerId}/collector-addresses/${encodeURIComponent(name)}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consumer-collector-addresses', consumerId] }),
  });
}

export function useUpdateItemStatus(consumerId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, items }: { jobId: string; items: Array<{ creditor?: string; bureau?: string; outcome: string; itemIndex?: number; notes?: string }> }) =>
      api(`/api/consumers/${consumerId}/disputes/${encodeURIComponent(jobId)}/response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['disputes', consumerId] });
      qc.invalidateQueries({ queryKey: ['letter-history', consumerId] });
    },
  });
}

export function useUpdateRoundSettings(consumerId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, settings }: { jobId: string; settings: Record<string, unknown> }) =>
      api(`/api/consumers/${consumerId}/disputes/${encodeURIComponent(jobId)}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['disputes', consumerId] }),
  });
}

export function useSendToPortal() {
  return useMutation({
    mutationFn: (jobId: string) =>
      api(`/api/letters/${encodeURIComponent(jobId)}/portal`, { method: 'POST' }),
  });
}

export function useDeleteRound(consumerId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) =>
      api(`/api/letters/${encodeURIComponent(jobId)}?consumerId=${encodeURIComponent(consumerId!)}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['disputes', consumerId] }),
  });
}
