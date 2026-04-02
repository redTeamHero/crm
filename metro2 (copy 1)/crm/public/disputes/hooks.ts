import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, authHeader } from '../common.ts';
import type {
  ConsumersApiResponse, ReportsApiResponse, DisputeData,
  LetterHistoryApiResponse, CollectorAddressLibrary, CollectorAddressesApiResponse,
  RecommendationApiResponse, PreflightApiResponse, JobStatusApiResponse,
  LettersApiResponse, CollectorEntry, SelMapEntry,
} from './types.ts';

// ─── Read queries ────────────────────────────────────────────────────────────

export function useConsumers() {
  return useQuery({
    queryKey: ['consumers'],
    queryFn: () => api<ConsumersApiResponse>('/api/consumers'),
    staleTime: 5 * 60_000,
  });
}

export function useReports(consumerId: string | null) {
  return useQuery({
    queryKey: ['reports', consumerId],
    queryFn: () => api<ReportsApiResponse>(`/api/consumers/${consumerId}/reports`),
    enabled: !!consumerId,
    staleTime: 60_000,
  });
}

export function useDisputeData(consumerId: string | null) {
  return useQuery({
    queryKey: ['disputes', consumerId],
    queryFn: () => api<DisputeData>(`/api/consumers/${consumerId}/disputes`),
    enabled: !!consumerId,
    refetchInterval: 30_000,
  });
}

export function useLetterHistory(consumerId: string | null) {
  return useQuery({
    queryKey: ['letter-history', consumerId],
    queryFn: () => api<LetterHistoryApiResponse>(`/api/consumers/${consumerId}/letter-history`),
    enabled: !!consumerId,
    staleTime: 30_000,
  });
}

export function useLetterTemplates() {
  return useQuery({
    queryKey: ['letter-templates'],
    queryFn: () => fetch('/api/sample-letters').then(r => r.json()) as Promise<{ templates: Array<{ id: string; name: string }> }>,
    staleTime: 5 * 60_000,
  });
}

export function useCollectorAddressLibrary() {
  return useQuery({
    queryKey: ['collector-address-library'],
    queryFn: async () => {
      const res = await api<CollectorAddressLibrary>('/api/settings/collector-addresses');
      const builtIn = (res.builtIn || []).map(e => ({ ...e, _src: 'built-in' as const }));
      const custom = (res.custom || []).map(e => ({ ...e, _src: 'custom' as const }));
      return [...custom, ...builtIn];
    },
    staleTime: 5 * 60_000,
  });
}

export function useConsumerCollectorAddresses(consumerId: string | null) {
  return useQuery({
    queryKey: ['consumer-collector-addresses', consumerId],
    queryFn: () => api<CollectorAddressesApiResponse>(`/api/consumers/${consumerId}/collector-addresses`),
    enabled: !!consumerId,
  });
}

// ─── Write mutations ──────────────────────────────────────────────────────────

export function useSaveCollectorAddress(consumerId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; addr1: string; addr2?: string; city?: string; state?: string; zip?: string }) =>
      api(`/api/consumers/${consumerId}/collector-addresses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consumer-collector-addresses', consumerId] }),
  });
}

export function useDeleteCollectorAddress(consumerId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api(`/api/consumers/${consumerId}/collector-addresses/${encodeURIComponent(name)}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consumer-collector-addresses', consumerId] }),
  });
}

export function useSaveDisputeCollectorAddress(consumerId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; addr1: string; addr2?: string; city?: string; state?: string; zip?: string }) =>
      api(`/api/consumers/${consumerId}/collector-addresses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consumer-collector-addresses', consumerId] });
      qc.invalidateQueries({ queryKey: ['collector-address-library'] });
    },
  });
}

export function useUpdateItemStatus(consumerId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, items }: { jobId: string; items: Array<{ creditor?: string; bureau?: string; outcome: string; itemIndex?: number; notes?: string }> }) =>
      api(`/api/consumers/${consumerId}/disputes/${encodeURIComponent(jobId)}/response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['disputes', consumerId] });
      qc.invalidateQueries({ queryKey: ['letter-history', consumerId] });
    },
  });
}

