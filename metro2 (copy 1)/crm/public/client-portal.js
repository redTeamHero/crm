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

  el.className = `order-3 sm:order-2 flex w-full sm:w-auto items-center gap-2 rounded-full px-4 py-2 shadow-sm animate-fadeInUp ${tier.class}`;
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

function renderTeamList(){
  const teamList = document.getElementById('teamList');
  if (!teamList) return;
  const team = JSON.parse(localStorage.getItem('teamMembers') || '[]');
  if (!team.length) {
    teamList.textContent = 'No team members added.';
  } else {
    teamList.innerHTML = team.map(m => {
      const role = m.role ? `<div class="text-xs muted">${m.role}${m.email? ' - ' + m.email : ''}</div>` : (m.email ? `<div class="text-xs muted">${m.email}</div>` : '');
      return `<div class="news-item"><div class="font-medium">${m.name}</div>${role}</div>`;
    }).join('');
  }
}

function initClientPortalNav(){
  const nav = document.getElementById('primaryNav');
  const toggle = document.getElementById('navToggle');
  if (!nav || !toggle) return;

  const updateLayout = () => {
    if (window.innerWidth >= 768) {
      nav.classList.remove('hidden');
      toggle.setAttribute('aria-expanded', 'true');
    } else {
      const hidden = nav.classList.contains('hidden');
      toggle.setAttribute('aria-expanded', hidden ? 'false' : 'true');
    }
  };

  toggle.addEventListener('click', () => {
    const nowHidden = nav.classList.toggle('hidden');
    toggle.setAttribute('aria-expanded', nowHidden ? 'false' : 'true');
  });

  nav.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth < 768) {
        nav.classList.add('hidden');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  });

  window.addEventListener('resize', updateLayout);
  updateLayout();
}

