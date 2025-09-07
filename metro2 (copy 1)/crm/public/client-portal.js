/* public/client-portal.js */
const productTiers = [
  { deletions:150, score:780, name:'Wealth Builder', icon:'👑', class:'bg-gradient-to-r from-purple-400 to-pink-500 text-white', message:'Legendary status — mortgages, lines, and cards all bend in your favor. You’ve built true financial freedom.' },
  { deletions:125, score:760, name:'Elite Borrower', icon:'🦸', class:'bg-red-100 text-red-700', message:'You’ve achieved elite borrower status — lenders see you as top-tier.' },
  { deletions:100, score:750, name:'Funding Power', icon:'🏆', class:'bg-yellow-200 text-yellow-800', message:'You’ve become a funding champion — major approvals are within reach.' },
  { deletions:75, score:740, name:'Travel & Rewards', icon:'✈️', class:'bg-indigo-100 text-indigo-700', message:'You now qualify for premium travel rewards and lifestyle cards.' },
  { deletions:50, score:720, name:'Credit Line Access', icon:'💼', class:'bg-accent-subtle', message:'Business and personal credit lines are opening up.' },
  { deletions:40, score:700, name:'Mortgage Ready', icon:'🏡', class:'bg-green-100 text-green-700', message:'You’re building toward homeownership — mortgage approvals are now within reach.' },
  { deletions:30, score:680, name:'Loan Lever', icon:'🏦', class:'bg-lime-100 text-lime-700', message:'Personal loan doors are opening — leverage your clean report.' },
  { deletions:20, score:650, name:'Prime Plastic', icon:'💳', class:'bg-cyan-100 text-cyan-700', message:'You’re climbing into prime cards with real rewards.' },
  { deletions:10, score:0, name:'Auto Access', icon:'🚗', class:'bg-orange-100 text-orange-700', message:'Now you’re positioned for auto financing approvals.' },
  { deletions:5, score:0, name:'Retail Ready', icon:'🛍️', class:'bg-emerald-100 text-emerald-700', message:'You’re ready for retail cards — momentum is building.' },
  { deletions:1, score:0, name:'Approval Spark', icon:'✅', class:'bg-emerald-100 text-emerald-700', message:'Your first approval spark — you’re clearing the way for credit opportunities.' },
  { deletions:0, score:0, name:'Secured Start', icon:'🔒', class:'bg-emerald-100 text-emerald-700', message:'You’ve planted the seed — secured cards are your first step to building credit.' },
];

function getProductTier(deletions, score){
  for(const tier of productTiers){
    if(deletions >= tier.deletions && (!tier.score || score >= tier.score)) return tier;
  }
  return productTiers[productTiers.length-1];
}

function renderProductTier(score){
  const el = document.getElementById('tierBadge');
  if(!el) return;
  const deletions = Number(localStorage.getItem('deletions') || 0);
  let scoreVal;
  if(score !== undefined){
    if(typeof score === 'object'){
      scoreVal = Number(score.current || score.transunion || score.tu || 0);
    } else {
      scoreVal = Number(score);
    }
  } else {
    const scoreData = JSON.parse(localStorage.getItem('creditScore') || '{"current":0}');
    scoreVal = Number(scoreData.current || scoreData.transunion || scoreData.tu || 0);
  }
  const tier = getProductTier(deletions, scoreVal);

  el.className = `hidden sm:flex items-center gap-2 rounded-full px-4 py-2 shadow-sm animate-fadeInUp ${tier.class}`;
  el.innerHTML = `<span class="text-xl">${tier.icon}</span><span class="font-semibold text-sm">${tier.name}</span>`;
  el.title = tier.message;
}