export function useUpdateRoundSettings(consumerId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, settings }: { jobId: string; settings: Record<string, unknown> }) =>
      api(`/api/consumers/${consumerId}/disputes/${encodeURIComponent(jobId)}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['disputes', consumerId] }),
  });
}

export function useSendToPortal() {
  return useMutation({
    mutationFn: (jobId: string) =>
      api(`/api/letters/${encodeURIComponent(jobId)}/portal`, { method: 'POST' }),
  });
}

export function useDeleteRound(consumerId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) =>
      api(`/api/letters/${encodeURIComponent(jobId)}?consumerId=${encodeURIComponent(consumerId!)}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['disputes', consumerId] }),
  });
}

export function useGetRecommendation(consumerId: string | null) {
  return useMutation({
    mutationFn: (jobId: string) =>
      api<RecommendationApiResponse>(`/api/consumers/${consumerId}/disputes/${encodeURIComponent(jobId)}/recommendation`),
  });
}

export function useCheckPreflight() {
  return useMutation({
    mutationFn: (data: { consumerId: string; collectors: CollectorEntry[] }) =>
      api<PreflightApiResponse>('/api/generate/preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
  });
}

export function useGenerateLetters() {
  return useMutation({
    mutationFn: async (data: {
      consumerId: string;
      reportId: string | null;
      selections: SelMapEntry[];
      collectors: CollectorEntry[];
      itemsPerLetter: number;
      idempotencyKey: string;
    }) => {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-idempotency-key': data.idempotencyKey,
          ...authHeader(),
        },
        body: JSON.stringify({
          consumerId: data.consumerId,
          reportId: data.reportId,
          selections: data.selections,
          personalInfo: false,
          collectors: data.collectors,
          itemsPerLetter: data.itemsPerLetter,
        }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Generation failed: HTTP ${res.status} ${txt}`.trim());
      }
      const json = await res.json().catch(() => ({}) as Record<string, unknown>);
      if (!json?.ok || !json?.jobId) throw new Error((json?.error as string | undefined) || 'Server did not return a job ID.');
      return json as { ok: true; jobId: string };
    },
  });
}

export function usePollJobStatus() {
  return useMutation({
    mutationFn: async (jobId: string): Promise<JobStatusApiResponse> => {
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 1500));
        const statusResp = await api<JobStatusApiResponse>(`/api/jobs/${encodeURIComponent(jobId)}`);
        const jobStatus = statusResp.job?.status || statusResp.status;
        if (jobStatus === 'completed' || jobStatus === 'done') return statusResp;
        if (jobStatus === 'failed') {
          throw new Error(statusResp.job?.error || statusResp.error || 'Letter generation job failed.');
        }
      }
      throw new Error('Letter generation timed out.');
    },
  });
}

export function useGetGeneratedLetters() {
  return useMutation({
    mutationFn: (jobId: string) => api<LettersApiResponse>(`/api/letters/${encodeURIComponent(jobId)}`),
  });
}

export function useDownloadLetterZip() {
  return useMutation({
    mutationFn: async ({ jobId, type, indices }: { jobId: string; type: 'all' | 'selected' | 'grouped'; indices?: number[] }) => {
      const isPost = type !== 'all';
      const url = type === 'all'
        ? `/api/letters/${encodeURIComponent(jobId)}/all.zip`
        : type === 'selected'
          ? `/api/letters/${encodeURIComponent(jobId)}/selected.zip`
          : `/api/letters/${encodeURIComponent(jobId)}/grouped.zip`;

      const res = await fetch(url, {
        method: isPost ? 'POST' : 'GET',
        headers: {
          ...authHeader(),
          ...(isPost ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(isPost && indices ? { body: JSON.stringify({ indices }) } : {}),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const filename =
        type === 'selected' ? 'selected_letters.zip' :
        type === 'grouped' ? 'grouped_letters.zip' :
        'letters_round.zip';
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    },
  });
}
