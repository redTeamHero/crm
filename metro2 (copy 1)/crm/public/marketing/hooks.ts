import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../common.ts';

export interface Campaign {
  id?: string;
  name?: string;
  status?: string;
  segment?: string;
  channel?: string;
  kpi?: string;
  nextTouch?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface SmsTemplate {
  id?: string;
  title?: string;
  body?: string;
  segment?: string;
  [key: string]: unknown;
}

export function useCampaigns() {
  return useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api<{ campaigns?: Campaign[] }>('/api/campaigns'),
    staleTime: 30_000,
  });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Campaign>) =>
      api('/api/campaigns', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });
}

export function useUpdateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Campaign> }) =>
      api(`/api/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });
}

export function useDeleteCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/campaigns/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });
}

export function useSmsTemplates() {
  return useQuery({
    queryKey: ['sms-templates'],
    queryFn: () => api<{ templates?: SmsTemplate[] }>('/api/sms-templates'),
    staleTime: 5 * 60_000,
  });
}
