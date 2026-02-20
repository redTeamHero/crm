(() => {
  const doc = document.documentElement;
  const isClientPortal = typeof window !== 'undefined'
    && /^\/portal(\/|$)/.test(window.location?.pathname || '');

  if (isClientPortal) {
    doc.style.visibility = '';
    return;
  }

  doc.style.visibility = 'hidden';

  const THEMES = {
    purple: { accent: '#AF52DE', hover: '#9333EA', glassBg: 'rgba(255,255,255,0.4)', glassBrd: 'rgba(255,255,255,0.25)' },
    blue: { accent: '#007AFF', hover: '#005BB5', glassBg: 'rgba(255,255,255,0.4)', glassBrd: 'rgba(255,255,255,0.25)' },
    green: { accent: '#34C759', hover: '#248A3D', glassBg: 'rgba(255,255,255,0.4)', glassBrd: 'rgba(255,255,255,0.25)' },
    amber: { accent: '#F59E0B', hover: '#D97706', glassBg: 'rgba(255,255,255,0.42)', glassBrd: 'rgba(255,255,255,0.28)' },
    slate: { accent: '#334155', hover: '#1E293B', glassBg: 'rgba(255,255,255,0.5)', glassBrd: 'rgba(148,163,184,0.35)' }
  };

  const hexToRgba = (hex, alpha = 1) => {
    if (!hex) return `rgba(15, 98, 254, ${alpha})`;
    const normalized = hex.replace('#', '');
    const chunk = normalized.length === 3
      ? normalized.split('').map(ch => ch + ch)
      : normalized.match(/.{2}/g);
    if (!chunk) return `rgba(15, 98, 254, ${alpha})`;
    const [r, g, b] = chunk.map(val => parseInt(val, 16));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const applyTheme = (name) => {
    const theme = THEMES[name] || THEMES.purple;
    const accent = theme.accent;
    doc.style.setProperty('--accent', accent);
    doc.style.setProperty('--accent-hover', theme.hover || accent);
    doc.style.setProperty('--accent-solid', accent);
    doc.style.setProperty('--accent-bg', hexToRgba(accent, 0.14));
    doc.style.setProperty('--accent-soft', hexToRgba(accent, 0.18));
    doc.style.setProperty('--glass-bg', theme.glassBg || 'rgba(255,255,255,0.42)');
    doc.style.setProperty('--glass-brd', theme.glassBrd || 'rgba(148,163,184,0.28)');
    doc.style.setProperty('--btn-text', '#fff');
  };

  applyTheme(localStorage.getItem('theme') || 'purple');

  window.addEventListener('storage', (event) => {
    if (event.key === 'theme') {
      applyTheme(event.newValue || 'purple');
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    doc.style.visibility = '';
  });
})();
