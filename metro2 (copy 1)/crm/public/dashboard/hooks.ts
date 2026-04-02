import { useQuery } from '@tanstack/react-query';
import { api } from '../common.ts';

export function useDashboardSummary() {
  return useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => api<Record<string, unknown>>('/api/dashboard/summary'),
    staleTime: 60_000,
  });
}

export function useConsumers() {
  return useQuery({
    queryKey: ['consumers'],
    queryFn: () => api<{ consumers?: unknown[] }>('/api/consumers'),
    staleTime: 60_000,
  });
}

export function useLeads() {
  return useQuery({
    queryKey: ['leads'],
    queryFn: () => api<{ leads?: unknown[] }>('/api/leads'),
    staleTime: 60_000,
  });
}

export function useCalendarEvents() {
  return useQuery({
    queryKey: ['calendar-events'],
    queryFn: () => fetch('/api/calendar/events', { cache: 'no-store' }).then(r => r.json()),
    staleTime: 60_000,
  });
}

export function useNews() {
  return useQuery({
    queryKey: ['news'],
    queryFn: () => fetch('/api/news', { cache: 'no-store' }).then(r => r.json()),
    staleTime: 5 * 60_000,
  });
}
