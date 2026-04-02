import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, authHeader } from '../common.ts';

export function useConsumers() {
  return useQuery({
    queryKey: ['consumers'],
    queryFn: () => api<{ consumers?: unknown[] }>('/api/consumers?limit=200'),
    staleTime: 5 * 60_000,
  });
}

export function useNegativeItems(consumerId: string | null) {
  return useQuery({
    queryKey: ['negative-items', consumerId],
    queryFn: () => api(`/api/consumers/${consumerId}/negative-items`),
    enabled: !!consumerId,
    staleTime: 60_000,
  });
}

export function useCfpbComplaints(consumerId: string | null) {
  return useQuery({
    queryKey: ['cfpb-complaints', consumerId],
    queryFn: () => api(`/api/consumers/${consumerId}/cfpb-complaints`),
    enabled: !!consumerId,
    staleTime: 30_000,
  });
}

export function useSubmitCfpbComplaint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ consumerId, data }: { consumerId: string; data: Record<string, unknown> }) =>
      fetch(`/api/consumers/${consumerId}/cfpb-complaint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: (_data, { consumerId }) => qc.invalidateQueries({ queryKey: ['cfpb-complaints', consumerId] }),
  });
}

export function useUploadCfpbProof() {
  return useMutation({
    mutationFn: ({ consumerId, formData }: { consumerId: string; formData: FormData }) =>
      fetch(`/api/consumers/${consumerId}/cfpb-proof`, {
        method: 'POST',
        headers: authHeader(),
        body: formData,
      }).then(r => r.json()),
  });
}
