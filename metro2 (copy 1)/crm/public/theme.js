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
    gold:     { accent: '#d4a853', hover: '#c4973e', rgb: '212,168,83',  label: 'Gold' },
    rose:     { accent: '#e8678a', hover: '#d4536f', rgb: '232,103,138', label: 'Rose' },
    sapphire: { accent: '#5b8def', hover: '#4a73d4', rgb: '91,141,239',  label: 'Sapphire' },
    emerald:  { accent: '#4eca7a', hover: '#3db568', rgb: '78,202,122',  label: 'Emerald' },
    amethyst: { accent: '#9d6dd7', hover: '#8a58c4', rgb: '157,109,215', label: 'Amethyst' },
    ruby:     { accent: '#e0525e', hover: '#cc3f4b', rgb: '224,82,94',   label: 'Ruby' },
    ice:      { accent: '#5ec4d4', hover: '#49b0c0', rgb: '94,196,212',  label: 'Ice' }
  };

  window.__EVOLV_THEMES = THEMES;

  const applyTheme = (name) => {
    const theme = THEMES[name] || THEMES.gold;
    const accent = theme.accent;
    const rgb = theme.rgb;
    doc.style.setProperty('--accent', accent);
    doc.style.setProperty('--accent-hover', theme.hover);
    doc.style.setProperty('--accent-rgb', rgb);
    doc.style.setProperty('--accent-bg', 'rgba(' + rgb + ', 0.12)');
    doc.style.setProperty('--accent-soft', 'rgba(' + rgb + ', 0.2)');
    doc.style.setProperty('--border-soft', 'rgba(' + rgb + ', 0.14)');
    doc.style.setProperty('--border-strong', 'rgba(' + rgb + ', 0.24)');
    doc.style.setProperty('--badge-text', accent);
    doc.style.setProperty('--bg-accent', 'rgba(' + rgb + ', 0.15)');
    doc.style.setProperty('--shadow-soft', '0 18px 40px rgba(' + rgb + ', 0.1)');
    doc.style.setProperty('--green', accent);
    doc.style.setProperty('--green-bg', theme.hover);
    doc.style.setProperty('--btn-text', '#0a0a0a');
    doc.dataset.theme = name;
    window.dispatchEvent(new CustomEvent('themechange', { detail: { name, theme } }));
  };

  const getTheme = () => localStorage.getItem('theme') || 'gold';
  applyTheme(getTheme());

  window.evolvSetTheme = (name) => {
    localStorage.setItem('theme', name);
    applyTheme(name);
  };

  window.addEventListener('storage', (event) => {
    if (event.key === 'theme') {
      applyTheme(event.newValue || 'gold');
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    doc.style.visibility = '';
  });
})();
