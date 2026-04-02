import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../common.ts';

export interface Consumer {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  status?: string;
  score?: number;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface ConsumersResponse {
  consumers?: Consumer[];
  [key: string]: unknown;
}

export function useConsumers() {
  return useQuery({
    queryKey: ['consumers'],
    queryFn: () => api<ConsumersResponse>('/api/consumers'),
    staleTime: 30_000,
  });
}

export function useConsumer(id: string | null) {
  return useQuery({
    queryKey: ['consumer', id],
    queryFn: () => api<Consumer>(`/api/consumers/${id}`),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useCreateConsumer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Consumer>) =>
      api('/api/consumers', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consumers'] }),
  });
}

export function useUpdateConsumer(id: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Consumer>) =>
      api(`/api/consumers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consumers'] });
      if (id) qc.invalidateQueries({ queryKey: ['consumer', id] });
    },
  });
}

export function useDeleteConsumer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api(`/api/consumers/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consumers'] }),
  });
}

export function useConsumerReports(consumerId: string | null) {
  return useQuery({
    queryKey: ['consumer-reports', consumerId],
    queryFn: () => api(`/api/consumers/${consumerId}/reports`),
    enabled: !!consumerId,
    staleTime: 60_000,
  });
}

export function useDashboardSummary() {
  return useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => api('/api/dashboard/summary'),
    staleTime: 60_000,
  });
}
