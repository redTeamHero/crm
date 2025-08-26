/* public/client-portal.js */
document.addEventListener('DOMContentLoaded', () => {
  const idMatch = location.pathname.match(/portal-(.+)\.html$/);
  const consumerId = idMatch ? idMatch[1] : null;

  const dash = document.getElementById('navDashboard');
  if (dash) dash.href = location.pathname;

  const company = JSON.parse(localStorage.getItem('companyInfo') || '{}');
  if (company.name) {
    const cn = document.getElementById('companyName');
    if (cn) cn.textContent = company.name;
  }

  const teamList = document.getElementById('teamList');
  const team = JSON.parse(localStorage.getItem('teamMembers') || '[]');
  if (teamList) {
    if (!team.length) {
      teamList.textContent = 'No team members added.';
    } else {
      teamList.innerHTML = team.map(m => {
        const role = m.role ? `<div class="text-xs muted">${m.role}${m.email? ' - ' + m.email : ''}</div>` : (m.email ? `<div class="text-xs muted">${m.email}</div>` : '');
        return `<div class="news-item"><div class="font-medium">${m.name}</div>${role}</div>`;
      }).join('');
    }
  }

  const stepEl = document.getElementById('currentStep');
  if (consumerId && stepEl) {
    const steps = JSON.parse(localStorage.getItem('trackerSteps') || '[]');
    const data = JSON.parse(localStorage.getItem('trackerData') || '{}')[consumerId] || {};
    const idx = steps.findIndex(s => !data[s]);
    let current = 'Completed';
    if (idx !== -1) current = steps[idx];
    stepEl.textContent = current;
  }

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
        feedEl.innerHTML = items.slice(0,5).map(item => `
          <div class="news-item"><a href="${item.link}" target="_blank">${item.title}</a></div>
        `).join('');
      })
      .catch(err => {
        console.error('Failed to load news feed', err);
        feedEl.textContent = 'Failed to load news.';
      });
  }
});