function renderScore(score){
  const widget = document.getElementById('creditScoreWidget');
  if (!widget) return;
  const tuEl = widget.querySelector('.tu');
  const exEl = widget.querySelector('.ex');
  const eqEl = widget.querySelector('.eq');
  const scoreConfetti = document.getElementById('scoreConfetti');
  const data = score || JSON.parse(localStorage.getItem('creditScore') || '{}');
  const tu = Number(data.transunion || data.tu || data.current || 0);
  const ex = Number(data.experian || data.exp || 0);
  const eq = Number(data.equifax || data.eq || 0);
  if (tuEl) tuEl.textContent = tu;
  if (exEl) exEl.textContent = ex;
  if (eqEl) eqEl.textContent = eq;
  const scores = [tu, ex, eq].filter(n => n > 0);
  const avg = scores.length ? scores.reduce((a,b)=>a+b,0) / scores.length : 0;
  const start = Number(data.start || 0);
  if (avg > start && scoreConfetti && window.lottie) {
    lottie.loadAnimation({
      container: scoreConfetti,
      renderer: 'svg',
      loop: false,
      autoplay: true,
      path: 'https://assets10.lottiefiles.com/packages/lf20_j1adxtyb.json'
    });
    setTimeout(() => { scoreConfetti.innerHTML = ''; }, 1500);
    const ms = document.getElementById('milestones');
    if (ms) ms.innerHTML = `<div class="news-item">🎉 Score increased by ${Math.round(avg - start)} points!</div>`;
  }
  renderProductTier(data);
}

function loadScores(){
  const score = JSON.parse(localStorage.getItem('creditScore') || '{}');
  renderScore(score);
}

