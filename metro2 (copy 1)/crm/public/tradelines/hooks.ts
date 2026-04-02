import { useQuery } from '@tanstack/react-query';
import { authHeader } from '../common.ts';

export function useTradelines(consumerId?: string | null) {
  const url = consumerId ? `/api/tradelines?consumerId=${encodeURIComponent(consumerId)}` : '/api/tradelines';
  return useQuery({
    queryKey: ['tradelines', consumerId ?? 'all'],
    queryFn: () => fetch(url, { cache: 'no-store', headers: authHeader() }).then(r => r.json()),
    staleTime: 30_000,
  });
}

export function useTradelinesProviders() {
  return useQuery({
    queryKey: ['tradelines-providers'],
    queryFn: () => fetch('/api/tradelines/providers', { cache: 'no-store', headers: authHeader() }).then(r => r.json()),
    staleTime: 10 * 60_000,
  });
}
