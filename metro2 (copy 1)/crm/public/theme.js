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

  // Sync dark/light mode across tabs
  window.addEventListener('storage', (event) => {
    if (event.key === 'theme') {
      applyTheme(event.newValue || 'purple');
    }
    if (event.key === 'evolv-theme') {
      const darkLink = document.getElementById('dark-theme-css');
      const lightLink = document.getElementById('light-theme-css');
      const isDark = event.newValue === 'dark';
      if (darkLink) darkLink.disabled = !isDark;
      if (lightLink) lightLink.disabled = isDark;
    }
  });

  // Runtime dark-inline-style scrubber for light mode.
  // Only targets background/backgroundColor inline style properties so
  // intentional dark text colours on gold buttons (color:#0a0a0a) are untouched.
  const DARK_BG_REGEX = /\b(background(?:-color)?)\s*:\s*(#1a1b2e|#18191a|#1a1a1e|#1a1a1a|#111113|#111111|#0a0a0a|#0f0f0f|rgba\(\s*30\s*,\s*30\s*,\s*34\s*,[^)]+\)|rgba\(\s*15\s*,\s*15\s*,\s*20\s*,[^)]+\))/gi;
  const DARK_BG_LIGHT = { '#1a1b2e': '#ffffff', '#18191a': '#f8fafc', '#1a1a1e': '#f8fafc', '#1a1a1a': '#f1f5f9', '#111113': '#f8fafc', '#111111': '#f8fafc', '#0a0a0a': '#ffffff', '#0f0f0f': '#ffffff' };

  // Dark text colours that would be invisible on white backgrounds
  const DARK_TEXT_REGEX = /\bcolor\s*:\s*(#e5e7eb|#e4e6eb|#b0b3b8|#cccccc|#d1d5db)\b/gi;
  const DARK_TEXT_LIGHT = { '#e5e7eb': '#111827', '#e4e6eb': '#111827', '#b0b3b8': '#6b7280', '#cccccc': '#374151', '#d1d5db': '#374151' };

  function scrubDarkInlineStyles(root) {
    if (localStorage.getItem('evolv-theme') === 'dark') return;
    (root || document).querySelectorAll('[style]').forEach(el => {
      const raw = el.getAttribute('style');
      if (!raw) return;
      let out = raw
        .replace(DARK_BG_REGEX, (_, prop, val) => {
          const key = val.toLowerCase().replace(/\s/g, '');
          return prop + ':' + (DARK_BG_LIGHT[key] || '#f8fafc');
        })
        .replace(DARK_TEXT_REGEX, (_, val) => {
          return 'color:' + (DARK_TEXT_LIGHT[val.toLowerCase()] || '#374151');
        });
      if (out !== raw) el.setAttribute('style', out);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    doc.style.visibility = '';
    scrubDarkInlineStyles(document);

    // Re-run after sidebar renders (sidebar.js calls renderSidebar())
    const sidebarEl = document.getElementById('evolv-sidebar') || document.querySelector('.evolv-sidebar');
    if (sidebarEl) {
      new MutationObserver(() => scrubDarkInlineStyles(sidebarEl))
        .observe(sidebarEl, { childList: true, subtree: true });
    }

    // Re-run when JS dynamically injects content into the page body
    new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType === 1) scrubDarkInlineStyles(node);
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
})();
