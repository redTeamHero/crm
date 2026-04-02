import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authHeader } from '../common.ts';

const API = '/api';

async function apiFetch(method: string, url: string, body?: unknown) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...authHeader() };
  const opts: RequestInit = { method, headers };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  return res.json();
}

export interface SmsGroup {
  id?: string;
  name?: string;
  status?: string;
  description?: string;
  memberCount?: number;
  [key: string]: unknown;
}

export interface SmsTemplate {
  id?: string;
  title?: string;
  body?: string;
  segment?: string;
  [key: string]: unknown;
}

export interface SmsCampaign {
  id?: string;
  name?: string;
  status?: string;
  segment?: string;
  groupId?: string;
  templateId?: string;
  scheduledAt?: string;
  [key: string]: unknown;
}

export function useSmsGroups() {
  return useQuery({
    queryKey: ['sms-groups'],
    queryFn: () => apiFetch('GET', `${API}/groups`),
    staleTime: 30_000,
  });
}

export function useSmsGroupMembers(groupId: string | null) {
  return useQuery({
    queryKey: ['sms-group-members', groupId],
    queryFn: () => apiFetch('GET', `${API}/groups/${groupId}/members`),
    enabled: !!groupId,
    staleTime: 30_000,
  });
}

export function useCreateSmsGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<SmsGroup>) => apiFetch('POST', `${API}/groups`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sms-groups'] }),
  });
}

export function useUpdateSmsGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<SmsGroup> }) => apiFetch('PATCH', `${API}/groups/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sms-groups'] }),
  });
}

export function useDeleteSmsGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch('DELETE', `${API}/groups/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sms-groups'] }),
  });
}

export function useAddGroupMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, clientId }: { groupId: string; clientId: string }) =>
      apiFetch('POST', `${API}/groups/${groupId}/members`, { clientId }),
    onSuccess: (_data, { groupId }) => qc.invalidateQueries({ queryKey: ['sms-group-members', groupId] }),
  });
}

export function useRemoveGroupMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, clientId }: { groupId: string; clientId: string }) =>
      apiFetch('DELETE', `${API}/groups/${groupId}/members/${clientId}`),
    onSuccess: (_data, { groupId }) => qc.invalidateQueries({ queryKey: ['sms-group-members', groupId] }),
  });
}

export function useSmsTemplates() {
  return useQuery({
    queryKey: ['sms-templates'],
    queryFn: () => apiFetch('GET', `${API}/sms-templates`),
    staleTime: 5 * 60_000,
  });
}

export function useCreateSmsTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<SmsTemplate>) => apiFetch('POST', `${API}/sms-templates`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sms-templates'] }),
  });
}

export function useUpdateSmsTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<SmsTemplate> }) =>
      apiFetch('PATCH', `${API}/sms-templates/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sms-templates'] }),
  });
}

export function useDeleteSmsTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch('DELETE', `${API}/sms-templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sms-templates'] }),
  });
}

export function useSmsCampaigns() {
  return useQuery({
    queryKey: ['sms-campaigns'],
    queryFn: () => apiFetch('GET', `${API}/campaigns`),
    staleTime: 30_000,
  });
}

export function useCreateSmsCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<SmsCampaign>) => apiFetch('POST', `${API}/campaigns`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sms-campaigns'] }),
  });
}

export function useUpdateSmsCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<SmsCampaign> }) =>
      apiFetch('PATCH', `${API}/campaigns/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sms-campaigns'] }),
  });
}

export function useDeleteSmsCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch('DELETE', `${API}/campaigns/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sms-campaigns'] }),
  });
}

export function useSendSms() {
  return useMutation({
    mutationFn: (data: { to?: string; body: string; groupId?: string; recipientType?: string }) =>
      apiFetch('POST', `${API}/sms/send`, data),
  });
}

export function useSmsHistory() {
  return useQuery({
    queryKey: ['sms-history'],
    queryFn: () => apiFetch('GET', `${API}/history?channel=sms&limit=100`),
    staleTime: 30_000,
  });
}
