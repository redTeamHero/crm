import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authHeader } from '../common.ts';

async function apiFetch(url: string, opts: RequestInit = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...authHeader(), ...(opts.headers as Record<string, string> || {}) };
  const res = await fetch(url, { ...opts, headers });
  return res.json();
}

export function useAdminAffiliates() {
  return useQuery({
    queryKey: ['admin-affiliates'],
    queryFn: () => apiFetch('/api/admin/affiliates'),
    staleTime: 30_000,
  });
}

export function useCommissionRates() {
  return useQuery({
    queryKey: ['commission-rates'],
    queryFn: () => apiFetch('/api/affiliate/commission-rates'),
    staleTime: 5 * 60_000,
  });
}

export function useUpdateCommissionRates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, number>) => apiFetch('/api/affiliate/commission-rates', { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commission-rates'] }),
  });
}

export function useUpdateAffiliateStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiFetch(`/api/admin/affiliates/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-affiliates'] }),
  });
}
