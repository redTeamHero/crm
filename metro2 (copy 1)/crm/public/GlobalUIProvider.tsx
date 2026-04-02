import React, { useEffect, createContext, useContext } from 'react';
import { useAppStore } from './store/appStore.ts';
import { useHotkeys, type HotkeyActions } from './hooks/useHotkeys.ts';
import { useNotifications, type Notification } from './hooks/useNotifications.ts';
import { useSidebar } from './hooks/useSidebar.ts';
import { useTheme } from './hooks/useTheme.ts';

interface GlobalUIContextValue {
  sidebar: ReturnType<typeof useSidebar>;
  theme: ReturnType<typeof useTheme>;
  notifications: {
    list: Notification[];
    unread: number;
    markRead: (id: string) => void;
    markAllRead: () => void;
  };
  hotkeys: ReturnType<typeof useHotkeys>;
}

const GlobalUIContext = createContext<GlobalUIContextValue | null>(null);

export function useGlobalUI() {
  const ctx = useContext(GlobalUIContext);
  if (!ctx) throw new Error('useGlobalUI must be used within GlobalUIProvider');
  return ctx;
}

interface Props {
  children: React.ReactNode;
  hotkeyActions?: HotkeyActions;
}

export function GlobalUIProvider({ children, hotkeyActions = {} }: Props) {
  const { setNotificationCount } = useAppStore();
  const sidebar = useSidebar();
  const theme = useTheme();
  const hotkeys = useHotkeys(hotkeyActions);
  const { notifications, unread, markRead, markAllRead } = useNotifications();

  useEffect(() => {
    setNotificationCount(unread);
  }, [unread, setNotificationCount]);

  useEffect(() => {
    const saved = localStorage.getItem('evolv_sidebar_expanded');
    const shouldBeExpanded = saved === '1';
    if (shouldBeExpanded !== sidebar.sidebarExpanded) {
      sidebar.setExpanded(shouldBeExpanded);
    }
  }, []);

  useEffect(() => {
    const w = window as unknown as { __crm_hotkeys?: unknown };
    w.__crm_hotkeys = {
      defaults: hotkeys.defaults,
      get: hotkeys.getHotkeys,
      store: hotkeys.storeOverrides,
    };
  }, [hotkeys]);

  return (
    <GlobalUIContext.Provider value={{
      sidebar,
      theme,
      notifications: { list: notifications, unread, markRead, markAllRead },
      hotkeys,
    }}>
      {children}
    </GlobalUIContext.Provider>
  );
}
