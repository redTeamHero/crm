import { useCallback } from 'react';
import { useAppStore } from '../store/appStore.ts';

const THEMES = {
  purple: { accent: '#AF52DE', hover: '#9333EA', glassBg: 'rgba(255,255,255,0.4)', glassBrd: 'rgba(255,255,255,0.25)' },
  blue: { accent: '#007AFF', hover: '#005BB5', glassBg: 'rgba(255,255,255,0.4)', glassBrd: 'rgba(255,255,255,0.25)' },
  green: { accent: '#34C759', hover: '#248A3D', glassBg: 'rgba(255,255,255,0.4)', glassBrd: 'rgba(255,255,255,0.25)' },
  amber: { accent: '#F59E0B', hover: '#D97706', glassBg: 'rgba(255,255,255,0.42)', glassBrd: 'rgba(255,255,255,0.28)' },
  slate: { accent: '#334155', hover: '#1E293B', glassBg: 'rgba(255,255,255,0.5)', glassBrd: 'rgba(148,163,184,0.35)' },
} as const;

type ThemeName = keyof typeof THEMES;
type DarkLight = 'dark' | 'light';

function hexToRgba(hex: string, alpha = 1): string {
  const normalized = hex.replace('#', '');
  const chunk = normalized.length === 3
    ? normalized.split('').map(ch => ch + ch)
    : normalized.match(/.{2}/g);
  if (!chunk) return `rgba(15,98,254,${alpha})`;
  const [r, g, b] = chunk.map(val => parseInt(val, 16));
  return `rgba(${r},${g},${b},${alpha})`;
}

function applyAccentTheme(name: string): void {
  const doc = document.documentElement;
  const theme = THEMES[name as ThemeName] || THEMES.purple;
  const accent = theme.accent;
  doc.style.setProperty('--accent', accent);
  doc.style.setProperty('--accent-hover', theme.hover || accent);
  doc.style.setProperty('--accent-solid', accent);
  doc.style.setProperty('--accent-bg', hexToRgba(accent, 0.14));
  doc.style.setProperty('--accent-soft', hexToRgba(accent, 0.18));
  doc.style.setProperty('--glass-bg', theme.glassBg || 'rgba(255,255,255,0.42)');
  doc.style.setProperty('--glass-brd', theme.glassBrd || 'rgba(148,163,184,0.28)');
  doc.style.setProperty('--btn-text', '#fff');
}

function applyDarkLight(mode: DarkLight): void {
  const darkLink = document.getElementById('dark-theme-css') as HTMLLinkElement | null;
  const lightLink = document.getElementById('light-theme-css') as HTMLLinkElement | null;
  const isDark = mode === 'dark';
  localStorage.setItem('evolv-theme', mode);
  if (darkLink) darkLink.disabled = !isDark;
  if (lightLink) lightLink.disabled = isDark;
}

export function useTheme() {
  const { theme, setTheme } = useAppStore();
  const darkLight = (localStorage.getItem('evolv-theme') || 'light') as DarkLight;

  const setAccentTheme = useCallback((name: string) => {
    setTheme(name as 'dark' | 'light');
    localStorage.setItem('theme', name);
    applyAccentTheme(name);
  }, [setTheme]);

  const toggleDarkLight = useCallback(() => {
    const current = localStorage.getItem('evolv-theme');
    const next: DarkLight = current === 'dark' ? 'light' : 'dark';
    applyDarkLight(next);
    setTheme(next);
    if (next === 'dark') {
      (window as unknown as { _evolvRestoreDark?: (doc: Document) => void })._evolvRestoreDark?.(document);
    } else {
      (window as unknown as { _evolvScrub?: (doc: Document) => void })._evolvScrub?.(document);
    }
  }, [setTheme]);

  return { theme, darkLight, setAccentTheme, toggleDarkLight, applyAccentTheme, applyDarkLight };
}

export { applyAccentTheme, applyDarkLight };
