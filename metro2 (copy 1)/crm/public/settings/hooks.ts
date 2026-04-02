import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authHeader } from '../common.ts';

async function apiFetch(url: string, opts: RequestInit = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...authHeader(), ...(opts.headers as Record<string, string> || {}) };
  const res = await fetch(url, { ...opts, headers });
  return res.json();
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => apiFetch('/api/settings'),
    staleTime: 60_000,
  });
}

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => apiFetch('/api/me'),
    staleTime: 60_000,
  });
}

export function useSystemStatus() {
  return useQuery({
    queryKey: ['system-status'],
    queryFn: () => apiFetch('/api/system-status'),
    staleTime: 60_000,
  });
}

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => apiFetch('/api/users'),
    staleTime: 60_000,
  });
}

export function useCollectorAddresses() {
  return useQuery({
    queryKey: ['collector-addresses'],
    queryFn: () => fetch('/api/settings/collector-addresses', { headers: authHeader() }).then(r => r.json()),
    staleTime: 60_000,
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiFetch('/api/settings', { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });
}

export function useAddCollectorAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/settings/collector-addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['collector-addresses'] }),
  });
}

export function useDeleteCollectorAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/settings/collector-addresses/${encodeURIComponent(id)}`, { method: 'DELETE', headers: authHeader() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['collector-addresses'] }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiFetch(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}
