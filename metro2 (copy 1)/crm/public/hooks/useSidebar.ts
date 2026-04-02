import { useCallback } from 'react';
import { useAppStore } from '../store/appStore.ts';

const LS_KEY = 'evolv_sidebar_expanded';

export function useSidebar() {
  const { sidebarExpanded, setSidebarExpanded, toggleSidebar } = useAppStore();

  const setExpanded = useCallback((val: boolean) => {
    setSidebarExpanded(val);
    localStorage.setItem(LS_KEY, val ? '1' : '0');
    document.body.classList.toggle('evolv-sidebar-expanded', val);
  }, [setSidebarExpanded]);

  const toggle = useCallback(() => {
    const next = !sidebarExpanded;
    setSidebarExpanded(next);
    localStorage.setItem(LS_KEY, next ? '1' : '0');
    document.body.classList.toggle('evolv-sidebar-expanded', next);
  }, [sidebarExpanded, setSidebarExpanded]);

  return { sidebarExpanded, setExpanded, toggleSidebar: toggle };
}
