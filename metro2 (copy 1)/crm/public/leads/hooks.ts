import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authHeader } from '../common.ts';

export interface Lead {
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
  status?: string;
  source?: string;
  notes?: string;
  createdAt?: string;
  [key: string]: unknown;
}

async function apiFetch(url: string, opts: RequestInit = {}) {
  const headers = { 'Content-Type': 'application/json', ...authHeader(), ...(opts.headers as Record<string, string> || {}) };
  const res = await fetch(url, { ...opts, headers });
  return res.json();
}

export function useLeads() {
  return useQuery({
    queryKey: ['leads'],
    queryFn: () => fetch('/api/leads', { cache: 'no-store' }).then(r => r.json()),
    staleTime: 30_000,
  });
}

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Lead>) => apiFetch('/api/leads', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Lead> }) =>
      apiFetch(`/api/leads/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  });
}

export function useDeleteLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fetch(`/api/leads/${id}`, { method: 'DELETE', headers: authHeader() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  });
}

export function useConvertLeadToClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (lead: Lead) =>
      apiFetch('/api/consumers', { method: 'POST', body: JSON.stringify({ name: lead.name, email: lead.email, phone: lead.phone }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['consumers'] });
    },
  });
}

export function useGenerateLeadLink() {
  return useMutation({
    mutationFn: () => fetch('/api/lead-capture/generate-link', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeader() } }).then(r => r.json()),
  });
}
