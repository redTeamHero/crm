import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authHeader } from '../common.ts';

export interface WorkflowConfig {
  id?: string;
  name?: string;
  trigger?: string;
  actions?: unknown[];
  enabled?: boolean;
  description?: string;
  [key: string]: unknown;
}

export function useWorkflowsConfig() {
  return useQuery({
    queryKey: ['workflows-config'],
    queryFn: () => fetch('/api/workflows/config', { cache: 'no-store', credentials: 'include' }).then(r => r.json()),
    staleTime: 30_000,
  });
}

export function useUpdateWorkflowConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/workflows/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify(data),
        credentials: 'include',
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflows-config'] }),
  });
}
