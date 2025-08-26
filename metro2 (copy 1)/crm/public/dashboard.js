/* public/dashboard.js */
document.addEventListener('DOMContentLoaded', () => {
  const feedEl = document.getElementById('newsFeed');
  if (feedEl) {
    const rssUrl = 'https://hnrss.org/frontpage';
    const apiUrl = 'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(rssUrl);
    fetch(apiUrl)
      .then(r => r.json())
      .then(data => {
        const items = data.items || [];
        if (!items.length) {
          feedEl.textContent = 'No news available.';
          return;
        }
        feedEl.innerHTML = items.slice(0,5).map(item => {
          return `<div class="news-item"><a href="${item.link}" target="_blank" class="text-blue-600 underline">${item.title}</a></div>`;
        }).join('');
      })
      .catch(err => {
        console.error('Failed to load news feed', err);
        feedEl.textContent = 'Failed to load news.';
      });
  }

  const noteEl = document.getElementById('dashNote');
  const saveBtn = document.getElementById('dashSaveNote');
  if (noteEl && saveBtn) {
    noteEl.value = localStorage.getItem('dashNote') || '';
    saveBtn.addEventListener('click', () => {
      localStorage.setItem('dashNote', noteEl.value);
    });
  }

  Promise.all([
    fetch('/api/consumers').then(r => r.json()),
    fetch('/api/leads').then(r => r.json())
  ])
    .then(([cData, lData]) => {
      const consumers = cData.consumers || [];
      const leads = lData.leads || [];
      const totalSales = consumers.reduce((s,c)=> s + Number(c.sale || 0), 0);
      const totalPaid = consumers.reduce((s,c)=> s + Number(c.paid || 0), 0);
      const fmt = (n)=> `$${n.toFixed(2)}`;
      const set = (id, val)=>{ const el=document.getElementById(id); if(el) el.textContent = val; };
      set('dashLeads', leads.length);
      set('dashClients', consumers.length);
      set('dashSales', fmt(totalSales));
      set('dashPayments', fmt(totalPaid));
    })
    .catch(err=> console.error('Failed to load dashboard stats', err));
});
