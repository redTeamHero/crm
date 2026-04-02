import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authHeader } from '../common.ts';

async function apiFetch(url: string, opts: RequestInit = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...authHeader(), ...(opts.headers as Record<string, string> || {}) };
  const res = await fetch(url, { ...opts, headers });
  return res.json();
}

export interface CalendarEvent {
  id?: string;
  title?: string;
  start?: string;
  end?: string;
  description?: string;
  allDay?: boolean;
  color?: string;
  type?: string;
  [key: string]: unknown;
}

export interface Booking {
  id?: string;
  clientName?: string;
  email?: string;
  phone?: string;
  date?: string;
  time?: string;
  type?: string;
  status?: string;
  notes?: string;
  [key: string]: unknown;
}

export function useCalendarEvents() {
  return useQuery({
    queryKey: ['calendar-events'],
    queryFn: () => fetch('/api/calendar/events', { cache: 'no-store' }).then(r => r.json()),
    staleTime: 30_000,
  });
}

export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CalendarEvent>) => apiFetch('/api/calendar/events', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar-events'] }),
  });
}

export function useUpdateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CalendarEvent> }) =>
      apiFetch(`/api/calendar/events/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar-events'] }),
  });
}

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fetch(`/api/calendar/events/${id}`, { method: 'DELETE', headers: authHeader() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar-events'] }),
  });
}

export function useBookings() {
  return useQuery({
    queryKey: ['bookings'],
    queryFn: () => fetch('/api/booking/bookings', { cache: 'no-store' }).then(r => r.json()),
    staleTime: 30_000,
  });
}

export function useFreeBusy() {
  return useMutation({
    mutationFn: (data: { start: string; end: string }) =>
      apiFetch('/api/calendar/freebusy', { method: 'POST', body: JSON.stringify(data) }),
  });
}
