/* public/dashboard.js */
function escapeHtml(s){ return String(s||"").replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c])); }
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
  const titleEl = document.getElementById('dashNoteTitle');
  const selectEl = document.getElementById('noteSelect');
  const saveBtn = document.getElementById('dashSaveNote');
  if (noteEl && saveBtn && titleEl && selectEl) {
    let notes = JSON.parse(localStorage.getItem('dashNotes') || '[]');
    let selectedIdx = -1;
    function renderNotes(){
      const opts = ['<option value="">Select saved note...</option>'];
      notes.forEach((n,i)=> opts.push(`<option value="${i}">${escapeHtml(n.title)}</option>`));
      selectEl.innerHTML = opts.join('');
      if(selectedIdx >= 0) selectEl.value = String(selectedIdx);
    }
    renderNotes();
    selectEl.addEventListener('change', () => {
      selectedIdx = selectEl.value === '' ? -1 : Number(selectEl.value);
      if(selectedIdx === -1){ titleEl.value = ''; noteEl.value = ''; return; }
      const n = notes[selectedIdx];
      titleEl.value = n.title;
      noteEl.value = n.content;
    });

    function saveNote(){
      const title = titleEl.value.trim() || 'Untitled';
      const content = noteEl.value;
      if(selectedIdx >= 0){
        notes[selectedIdx] = { title, content };
      } else {
        notes.push({ title, content });
        selectedIdx = notes.length - 1;
      }
      localStorage.setItem('dashNotes', JSON.stringify(notes));
      renderNotes();
    }

    saveBtn.addEventListener('click', () => {
      saveNote();
    });

    let autoSaveTimer;
    function scheduleAutoSave(){
      clearTimeout(autoSaveTimer);
      autoSaveTimer = setTimeout(saveNote, 1000);
    }
    noteEl.addEventListener('input', scheduleAutoSave);
    titleEl.addEventListener('input', scheduleAutoSave);
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
      set('dashLeads', leads.filter(l=>l.status==='new').length);
      set('dashClients', consumers.length);
      set('dashSales', fmt(totalSales));
      set('dashPayments', fmt(totalPaid));

      const completedLeads = leads.filter(l=>l.status==='completed').length;
      const droppedLeads = leads.filter(l=>l.status==='dropped').length;
      const completedClients = consumers.filter(c=>c.status==='completed').length;
      const droppedClients = consumers.filter(c=>c.status==='dropped').length;
      const retDen = completedLeads + completedClients + droppedLeads + droppedClients;
      const retention = retDen ? ((completedLeads + completedClients)/retDen*100) : 0;
      const convDen = leads.length;
      const conversion = convDen ? (completedLeads/convDen*100) : 0;
      set('dashRetention', retention.toFixed(1)+"%");
      const convEl = document.getElementById('dashConversion');
      if(convEl) convEl.textContent = conversion.toFixed(1)+"%";

    })
    .catch(err=> console.error('Failed to load dashboard stats', err));
});
