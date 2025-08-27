/* public/client-portal.js */
document.addEventListener('DOMContentLoaded', () => {
  const idMatch = location.pathname.match(/\/portal\/(.+)$/);

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
    const negative = (snap.negative || []).map(a => `<div class="text-red-600">❌ ${a}</div>`).join('');
    snapEl.innerHTML = negative || 'No negative items.';
  }

  const eduEl = document.getElementById('education');
  if (eduEl) {
    const edu = JSON.parse(localStorage.getItem('educationItems') || '[]');
    if (!edu.length) eduEl.textContent = 'No educational items.';
    else eduEl.innerHTML = edu.map(e => `<div class="news-item"><div class="font-medium">${e.account}</div><div>${e.text}</div></div>`).join('');
  }

  const docEl = document.getElementById('docList');
  const messageBanner = document.getElementById('messageBanner');
  const messageSection = document.getElementById('messageSection');
  const messageList = document.getElementById('messageList');
  const messageForm = document.getElementById('messageForm');
  function loadDocs(){
    if (!(docEl && consumerId)) return;
    fetch(`/api/consumers/${consumerId}/state`)
      .then(r => r.json())
      .then(data => {
        const docs = data.state?.files || [];
        if (!docs.length) docEl.textContent = 'No documents uploaded.';
        else docEl.innerHTML = docs.map(d => `<div class="news-item"><a href="/api/consumers/${consumerId}/state/files/${d.storedName}" target="_blank">${d.originalName}</a></div>`).join('');
      })
      .catch(() => { docEl.textContent = 'Failed to load documents.'; });
  }
  loadDocs();
  loadMessages();

  const goalBtn = document.getElementById('btnGoal');
  if(goalBtn){
    const confettiEl = document.getElementById('confetti');
    goalBtn.addEventListener('click', () => {
      if(!confettiEl) return;
      for(let i=0;i<20;i++){
        const s=document.createElement('span');
        s.className='confetti-piece';
        const tx=(Math.random()-0.5)*200;
        const ty=(-Math.random()*150-50);
        s.style.setProperty('--tx', tx+'px');
        s.style.setProperty('--ty', ty+'px');
        s.style.backgroundColor=`hsl(${Math.random()*360},80%,60%)`;
        confettiEl.appendChild(s);
        setTimeout(()=>s.remove(),1200);
      }
    });
  }

  const debtForm = document.getElementById('debtForm');
  if (debtForm) {
    debtForm.addEventListener('submit', e => {
      e.preventDefault();
      const amount = parseFloat(document.getElementById('debtAmount').value);
      const rate = parseFloat(document.getElementById('debtRate').value) / 100 / 12;
      const months = parseFloat(document.getElementById('debtMonths').value);
      const result = document.getElementById('debtResult');
      const payment = amount * rate / (1 - Math.pow(1 + rate, -months));
      if (isFinite(payment) && payment > 0) result.textContent = `Monthly payment approx $${payment.toFixed(2)}`;
      else result.textContent = 'Invalid values.';
    });
  }

  function loadMessages(){
    if (!(consumerId && messageList)) return;
    fetch(`/api/messages/${consumerId}`)
      .then(r => r.json())
      .then(data => {
        const msgs = data.messages || [];
        if (messageBanner) {
          if (msgs.length) {
            messageBanner.textContent = msgs[0].payload?.text || '';
            messageBanner.classList.remove('hidden');
          } else {
            messageBanner.classList.add('hidden');
          }
        }
        if (!msgs.length) {
          messageList.innerHTML = '<div class="muted">No messages.</div>';
        } else {
          messageList.innerHTML = msgs.map(m => {
            const from = m.payload?.from === 'host' ? 'msg-host' : 'msg-client';
            const when = new Date(m.at).toLocaleString();
            return `<div class="${from} p-2 rounded"><div class="text-xs muted">${when}</div><div>${m.payload?.text||''}</div></div>`;
          }).join('');
        }
      })
      .catch(() => { messageList.innerHTML = '<div class="muted">Failed to load messages.</div>'; });
  }

  if (messageForm && consumerId) {
    messageForm.addEventListener('submit', e => {
      e.preventDefault();
      const input = document.getElementById('messageInput');
      const text = input.value.trim();
      if (!text) return;
      fetch(`/api/messages/${consumerId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from: 'client', text }) })
        .then(r => r.json())
        .then(() => { input.value = ''; loadMessages(); });
    });
  }

  // Handle section navigation
  const portalMain = document.getElementById('portalMain');
  const uploadSection = document.getElementById('uploadSection');
  const educationSection = document.getElementById('educationSection');
  const documentSection = document.getElementById('documentSection');
  function showSection(hash){
    if (portalMain) portalMain.classList.add('hidden');
    if (uploadSection) uploadSection.classList.add('hidden');
    if (messageSection) messageSection.classList.add('hidden');
    if (educationSection) educationSection.classList.add('hidden');
    if (documentSection) documentSection.classList.add('hidden');

    if (hash === '#uploads' && uploadSection) {
      uploadSection.classList.remove('hidden');
    } else if (hash === '#messages' && messageSection) {
      messageSection.classList.remove('hidden');
      loadMessages();
    } else if (hash === '#educationSection' && educationSection) {
      educationSection.classList.remove('hidden');
    } else if (hash === '#documentSection' && documentSection) {
      documentSection.classList.remove('hidden');
      loadDocs();
    } else if (portalMain) {
      portalMain.classList.remove('hidden');
    }
  }
  showSection(location.hash);
  window.addEventListener('hashchange', () => showSection(location.hash));

  const uploadForm = document.getElementById('uploadForm');
  if (uploadForm && consumerId) {
    uploadForm.addEventListener('submit', e => {
      e.preventDefault();
      const fileInput = document.getElementById('uploadFile');
      const status = document.getElementById('uploadStatus');
      if (!fileInput.files.length) return;
      const formData = new FormData();
      formData.append('file', fileInput.files[0]);
      const typeSel = document.getElementById('uploadType');
      if (typeSel) formData.append('type', typeSel.value || '');

      fetch(`/api/consumers/${consumerId}/state/upload`, { method: 'POST', body: formData })
        .then(r => r.json())
        .then(data => {
          if (data.ok) {
            status.textContent = 'Uploaded successfully.';
            fileInput.value = '';
            if (typeSel) typeSel.value = 'id';

            location.hash = '#';
            loadDocs();
          } else {
            status.textContent = 'Upload failed.';
          }
        })
        .catch(() => { status.textContent = 'Upload failed.'; });
    });
  }

});
