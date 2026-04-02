import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authHeader } from '../common.ts';

async function apiFetch(url: string, opts: RequestInit = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...authHeader(), ...(opts.headers as Record<string, string> || {}) };
  const res = await fetch(url, { ...opts, headers });
  return res.json();
}

export function useAffiliateMe() {
  return useQuery({
    queryKey: ['affiliate-me'],
    queryFn: () => apiFetch('/api/affiliate/me'),
    staleTime: 60_000,
  });
}

export function useAffiliatePayouts() {
  return useQuery({
    queryKey: ['affiliate-payouts'],
    queryFn: () => apiFetch('/api/affiliate/payouts'),
    staleTime: 60_000,
  });
}

export function useCommissionRates() {
  return useQuery({
    queryKey: ['commission-rates'],
    queryFn: () => apiFetch('/api/affiliate/commission-rates'),
    staleTime: 5 * 60_000,
  });
}

export function useJoinAffiliate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch('/api/affiliate/join', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['affiliate-me'] }),
  });
}

export function useCancelPayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payoutId: string) => apiFetch(`/api/affiliate/payout/${payoutId}/cancel`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['affiliate-payouts'] }),
  });
}

export function useRequestPayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { amount: number; method: string }) => apiFetch('/api/affiliate/payout', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['affiliate-payouts'] }),
  });
}
