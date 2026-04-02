import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, authHeader } from '../common.ts';

export interface Template {
  id?: string;
  name?: string;
  content?: string;
  type?: string;
  category?: string;
  description?: string;
  [key: string]: unknown;
}

export interface Contract {
  id?: string;
  name?: string;
  content?: string;
  type?: string;
  [key: string]: unknown;
}

export interface Sequence {
  id?: string;
  name?: string;
  steps?: unknown[];
  [key: string]: unknown;
}

export function useTemplates() {
  return useQuery({
    queryKey: ['templates'],
    queryFn: () => fetch('/api/templates').then(r => r.json()),
    staleTime: 5 * 60_000,
  });
}

export function useDefaultTemplates() {
  return useQuery({
    queryKey: ['default-templates'],
    queryFn: () => fetch('/api/templates/defaults').then(r => r.json()),
    staleTime: 10 * 60_000,
  });
}

export function useSampleLetters() {
  return useQuery({
    queryKey: ['sample-letters'],
    queryFn: () => fetch('/api/sample-letters').then(r => r.json()),
    staleTime: 10 * 60_000,
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Template>) =>
      fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });
}

export function useContracts() {
  return useQuery({
    queryKey: ['contracts'],
    queryFn: () => api<{ contracts?: Contract[] }>('/api/contracts'),
    staleTime: 5 * 60_000,
  });
}

export function useDeleteContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fetch(`/api/contracts/${encodeURIComponent(id)}`, { method: 'DELETE', headers: authHeader() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contracts'] }),
  });
}

export function useSequences() {
  return useQuery({
    queryKey: ['sequences'],
    queryFn: () => fetch('/api/sequences').then(r => r.json()),
    staleTime: 5 * 60_000,
  });
}

export function useDeleteSequence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fetch(`/api/sequences/${encodeURIComponent(id)}`, { method: 'DELETE', headers: authHeader() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sequences'] }),
  });
}

export function useConsumers() {
  return useQuery({
    queryKey: ['consumers'],
    queryFn: () => api<{ consumers?: unknown[] }>('/api/consumers'),
    staleTime: 60_000,
  });
}