document.addEventListener('DOMContentLoaded', () => {
  const idMatch = location.pathname.match(/\/portal\/(.+)$/);

  const consumerId = idMatch ? idMatch[1] : null;
  loadScores();

  const dash = document.getElementById('navDashboard');
  if (dash) dash.href = location.pathname;

  const mascotEl = document.getElementById('mascot');
  if (mascotEl && window.lottie) {
    lottie.loadAnimation({
      container: mascotEl,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      path: 'https://assets2.lottiefiles.com/packages/lf20_tusxd6ku.json'
    });
  }

  document.querySelectorAll('button, .btn').forEach(btn=>{
    btn.addEventListener('click',e=>{
      const circle=document.createElement('span');
      circle.className='ripple';
      const rect=btn.getBoundingClientRect();
      const size=Math.max(rect.width,rect.height);
      circle.style.width=circle.style.height=size+'px';
      circle.style.left=e.clientX-rect.left-size/2+'px';
      circle.style.top=e.clientY-rect.top-size/2+'px';
      btn.appendChild(circle);
      setTimeout(()=>circle.remove(),700);
    });
  });

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
    fetch('/api/settings')
      .then(r => r.json())
      .then(cfg => {
        const rssUrl = cfg.settings?.rssFeedUrl || 'https://hnrss.org/frontpage';
        const apiUrl = 'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(rssUrl);
        return fetch(apiUrl);
      })
      .then(r => r.json())
      .then(data => {
        const items = data.items || [];
        if (!items.length) {
          feedEl.textContent = 'No news available.';
          return;
        }
        feedEl.innerHTML = items.slice(0,5).map(item => `
          <div class="news-item"><a href="${item.link}" target="_blank" class="flex items-center gap-1">${item.title}<span class="wiggle-arrow">↗</span></a></div>
        `).join('');
      })
      .catch(err => {
        console.error('Failed to load news feed', err);
        feedEl.textContent = 'Failed to load news.';
      });
  }

  window.addEventListener('storage', e => {
    if (e.key === 'creditScore') loadScores();
  });
  const _setItem = localStorage.setItem;
  localStorage.setItem = function(key, value) {
    _setItem.apply(this, arguments);
    if (key === 'creditScore') loadScores();
  };


  const timeline = JSON.parse(localStorage.getItem('disputeTimeline') || '[]');
  const timelineEl = document.getElementById('timeline');
  if (timelineEl) {
    if (!timeline.length) {
      const empty = document.getElementById('timelineEmpty');
      if (empty && window.lottie) {
        lottie.loadAnimation({
          container: empty,
          renderer: 'svg',
          loop: true,
          autoplay: true,
          path: 'https://assets2.lottiefiles.com/packages/lf20_fyye8suv.json'
        });
      }
    } else {
      const tt = document.getElementById('timelineText');
      if (tt) tt.remove();
      const te = document.getElementById('timelineEmpty');
      if (te) te.remove();
      timelineEl.innerHTML = timeline.map(t => `<div class="timeline-item"><span class="font-medium">${t.account}</span> - ${t.stage}</div>`).join('');
    }
  }

  const summaryEl = document.getElementById('disputeSummary');
  if(summaryEl){
    const perRound = 10;
    if(timeline.length){
      const rounds = Math.ceil(timeline.length / perRound);
      summaryEl.textContent = `${timeline.length} items across ${rounds} round${rounds===1?'':'s'} (${perRound} per round)`;
    } else {
      summaryEl.textContent = 'No disputes yet.';
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
  const mailSection = document.getElementById('mailSection');
  const mailWaiting = document.getElementById('mailWaiting');
  const mailMailed = document.getElementById('mailMailed');
  const mailTabWaiting = document.getElementById('mailTabWaiting');
  const mailTabMailed = document.getElementById('mailTabMailed');
  const tradelinesSection = document.getElementById('tradelinesSection');
  const tradelineList = document.getElementById('tradelineList');
  const tradelineSearch = document.getElementById('tradelineSearch');
  const tradelineSort = document.getElementById('tradelineSort');
  let allTradelines = [];
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

  function loadMail(){
    if (!(mailWaiting && mailMailed && consumerId)) return;
    fetch(`/api/consumers/${consumerId}/state`)
      .then(r=>r.json())
      .then(data=>{
        const events = data.state?.events || [];
        const files = data.state?.files || [];
        const mailEvents = events.filter(e=>e.type==='letters_portal_sent');
        const mailedSet = new Set(JSON.parse(localStorage.getItem('mailedLetters')||'[]'));
        const waiting=[], mailed=[];
        for(const ev of mailEvents){
          const jobId = ev.payload?.jobId || '';
          const stored = (ev.payload?.file||'').split('/').pop();
          const meta = files.find(f=>f.storedName===stored);
          const name = meta?.originalName || `Letters ${jobId}`;
          const rec = { jobId, name, url: ev.payload?.file || '#', file: stored };
          if(mailedSet.has(stored)) mailed.push(rec); else waiting.push(rec);
        }
        renderMailList(mailWaiting, waiting, true);
        renderMailList(mailMailed, mailed, false);
      })
      .catch(()=>{
        mailWaiting.textContent='Failed to load letters.';
        mailMailed.textContent='Failed to load letters.';
      });
  }

  function esc(str){ return String(str).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

  function renderMailList(el, items, allowMail){
    if(!el) return;
    if(!items.length){ el.innerHTML='<div class="muted text-sm">No letters.</div>'; return; }
    el.innerHTML = items.map(it=>`<div class="glass card tl-card flex items-center justify-between"><div class="font-medium">${esc(it.name)}</div><div class="flex gap-2"><a class="btn text-xs" href="${it.url}" target="_blank">View</a>${allowMail?`<button class="btn text-xs mail-act" data-job="${it.jobId}" data-file="${it.file}">Mail</button>`:''}</div></div>`).join('');
    if(allowMail){
      el.querySelectorAll('.mail-act').forEach(btn=>{
        btn.addEventListener('click',async ()=>{
          const jobId = btn.getAttribute('data-job');
          const file = btn.getAttribute('data-file');
          btn.disabled = true;
          try{
            const resp = await fetch(`/api/letters/${encodeURIComponent(jobId)}/mail`, {
              method:'POST',
              headers:{'Content-Type':'application/json'},
              body: JSON.stringify({ consumerId, file })
            });
            const data = await resp.json().catch(()=>({}));
            if(!data?.ok) throw new Error(data?.error || 'Failed to mail letters');
            const mailed = JSON.parse(localStorage.getItem('mailedLetters')||'[]');
            if(!mailed.includes(file)) mailed.push(file);
            localStorage.setItem('mailedLetters', JSON.stringify(mailed));
            loadMail();
          }catch(e){
            alert(e.message || 'Failed to mail letters.');
            btn.disabled = false;
          }
        });
      });
    }
  }

  if(mailTabWaiting && mailTabMailed){
    mailTabWaiting.addEventListener('click',()=>{
      mailTabWaiting.classList.add('active');
      mailTabMailed.classList.remove('active');
      if(mailWaiting) mailWaiting.classList.remove('hidden');
      if(mailMailed) mailMailed.classList.add('hidden');
    });
    mailTabMailed.addEventListener('click',()=>{
      mailTabMailed.classList.add('active');
      mailTabWaiting.classList.remove('active');
      if(mailMailed) mailMailed.classList.remove('hidden');
      if(mailWaiting) mailWaiting.classList.add('hidden');
    });
  }

  function renderTradelines(data){
    if(!tradelineList) return;
    if(!data.length){
      tradelineList.innerHTML = '<div class="muted text-sm">No tradelines found.</div>';
      return;
    }
    tradelineList.innerHTML = data.map(t=>`
      <div class="tradeline-item flex items-center justify-between p-2">

        <div>
          <div class="font-medium">${t.bank}</div>
          <div class="text-xs muted">${t.age} | $${t.limit} limit</div>
        </div>
        <div class="text-right">
          <div class="font-semibold">$${t.price}</div>
          <a href="${t.buy_link}" class="btn text-xs px-2 py-1">Buy</a>
        </div>
      </div>`).join('');
  }

  function filterTradelines(){
    let data = allTradelines.filter(t=>t.bank.toLowerCase().includes((tradelineSearch?.value||'').toLowerCase()));
    const sort = tradelineSort?.value;
    if(sort==='price-asc') data.sort((a,b)=>a.price-b.price);
    if(sort==='price-desc') data.sort((a,b)=>b.price-a.price);
    if(sort==='limit-asc') data.sort((a,b)=>a.limit-b.limit);
    if(sort==='limit-desc') data.sort((a,b)=>b.limit-a.limit);
    if(sort==='age-asc') data.sort((a,b)=>(a.age||'').localeCompare(b.age||''));
    if(sort==='age-desc') data.sort((a,b)=>(b.age||'').localeCompare(a.age||''));
    renderTradelines(data);
  }

  async function loadTradelines(){
    if(!tradelineList) return;
    if(allTradelines.length){ filterTradelines(); return; }
    try{
      const resp = await fetch('/api/tradelines');
      const data = await resp.json();
      allTradelines = data.tradelines || [];
      filterTradelines();
    }catch(e){
      tradelineList.innerHTML = '<div class="muted text-sm">Failed to load tradelines.</div>';
    }
  }

  if(tradelineSearch) tradelineSearch.addEventListener('input', filterTradelines);
  if(tradelineSort) tradelineSort.addEventListener('change', filterTradelines);

  const goalBtn = document.getElementById('btnGoal');
  if(goalBtn){
    const confettiEl = document.getElementById('confetti');
    const burstEl = document.getElementById('goalBurst');
    goalBtn.addEventListener('click', () => {
      if(confettiEl){
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
      }
      if(burstEl && window.lottie){
        lottie.loadAnimation({
          container: burstEl,
          renderer: 'svg',
          loop: false,
          autoplay: true,
          path: 'https://assets7.lottiefiles.com/packages/lf20_jei1c95b.json'
        }).addEventListener('complete',()=>{burstEl.innerHTML='';});

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
      .then(r => {
        if (!r.ok) throw new Error('Network response was not ok');
        return r.text();
      })
      .then(text => {
        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          throw new Error('Invalid JSON');
        }
        const msgs = data.messages || [];
        if (messageBanner) {
          const hostMsg = msgs.find(m => m.payload?.from && m.payload.from !== 'client');
          if (hostMsg) {
            const prefix = hostMsg.payload?.from ? hostMsg.payload.from + ': ' : '';
            messageBanner.textContent = prefix + (hostMsg.payload?.text || '');
            messageBanner.classList.remove('hidden');
          } else {
            messageBanner.classList.add('hidden');
          }
        }
        if (!msgs.length) {
          messageList.innerHTML = '<div class="muted">No messages.</div>';
        } else {
          messageList.innerHTML = msgs.map(m => {
            const fromUser = m.payload?.from;
            const isClient = fromUser === 'client';
            const cls = isClient ? 'msg-client' : 'msg-host';
            const name = isClient ? 'You' : fromUser || 'Host';
            const when = new Date(m.at).toLocaleString();
            return `<div class="message ${cls}"><div class="text-xs muted">${name} • ${when}</div><div>${escapeHtml(m.payload?.text || '')}</div></div>`;
          }).join('');
        }
      })
      .catch(err => {
        console.error('Failed to load messages', err);
        messageList.innerHTML = '<div class="muted">Failed to load messages. <a href="#" id="retryMessages">Retry</a></div>';
        const retry = document.getElementById('retryMessages');
        if (retry) retry.addEventListener('click', e => { e.preventDefault(); loadMessages(); });
      });
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
    if (mailSection) mailSection.classList.add('hidden');
    if (tradelinesSection) tradelinesSection.classList.add('hidden');

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
    } else if (hash === '#mailSection' && mailSection) {
      mailSection.classList.remove('hidden');
      loadMail();
    } else if (hash === '#tradelines' && tradelinesSection) {
      tradelinesSection.classList.remove('hidden');
      loadTradelines();
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
