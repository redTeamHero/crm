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
          const title = item.title;
          const link = item.link;
          return `<div><a href="${link}" target="_blank" class="text-blue-600 underline">${title}</a></div>`;
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


  if (!feedEl) return;

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
        const title = item.title;
        const link = item.link;
        return `<div><a href="${link}" target="_blank" class="text-blue-600 underline">${title}</a></div>`;
      }).join('');
    })
    .catch(err => {
      console.error('Failed to load news feed', err);
      feedEl.textContent = 'Failed to load news.';
    });
});