document.addEventListener('DOMContentLoaded', () => {
  const idMatch = location.pathname.match(/\/portal\/(.+)$/);

  const consumerId = idMatch ? decodeURIComponent(idMatch[1]) : null;
  if(!consumerId){
    const storedId = localStorage.getItem('clientId');
    if(storedId){
      location.replace(`/portal/${encodeURIComponent(storedId)}`);
      return;
    }
  } else {
    try {
      localStorage.setItem('clientId', consumerId);
    } catch {}
  }
  initClientPortalNav();
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

  renderTeamList();

  const stepEl = document.getElementById('currentStep');
  if (consumerId && stepEl) {
    const fetchStep = () => {
      fetch(`/api/consumers/${consumerId}/tracker`)
        .then(r => r.json())
        .then(({ steps = [], completed = {} }) => {
          if (!Array.isArray(steps) || !steps.length) {
            stepEl.textContent = 'No steps assigned yet.';
            return;
          }
          const idx = steps.findIndex(s => !completed[s]);
          if (idx === -1) {
            stepEl.textContent = `Completed • ${steps.length} step${steps.length === 1 ? '' : 's'}`;
          } else {
            stepEl.textContent = `Step ${idx + 1} of ${steps.length}: ${steps[idx]}`;
          }
        })
        .catch(() => { stepEl.textContent = 'Unknown'; });
    };
    fetchStep();
    setInterval(fetchStep, 30000);
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
    if (e.key === 'teamMembers') renderTeamList();
  });
  const _setItem = localStorage.setItem;
  localStorage.setItem = function(key, value) {
    _setItem.apply(this, arguments);
    if (key === 'creditScore') loadScores();
    if (key === 'teamMembers') renderTeamList();
  };

  const escape = window.escapeHtml || ((value) => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c] || c)));

  const items = JSON.parse(localStorage.getItem('itemsInDispute') || localStorage.getItem('disputeTimeline') || '[]');
  const itemsEl = document.getElementById('itemsInDispute');
  let negativeItems = [];
  try {
    if (Array.isArray(window.__NEGATIVE_ITEMS__)) {
      negativeItems = window.__NEGATIVE_ITEMS__;
    } else {
      negativeItems = JSON.parse(localStorage.getItem('negativeItems') || '[]');
    }
  } catch {
    negativeItems = [];
  }
  const disputeList = items.length ? items : negativeItems.map(item => ({
    account: item?.creditor || 'Negative Item',
    stage: `${(item?.violations || []).length} issue${(item?.violations || []).length === 1 ? '' : 's'} • S${item?.severity || 0}`,
  }));
  if (itemsEl) {
    if (!disputeList.length) {
      const empty = document.getElementById('itemsInDisputeEmpty');
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
      const tt = document.getElementById('itemsInDisputeText');
      if (tt) tt.remove();
      const te = document.getElementById('itemsInDisputeEmpty');
      if (te) te.remove();
      itemsEl.innerHTML = disputeList.map(t => `<div class="timeline-item"><span class="font-medium">${escape(t.account)}</span> - ${escape(t.stage)}</div>`).join('');
    }
  }

  const summaryEl = document.getElementById('itemsSummary');
  if(summaryEl){
    const perRound = 10;
    const sourceLength = disputeList.length;
    if(sourceLength){
      const rounds = Math.ceil(sourceLength / perRound);
      summaryEl.textContent = `${sourceLength} item${sourceLength === 1 ? '' : 's'} across ${rounds} round${rounds===1?'':'s'} (${perRound} per round)`;
    } else {
      summaryEl.textContent = 'No items in dispute.';
    }
  }

  const snapEl = document.getElementById('reportSnapshot');
  if (snapEl) {
    const snap = JSON.parse(localStorage.getItem('creditSnapshot') || '{}');
    const summary = Array.isArray(snap.summary) ? snap.summary : [];
    const totalIssues = Number.isFinite(snap.totalIssues) ? snap.totalIssues : 0;
    if(summary.length){
      const total = totalIssues || summary.reduce((sum, item) => sum + (item.issues || 0), 0);
      const headline = `<div class="text-xs muted">Tracking ${total} issue${total === 1 ? '' : 's'}</div>`;
      const list = summary.map(item => {
        const bureauText = (item.bureaus || []).length ? item.bureaus.join(', ') : 'Bureaus pending';
        const issues = item.issues || 0;
        return `<div class="news-item"><div class="font-medium">${escape(item.creditor)}</div><div class="text-xs muted">S${item.severity || 0} • ${issues} issue${issues === 1 ? '' : 's'} • ${escape(bureauText)}</div></div>`;
      }).join('');
      snapEl.innerHTML = headline + list;
    } else {
      snapEl.innerHTML = 'No negative items detected.';
    }
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
  const negativeItemsSection = document.getElementById('negativeItemsSection');
  const negativeItemList = document.getElementById('negativeItemList');
  const negativeItemSearch = document.getElementById('negativeItemSearch');
  const negativeItemSort = document.getElementById('negativeItemSort');
  const paymentSection = document.getElementById('paymentSection');
  const paymentList = document.getElementById('paymentList');
  const paymentEmpty = document.getElementById('paymentEmpty');
  const paymentTotal = document.getElementById('paymentTotal');
  const paymentError = document.getElementById('paymentError');
  let invoiceCache = [];
  let invoicesLoaded = false;
  let invoiceLoading = false;
  let invoiceRefreshTimer = null;
  function formatCurrency(amount){
    const value = Number(amount) || 0;
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(value);
    } catch {
      return `$${value.toFixed(2)}`;
    }
  }
  function formatDue(due){
    if(!due) return 'Due on receipt / Pago al recibir';
    const date = new Date(due);
    if(Number.isNaN(date.getTime())) return 'Due on receipt / Pago al recibir';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function isDueSoon(inv){
    if(inv.paid || !inv?.due) return false;
    const date = new Date(inv.due);
    if(Number.isNaN(date.getTime())) return false;
    const diff = date.getTime() - Date.now();
    return diff >= 0 && diff <= 7 * 24 * 60 * 60 * 1000;
  }
  function isOverdue(inv){
    if(inv.paid || !inv?.due) return false;
    const date = new Date(inv.due);
    if(Number.isNaN(date.getTime())) return false;
    return date.getTime() < Date.now();
  }
  function attachPayHandlers(){
    if(!paymentList) return;
    paymentList.querySelectorAll('.pay-invoice').forEach(btn => {
      btn.addEventListener('click', () => {
        const link = btn.getAttribute('data-pay-link');
        if(!link){
          alert('Payment link unavailable. Please contact support.');
          return;
        }
        window.open(link, '_blank', 'noopener');
      });
    });
  }
  function renderInvoices(invoices = []){
    invoiceCache = Array.isArray(invoices) ? invoices : [];
    invoicesLoaded = true;
    if(paymentTotal){
      const total = invoiceCache.filter(inv => !inv.paid).reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0);
      paymentTotal.textContent = formatCurrency(total);
    }
    if(!paymentList) return;
    if(!invoiceCache.length){
      paymentList.innerHTML = '';
      if(paymentEmpty) paymentEmpty.classList.remove('hidden');
      if(paymentError) paymentError.classList.add('hidden');
      return;
    }
    if(paymentEmpty) paymentEmpty.classList.add('hidden');
    const cards = invoiceCache.map(inv => {
      const amountText = formatCurrency(inv.amount);
      const dueText = formatDue(inv.due);
      const overdue = isOverdue(inv);
      const dueSoon = isDueSoon(inv);
      const badges = [
        inv.paid ? '<span class="badge badge-paid">Paid / Pagado</span>' : '<span class="badge badge-unpaid">Open / Abierto</span>',
        overdue ? '<span class="badge badge-unpaid">Overdue / Vencido</span>' : (dueSoon ? '<span class="badge badge-unpaid">Due soon / Próximo</span>' : '')
      ].filter(Boolean).join(' ');
      const payButton = inv.paid ? '' : (inv.payLink
        ? `<button type="button" class="btn text-sm pay-invoice" data-pay-link="${escape(inv.payLink)}" data-id="${escape(inv.id)}">Pay now / Pagar ahora</button>`
        : '<span class="text-xs muted">Contact support to add a payment link.</span>');
      const pdfUrl = inv.pdf ? `/api/consumers/${encodeURIComponent(consumerId)}/state/files/${encodeURIComponent(inv.pdf)}` : '';
      const pdfButton = inv.pdf ? `<a class="btn text-xs" target="_blank" rel="noopener" href="${pdfUrl}">Invoice PDF</a>` : '';
      return `
        <div class="glass card p-4 flex flex-col gap-3">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div class="font-semibold text-base">${escape(inv.desc || 'Invoice')}</div>
              <div class="text-xs muted">${escape(dueText)}</div>
            </div>
            <div class="text-right">
              <div class="text-lg font-semibold">${amountText}</div>
              <div class="flex flex-wrap gap-2 justify-end mt-1">${badges}</div>
            </div>
          </div>
          <div class="flex flex-wrap gap-2">
            ${payButton}
            ${pdfButton}
          </div>
        </div>
      `;
    }).join('');
    paymentList.innerHTML = cards;
    if(paymentError) paymentError.classList.add('hidden');
    attachPayHandlers();
  }
  function showInvoiceError(message){
    if(paymentList) paymentList.innerHTML = '';
    if(paymentEmpty) paymentEmpty.classList.add('hidden');
    if(paymentError){
      paymentError.textContent = message || 'Failed to load invoices. Please retry.';
      paymentError.classList.remove('hidden');
    }
  }
  function loadInvoices(options = {}){
    if(!(consumerId && paymentSection)) return;
    if(invoicesLoaded && !options.force){
      renderInvoices(invoiceCache);
      return;
    }
    if(invoiceLoading) return;
    invoiceLoading = true;
    fetch(`/api/invoices/${consumerId}`)
      .then(r => r.json())
      .then(data => {
        renderInvoices(Array.isArray(data.invoices) ? data.invoices : []);
      })
      .catch(() => {
        showInvoiceError('Could not load invoices. Refresh or contact support.');
      })
      .finally(() => {
        invoiceLoading = false;
      });
  }
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
  initNegativeItems();
  if (consumerId && paymentSection) {
    loadInvoices();
  }

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

  function pickHeadline(item){
    if (!item) return null;
    const hl = item.headline;
    if (hl && (hl.text || hl.title)) {
      const text = hl.text || [hl.category, hl.title].filter(Boolean).join(' – ');
      return {
        text,
        detail: hl.detail || '',
        severity: hl.severity || 0,
      };
    }
    const violations = Array.isArray(item.violations) ? [...item.violations] : [];
    violations.sort((a, b) => {
      const sev = (b.severity || 0) - (a.severity || 0);
      if (sev !== 0) return sev;
      return (a.title || '').localeCompare(b.title || '');
    });
    const top = violations.find(v => (v.title || '').trim());
    if (!top) return null;
    const text = [top.category, top.title].filter(Boolean).join(' – ');
    return {
      text,
      detail: top.detail || '',
      severity: top.severity || 0,
    };
  }

  function renderNegativeItems(data){
    if(!negativeItemList) return;
    if(!data.length){
      negativeItemList.innerHTML = '<div class="muted text-sm">No negative items detected yet.</div>';
      return;
    }
    negativeItemList.innerHTML = data.map(item => {
      const bureaus = (item.bureaus || []).map(b => `<span class="badge badge-bureau">${escape(b)}</span>`).join(' ');
      const accounts = Object.entries(item.account_numbers || {})
        .map(([bureau, number]) => `<span class="text-xs muted inline-block mr-2">${escape(bureau)} • ${escape(number)}</span>`)
        .join('');
      const severity = item.severity || 0;
      const headline = pickHeadline(item);
      const violationList = (item.violations || []).slice(0, 4).map(v => `
        <li class="flex gap-2 items-start">
          <span class="severity-tag severity-${v.severity || 0}">S${v.severity || 0}</span>
          <div>
            <div class="font-medium text-sm">${escape([v.category, v.title].filter(Boolean).join(' – ') || '')}</div>
            ${v.detail ? `<div class="text-xs muted">${escape(v.detail)}</div>` : ''}
            ${v.bureaus && v.bureaus.length ? `<div class="text-xs muted">${v.bureaus.map(b => escape(b)).join(', ')}</div>` : ''}
          </div>
        </li>
      `).join('');
      const remaining = Math.max(0, (item.violations || []).length - 4);
      return `
        <div class="glass card p-3">
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="font-semibold text-base">${escape(item.creditor || 'Unknown Creditor')}</div>
              <div class="text-xs muted mt-1">${bureaus || '—'}</div>
              ${accounts ? `<div class="mt-1">${accounts}</div>` : ''}
              ${headline ? `<div class="mt-3 p-2 rounded bg-slate-50 text-sm">
                <div class="font-medium">${escape(headline.text)}</div>
                ${headline.detail ? `<div class="text-xs muted mt-1">${escape(headline.detail)}</div>` : ''}
              </div>` : ''}
            </div>
            <div class="text-right">
              <div class="severity-tag severity-${severity}">S${severity}</div>
              <div class="text-xs muted mt-1">${(item.violations || []).length} violation${(item.violations || []).length === 1 ? '' : 's'}</div>
            </div>
          </div>
          <ul class="mt-3 space-y-2">${violationList || '<li class="text-sm muted">No Metro 2 violations detected.</li>'}</ul>
          ${remaining ? `<div class="text-xs muted mt-2">+${remaining} more violation${remaining === 1 ? '' : 's'} in this item.</div>` : ''}
        </div>
      `;
    }).join('');
  }

  function filterNegativeItems(){
    if(!negativeItemList) return;
    let data = Array.isArray(negativeItems) ? [...negativeItems] : [];
    const query = (negativeItemSearch?.value || '').toLowerCase();
    if(query){
      data = data.filter(item => {
        const creditor = (item.creditor || '').toLowerCase();
        const bureauMatch = (item.bureaus || []).some(b => (b || '').toLowerCase().includes(query));
        const violationMatch = (item.violations || []).some(v => (v.title || '').toLowerCase().includes(query));
        return creditor.includes(query) || bureauMatch || violationMatch;
      });
    }
    const sort = negativeItemSort?.value || 'severity-desc';
    if(sort === 'severity-asc'){
      data.sort((a,b)=> (a.severity || 0) - (b.severity || 0) || (a.creditor || '').localeCompare(b.creditor || ''));
    } else if(sort === 'creditor-asc'){
      data.sort((a,b)=> (a.creditor || '').localeCompare(b.creditor || ''));
    } else if(sort === 'creditor-desc'){
      data.sort((a,b)=> (b.creditor || '').localeCompare(a.creditor || ''));
    } else {
      data.sort((a,b)=> (b.severity || 0) - (a.severity || 0) || (a.creditor || '').localeCompare(b.creditor || ''));
    }
    renderNegativeItems(data);
  }

  function initNegativeItems(){
    if(!negativeItemList) return;
    filterNegativeItems();
  }

  if(negativeItemSearch) negativeItemSearch.addEventListener('input', filterNegativeItems);
  if(negativeItemSort) negativeItemSort.addEventListener('change', filterNegativeItems);

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
            return `<div class="message ${cls}"><div class="text-xs muted">${name} • ${when}</div><div>${esc(m.payload?.text || '')}</div></div>`;
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
    if (negativeItemsSection) negativeItemsSection.classList.add('hidden');
    if (paymentSection) paymentSection.classList.add('hidden');
    if (invoiceRefreshTimer) {
      clearInterval(invoiceRefreshTimer);
      invoiceRefreshTimer = null;
    }

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
    } else if (hash === '#payments' && paymentSection) {
      paymentSection.classList.remove('hidden');
      loadInvoices({ force: true });
      invoiceRefreshTimer = setInterval(() => loadInvoices({ force: true }), 60000);
    } else if (hash === '#negative-items' && negativeItemsSection) {
      negativeItemsSection.classList.remove('hidden');
      initNegativeItems();
    } else if (portalMain) {
      portalMain.classList.remove('hidden');
    }
  }
  showSection(location.hash);
  window.addEventListener('hashchange', () => showSection(location.hash));
  window.addEventListener('beforeunload', () => {
    if (invoiceRefreshTimer) {
      clearInterval(invoiceRefreshTimer);
      invoiceRefreshTimer = null;
    }
  });

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
