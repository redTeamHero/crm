/* public/settings.js */
document.addEventListener('DOMContentLoaded', () => {
  const openaiEl = document.getElementById('openaiKey');
  const hibpEl = document.getElementById('hibpKey');
  const saveBtn = document.getElementById('saveSettings');
  const msgEl = document.getElementById('saveMsg');

  async function load() {
    try {
      const resp = await fetch('/api/settings');
      const data = await resp.json();
      if (openaiEl) openaiEl.value = data.settings?.openaiApiKey || '';
      if (hibpEl) hibpEl.value = data.settings?.hibpApiKey || '';
    } catch (e) {
      console.error('Failed to load settings', e);
    }
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const body = {
        openaiApiKey: openaiEl.value.trim(),
        hibpApiKey: hibpEl.value.trim()
      };
      try {
        await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (msgEl) {
          msgEl.classList.remove('hidden');
          setTimeout(() => msgEl.classList.add('hidden'), 2000);
        }
      } catch (e) {
        console.error('Failed to save settings', e);
      }
    });
  }

  load();
});

