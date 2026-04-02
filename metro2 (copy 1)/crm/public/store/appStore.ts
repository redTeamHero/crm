import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AppState {
  currentConsumerId: string | null;
  sidebarExpanded: boolean;
  theme: 'dark' | 'light';
  notificationCount: number;

  setCurrentConsumerId: (id: string | null) => void;
  setSidebarExpanded: (expanded: boolean) => void;
  toggleSidebar: () => void;
  setTheme: (theme: 'dark' | 'light') => void;
  setNotificationCount: (count: number) => void;
  incrementNotifications: () => void;
  resetNotifications: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      currentConsumerId: null,
      sidebarExpanded: false,
      theme: 'dark',
      notificationCount: 0,

      setCurrentConsumerId: (id) => set({ currentConsumerId: id }),
      setSidebarExpanded: (expanded) => set({ sidebarExpanded: expanded }),
      toggleSidebar: () => set((s) => ({ sidebarExpanded: !s.sidebarExpanded })),
      setTheme: (theme) => set({ theme }),
      setNotificationCount: (count) => set({ notificationCount: count }),
      incrementNotifications: () => set((s) => ({ notificationCount: s.notificationCount + 1 })),
      resetNotifications: () => set({ notificationCount: 0 }),
    }),
    {
      name: 'evolv-app-store',
      partialize: (state) => ({
        currentConsumerId: state.currentConsumerId,
        sidebarExpanded: state.sidebarExpanded,
        theme: state.theme,
      }),
    }
  )
);
