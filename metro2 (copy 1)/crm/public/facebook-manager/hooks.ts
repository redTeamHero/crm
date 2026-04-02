import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../common.ts';

export function useFacebookAds() {
  return useQuery({
    queryKey: ['facebook-ads'],
    queryFn: () => api('/api/facebook/ads'),
    staleTime: 60_000,
  });
}

export function useFacebookPages() {
  return useQuery({
    queryKey: ['facebook-pages'],
    queryFn: () => api('/api/facebook/pages'),
    staleTime: 5 * 60_000,
  });
}

export function useFacebookInsights(adId?: string | null) {
  return useQuery({
    queryKey: ['facebook-insights', adId],
    queryFn: () => api(`/api/facebook/ads/${adId}/insights`),
    enabled: !!adId,
    staleTime: 5 * 60_000,
  });
}

export function useCreateFacebookAd() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api('/api/facebook/ads', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['facebook-ads'] }),
  });
}

export function usePauseFacebookAd() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (adId: string) => api(`/api/facebook/ads/${adId}/pause`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['facebook-ads'] }),
  });
}
