import { useState, useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '../store/appStore.ts';
import { authHeader } from '../common.ts';

export interface Notification {
  id: string;
  message: string;
  read: boolean;
  eventType?: string;
  eventLabel?: string;
  consumerId?: string;
  consumerName?: string;
  at?: string;
}

export function useNotifications() {
  const { setNotificationCount, resetNotifications } = useAppStore();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch_ = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await fetch('/api/notifications?limit=50', { headers: authHeader() as Record<string, string> });
      if (!res.ok) return;
      const data = await res.json();
      if (!data?.ok) return;
      setNotifications(data.notifications || []);
      const count = data.unreadCount || 0;
      setUnread(count);
      setNotificationCount(count);
    } catch { /* ignore */ }
  }, [setNotificationCount]);

  const markRead = useCallback(async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    setUnread(prev => { const next = Math.max(0, prev - 1); setNotificationCount(next); return next; });
    await fetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(authHeader() as Record<string, string>) },
      body: JSON.stringify({ id }),
      keepalive: true,
    }).catch(() => {});
  }, [setNotificationCount]);

  const markAllRead = useCallback(async () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnread(0);
    resetNotifications();
    await fetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(authHeader() as Record<string, string>) },
      body: JSON.stringify({ all: true }),
      keepalive: true,
    }).catch(() => {});
    fetch_();
  }, [resetNotifications, fetch_]);

  useEffect(() => {
    fetch_();
    timerRef.current = setInterval(fetch_, 60_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetch_]);

  return { notifications, unread, refetch: fetch_, markRead, markAllRead };
}
