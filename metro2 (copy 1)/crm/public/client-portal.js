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

  const scoreVal = document.getElementById('scoreValue');
  const scoreBar = document.getElementById('scoreBar');
  if (scoreVal && scoreBar) {
    const score = JSON.parse(localStorage.getItem('creditScore') || '{"start":0,"current":0}');
    scoreVal.textContent = score.current + (score.start ? ` (start ${score.start})` : '');
    const pct = score.start ? Math.min(1, Math.max(0, (score.current - score.start) / (850 - score.start))) * 100 : 0;
    scoreBar.style.width = pct + '%';
    if (score.current > score.start) {
      const ms = document.getElementById('milestones');
      if (ms) ms.innerHTML = `<div class="news-item">🎉 Score increased by ${score.current - score.start} points!</div>`;
    }
  }

  const timelineEl = document.getElementById('timeline');
  if (timelineEl) {
    const timeline = JSON.parse(localStorage.getItem('disputeTimeline') || '[]');
    if (!timeline.length) {
      timelineEl.textContent = 'No disputes yet.';
    } else {
      timelineEl.innerHTML = timeline.map(t => `<div class="timeline-item"><span class="font-medium">${t.account}</span> - ${t.stage}</div>`).join('');
    }
  }

  const snapEl = document.getElementById('reportSnapshot');
  if (snapEl) {
    const snap = JSON.parse(localStorage.getItem('creditSnapshot') || '{}');
    const deleted = (snap.deleted || []).map(a => `<div class="text-green-600">✅ ${a}</div>`).join('');
    const disputing = (snap.disputing || []).map(a => `<div class="text-yellow-600">⚠️ ${a}</div>`).join('');
    const negative = (snap.negative || []).map(a => `<div class="text-red-600">❌ ${a}</div>`).join('');
    snapEl.innerHTML = deleted + disputing + negative || 'No data.';
  }

  const eduEl = document.getElementById('education');
  if (eduEl) {
    const edu = JSON.parse(localStorage.getItem('educationItems') || '[]');
    if (!edu.length) eduEl.textContent = 'No educational items.';
    else eduEl.innerHTML = edu.map(e => `<div class="news-item"><div class="font-medium">${e.account}</div><div>${e.text}</div></div>`).join('');
  }

  const docEl = document.getElementById('docList');
  if (docEl) {
    const docs = JSON.parse(localStorage.getItem('uploads') || '[]');
    if (!docs.length) docEl.textContent = 'No documents uploaded.';
    else docEl.innerHTML = docs.map(d => `<div class="news-item">${d.name || 'Document'} - ${d.status || 'uploaded'}</div>`).join('');
  }

  const debtForm = document.getElementById('debtForm');
  if (debtForm) {
    debtForm.addEventListener('submit', e => {
      e.preventDefault();
      const amount = parseFloat(document.getElementById('debtAmount').value);
      const rate = parseFloat(document.getElementById('debtRate').value) / 100 / 12;
      const payment = parseFloat(document.getElementById('debtPayment').value);
      const result = document.getElementById('debtResult');
      const months = Math.log(payment / (payment - amount * rate)) / Math.log(1 + rate);
      if (isFinite(months) && months > 0) result.textContent = `Approx ${Math.ceil(months)} months to payoff.`;
      else result.textContent = 'Payment too low to cover interest.';
    });
  }
});
